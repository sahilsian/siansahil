//! Stripe → this server, one endpoint per site (each site has its own Stripe account):
//!   POST /api/v1/stripe/{tenantId}/webhook
//!
//! Set up in each site's Stripe dashboard (Developers → Webhooks) with the event
//! `checkout.session.completed` (and `checkout.session.async_payment_succeeded`),
//! then put the endpoint's signing secret in `APP_STRIPE__WEBHOOK_SECRETS__<SITEID>`.
//!
//! For each paid checkout: records the order once, marks a limited edition sold out
//! when its last copy sells, and emails the site owner the buyer and shipping address.

use actix_web::{web, HttpRequest, HttpResponse};
use secrecy::ExposeSecret;
use serde_json::{json, Value};
use sqlx::PgPool;

use crate::content::{get_document, DocType, DocumentLookup, TenantId, SITE_KEY};
use crate::dashboard::orders::{address_lines, copies_sold, is_sold_out, record_order, NewOrder};
use crate::dashboard::prints::{display_name, PrintStripe};
use crate::dashboard::stripe::{verify_webhook_signature, Stripe};
use crate::email_client::{Email, EmailClient, EmailError};
use crate::routes::dashboard::DashboardConfig;
use crate::routes::error::ApiError;

/// How old a delivery may be (Stripe's own libraries use 5 minutes).
const TOLERANCE_SECS: i64 = 300;

#[tracing::instrument(name = "Stripe webhook", skip(request, body, pool, stripe, email_client, config))]
pub async fn receive(
    tenant_id: web::Path<String>,
    request: HttpRequest,
    body: web::Bytes,
    pool: web::Data<PgPool>,
    stripe: web::Data<Stripe>,
    email_client: web::Data<EmailClient>,
    config: web::Data<DashboardConfig>,
) -> Result<HttpResponse, ApiError> {
    let tenant = TenantId::parse(&tenant_id).map_err(ApiError::BadRequest)?;
    let Some(secret) = stripe.webhook_secret(&tenant) else {
        tracing::warn!("Webhook for a site with no webhook secret configured");
        return Err(ApiError::BadRequest("This site isn't set up to receive Stripe webhooks.".into()));
    };
    let signature = request.headers().get("Stripe-Signature").and_then(|v| v.to_str().ok()).unwrap_or_default();
    let now = chrono::Utc::now().timestamp();
    if !verify_webhook_signature(&body, signature, secret.expose_secret().trim(), now, TOLERANCE_SECS) {
        tracing::warn!("Rejected a Stripe webhook with a bad signature");
        return Err(ApiError::BadRequest("Invalid signature.".into()));
    }
    let event: Value = serde_json::from_slice(&body).map_err(|_| ApiError::BadRequest("Invalid JSON.".into()))?;

    let kind = event["type"].as_str().unwrap_or_default();
    let session = &event["data"]["object"];
    let paid = session["payment_status"].as_str() == Some("paid");
    match kind {
        "checkout.session.completed" | "checkout.session.async_payment_succeeded" if paid => {
            handle_paid_checkout(&pool, &email_client, &config, &tenant, session).await?;
        }
        // Anything else (incl. unpaid/pending checkouts) is acknowledged and ignored.
        _ => tracing::info!(kind, "Ignored Stripe event"),
    }
    Ok(HttpResponse::Ok().json(json!({ "received": true })))
}

async fn handle_paid_checkout(
    pool: &PgPool,
    email_client: &EmailClient,
    config: &DashboardConfig,
    tenant: &TenantId,
    session: &Value,
) -> Result<(), ApiError> {
    let mut tx = pool.begin().await?;
    // Which print: the payment link it was bought through, else the link's metadata.
    let link = session["payment_link"].as_str().unwrap_or_default();
    let mut print: Option<(String, Value)> = if link.is_empty() {
        None
    } else {
        sqlx::query_as(
            "SELECT key, data FROM documents WHERE tenant_id = $1 AND doc_type = 'print'
             AND data->'stripe'->>'paymentLinkId' = $2 FOR UPDATE",
        )
        .bind(tenant.as_ref())
        .bind(link)
        .fetch_optional(&mut *tx)
        .await?
    };
    if print.is_none() {
        if let Some(slug) = session["metadata"]["print"].as_str() {
            print = sqlx::query_as(
                "SELECT key, data FROM documents WHERE tenant_id = $1 AND doc_type = 'print' AND key = $2 FOR UPDATE",
            )
            .bind(tenant.as_ref())
            .bind(slug)
            .fetch_optional(&mut *tx)
            .await?;
        }
    }

    let name = match &print {
        Some((_, doc)) => {
            let painting: Option<(Value,)> =
                sqlx::query_as("SELECT data FROM documents WHERE tenant_id = $1 AND doc_type = 'product' AND key = $2")
                    .bind(tenant.as_ref())
                    .bind(doc["painting"].as_str().unwrap_or_default())
                    .fetch_optional(&mut *tx)
                    .await?;
            let painting_title = painting.as_ref().and_then(|(p,)| p["title"].as_str()).unwrap_or_default();
            display_name(doc, painting_title)
        }
        None => "Print (couldn't match it to a print on the site)".to_string(),
    };
    let Some(order) = NewOrder::from_session(session, print.as_ref().map(|(k, _)| k.clone()), name) else {
        return Err(ApiError::BadRequest("Checkout session without an id.".into()));
    };
    let Some(order_id) = record_order(&mut *tx, tenant, &order).await? else {
        tracing::info!(session = %order.stripe_session_id, "Checkout already recorded");
        return Ok(());
    };

    // The last copy of a limited edition: sold out from now on.
    if let Some((slug, mut doc)) = print {
        let sold = copies_sold(&mut *tx, tenant, &slug).await?;
        if is_sold_out(doc["editionSize"].as_u64(), sold) {
            doc["soldOut"] = json!(true);
            // Stripe closes a payment link at its purchase limit on its own; record that too.
            let mut state = PrintStripe::from_print(&doc);
            state.active = false;
            doc["stripe"] = serde_json::to_value(&state).expect("stripe state serializes");
            crate::content::upsert_document(&mut *tx, tenant, DocType::Print, &slug, &doc).await?;
            tracing::info!(print = %slug, sold, "Edition sold out");
        }
    }
    tx.commit().await?;
    tracing::info!(order = %order_id, "Print order recorded");

    if let Err(e) = notify_owner(pool, email_client, config, tenant, &order).await {
        tracing::error!(error = %e, "Recorded an order but failed to send the notification email");
    }
    Ok(())
}

fn money(cents: i64, currency: &str) -> String {
    format!("${}.{:02} {}", cents / 100, cents % 100, currency.to_uppercase())
}

async fn notify_owner(
    pool: &PgPool,
    email_client: &EmailClient,
    config: &DashboardConfig,
    tenant: &TenantId,
    order: &NewOrder,
) -> Result<(), String> {
    let site = match get_document(pool, tenant, DocType::Site, SITE_KEY).await.map_err(|e| e.to_string())? {
        DocumentLookup::Found(site) => site,
        _ => return Err("tenant has no site document".into()),
    };
    let settings = &site["integrations"]["email"];
    let Some(recipient) = settings["recipient"].as_str().filter(|r| !r.trim().is_empty()) else {
        return Err("site document has no integrations.email.recipient".into());
    };
    let from_name = settings["fromName"].as_str().unwrap_or("Website");

    let subject = format!("New order: {}", order.print_name);
    let address = order.shipping_address.as_ref().map(address_lines).unwrap_or_else(|| "(none given)".into());
    let mut lines = vec![
        format!("You sold a print: {}", order.print_name),
        String::new(),
        format!("Total paid: {}", money(order.amount_total_cents, &order.currency)),
    ];
    if order.shipping_cents > 0 {
        lines.push(format!("(includes shipping: {})", money(order.shipping_cents, &order.currency)));
    }
    lines.push(String::new());
    lines.push(format!("Buyer: {}", order.customer_name.as_deref().unwrap_or("(no name)")));
    if let Some(email) = &order.customer_email {
        lines.push(format!("Email: {email}"));
    }
    if let Some(phone) = &order.customer_phone {
        lines.push(format!("Phone: {phone}"));
    }
    lines.push(String::new());
    lines.push("Ship to:".into());
    lines.push(address);
    lines.push(String::new());
    lines.push(format!("Mark it shipped in your dashboard: {}/dashboard/orders", config.api_base_url));
    let text = lines.join("\n");

    email_client
        .send(&Email { from_name, to: recipient, subject: &subject, text: &text, reply_to: order.customer_email.as_deref() })
        .await
        .or_else(|e| match e {
            EmailError::Disabled => {
                tracing::info!("Email disabled; skipped order notification");
                Ok(())
            }
            other => Err(other.to_string()),
        })
}

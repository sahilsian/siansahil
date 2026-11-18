//! Public mailing-list signup:
//!   POST /api/v1/mailing-list/{tenantId}/subscribers   { "email": "..." }
//!
//! Stores the address, then (only for a new address) emails the tenant a
//! notification via Resend, using `integrations.email` from its site document.

use actix_web::{web, HttpResponse};
use serde_json::{json, Value};
use sqlx::PgPool;

use crate::content::{get_document, tenant_exists, DocType, DocumentLookup, TenantId, SITE_KEY};
use crate::email_client::{Email, EmailClient, EmailError};
use crate::mailing_list::{add_subscriber, SubscriberAddress};
use crate::routes::error::ApiError;

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SubscribeRequest {
    email: String,
}

#[tracing::instrument(name = "Mailing list signup", skip(body, pool, email_client))]
pub async fn subscribe(
    tenant_id: web::Path<String>,
    body: web::Json<SubscribeRequest>,
    pool: web::Data<PgPool>,
    email_client: web::Data<EmailClient>,
) -> Result<HttpResponse, ApiError> {
    let tenant = TenantId::parse(&tenant_id).map_err(ApiError::BadRequest)?;
    let email = SubscriberAddress::parse(&body.email).map_err(ApiError::BadRequest)?;
    if !tenant_exists(&pool, &tenant).await? {
        return Err(ApiError::TenantNotFound);
    }

    let is_new = add_subscriber(&pool, &tenant, &email).await?;
    if is_new {
        // Stored successfully: tell the tenant. A failed notification must not
        // fail the signup, so it's logged rather than returned.
        if let Err(e) = notify_tenant(&pool, &email_client, &tenant, &email).await {
            tracing::error!(error = %e, "Stored subscriber but failed to send the notification email");
        }
    }

    // Same response for new and existing addresses, so the endpoint can't be
    // used to discover who is on a list.
    Ok(HttpResponse::Ok().json(json!({ "status": "subscribed" })))
}

async fn notify_tenant(
    pool: &PgPool,
    email_client: &EmailClient,
    tenant: &TenantId,
    subscriber: &SubscriberAddress,
) -> Result<(), String> {
    let site = match get_document(pool, tenant, DocType::Site, SITE_KEY).await.map_err(|e| e.to_string())? {
        DocumentLookup::Found(site) => site,
        _ => return Err("tenant has no site document".into()),
    };
    let settings = &site["integrations"]["email"];
    let recipient = settings["recipient"].as_str().filter(|r| !r.trim().is_empty());
    let Some(recipient) = recipient else {
        return Err("site document has no integrations.email.recipient".into());
    };
    let from_name = settings["fromName"].as_str().unwrap_or("Website");
    let site_name = site_name(&site);

    let subject = format!("New mailing list subscriber: {}", subscriber.as_ref());
    let text = format!(
        "{} just joined the {} mailing list.\n\nSubscribed: {}",
        subscriber.as_ref(),
        site_name,
        chrono::Utc::now().format("%Y-%m-%d %H:%M UTC"),
    );

    email_client
        .send(&Email { from_name, to: recipient, subject: &subject, text: &text, reply_to: Some(subscriber.as_ref()) })
        .await
        .or_else(|e| match e {
            // Not an error worth alarming on locally: there's simply no key.
            EmailError::Disabled => {
                tracing::info!("Email disabled; skipped mailing list notification");
                Ok(())
            }
            other => Err(other.to_string()),
        })
}

fn site_name(site: &Value) -> &str {
    site["name"].as_str().unwrap_or("your site's")
}

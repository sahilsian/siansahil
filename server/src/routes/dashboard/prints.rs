//! Print CRUD. Each print is a `print` document linked to one painting and sold
//! through its own Stripe product and payment link (the website's Buy button).
//! Also the site's flat shipping charge, which every payment link includes.

use actix_web::{web, HttpResponse};
use serde_json::{json, Value};
use sqlx::{PgPool, Postgres, Transaction};

use super::store::{currency_of, main_image};
use super::{site_for, DashboardConfig, SignedIn};
use crate::content::{tenant_exists, upsert_document, DocType, DocumentKey, TenantId, SITE_KEY};
use crate::dashboard::orders::{copies_sold, is_sold_out};
use crate::dashboard::prints::{
    build_print, display_name, is_coming_soon, shipping_countries, shipping_of, success_url, sync, PrintInput, PrintStripe, Shipping,
    ShippingRate, Wanted,
};
use crate::dashboard::stripe::Stripe;
use crate::routes::error::ApiError;

/// GET /sites/{site}/prints → { prints, stripeConfigured, stripeTestMode, currency, shipping, ordersConnected }
pub async fn list(
    SignedIn(user): SignedIn,
    site: web::Path<String>,
    pool: web::Data<PgPool>,
    stripe: web::Data<Stripe>,
) -> Result<HttpResponse, ApiError> {
    let tenant = site_for(&user, &site)?;
    if !tenant_exists(&pool, &tenant).await? {
        return Err(ApiError::TenantNotFound);
    }
    let rows: Vec<(String, Value)> = sqlx::query_as(
        "SELECT doc_type, data FROM documents WHERE tenant_id = $1 AND doc_type IN ('print', 'site') ORDER BY key",
    )
    .bind(tenant.as_ref())
    .fetch_all(pool.get_ref())
    .await?;
    let site_doc = rows.iter().find(|(t, _)| t == "site").map(|(_, d)| d.clone()).unwrap_or(Value::Null);
    let prints: Vec<Value> = rows.into_iter().filter(|(t, _)| t == "print").map(|(_, d)| d).collect();
    Ok(HttpResponse::Ok().json(json!({
        "prints": prints,
        "stripeConfigured": stripe.account(&tenant).is_some(),
        "stripeTestMode": stripe.is_offline_for(&tenant),
        "currency": currency_of(&site_doc).to_uppercase(),
        "shipping": shipping_of(&site_doc).map(|s| json!({ "label": s.label, "amountCents": s.amount_cents })),
        // Sales are recorded only when the site's Stripe webhook secret is set.
        "ordersConnected": stripe.webhook_secret(&tenant).is_some(),
    })))
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateRequest {
    slug: String,
    print: PrintInput,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateRequest {
    print: PrintInput,
}

fn parse_slug(raw: &str) -> Result<DocumentKey, ApiError> {
    DocumentKey::parse(raw)
        .map_err(|_| ApiError::BadRequest("The web address name must be lowercase letters, numbers and dashes.".into()))
}

async fn load(
    tx: &mut Transaction<'_, Postgres>,
    tenant: &TenantId,
    doc_type: &str,
    key: &str,
) -> Result<Option<Value>, sqlx::Error> {
    let row: Option<(Value,)> =
        sqlx::query_as("SELECT data FROM documents WHERE tenant_id = $1 AND doc_type = $2 AND key = $3 FOR UPDATE")
            .bind(tenant.as_ref())
            .bind(doc_type)
            .bind(key)
            .fetch_optional(&mut **tx)
            .await?;
    Ok(row.map(|(d,)| d))
}

/// Validate, sync with Stripe, save. Returns the saved print and an optional note for the editor.
async fn save(
    pool: &PgPool,
    stripe: &Stripe,
    config: &DashboardConfig,
    tenant: &TenantId,
    slug: &DocumentKey,
    input: &PrintInput,
    creating: bool,
) -> Result<(Value, Option<String>), ApiError> {
    if !tenant_exists(pool, tenant).await? {
        return Err(ApiError::TenantNotFound);
    }
    let mut tx = pool.begin().await?;
    let existing = load(&mut tx, tenant, "print", slug.as_ref()).await?;
    match (&existing, creating) {
        (Some(_), true) => {
            return Err(ApiError::Conflict(format!(
                "A print with the web address '{}' already exists. Choose another.",
                slug.as_ref()
            )))
        }
        (None, false) => return Err(ApiError::NotFound("print", slug.as_ref().into())),
        _ => {}
    }
    let painting = load(&mut tx, tenant, "product", input.painting.trim())
        .await?
        .ok_or_else(|| ApiError::BadRequest("Choose which painting this print is of.".into()))?;
    let site_doc = load(&mut tx, tenant, "site", SITE_KEY).await?.unwrap_or(Value::Null);
    let mut doc = build_print(slug.as_ref(), input, existing.as_ref(), &config.api_base_url).map_err(ApiError::BadRequest)?;
    doc["currency"] = json!(currency_of(&site_doc));

    // A limited edition whose copies have all sold stays sold out (until its edition grows).
    let sold = copies_sold(&mut *tx, tenant, slug.as_ref()).await?;
    let sold_out = is_sold_out(input.edition_size.map(u64::from), sold);
    doc["soldOut"] = json!(sold_out);

    let mut state = PrintStripe::from_print(&doc);
    let mut note = None;
    let outcome = match stripe.account(tenant) {
        Some(account) => sync_print(&account, &mut state, &mut doc, &painting, &site_doc, tenant, slug.as_ref()).await,
        None => {
            if input.for_sale {
                note = Some(
                    "Saved. Stripe isn't connected for this site yet, so the website shows an Inquire button instead of Buy."
                        .to_string(),
                );
            }
            Ok(())
        }
    };
    if stripe.is_offline_for(tenant) && input.for_sale {
        note = Some("Saved in test mode: nothing was created in Stripe, so the website shows Inquire instead of Buy.".into());
    }
    if input.coming_soon && input.for_sale {
        note = Some("Saved as coming soon: the website shows it, but it can't be bought until you switch Coming soon off.".into());
    }
    if sold_out && input.for_sale {
        note = Some(format!("Saved. All {sold} copies have sold, so the website shows it as sold out."));
    }
    doc["stripe"] = serde_json::to_value(&state).expect("stripe state serializes");

    // Save what happened in Stripe even if a later step failed, so nothing is orphaned.
    upsert_document(&mut *tx, tenant, DocType::Print, slug.as_ref(), &doc).await?;
    tx.commit().await?;
    outcome.map_err(|e| {
        tracing::error!(error = %e, "Stripe sync failed part-way");
        ApiError::Upstream(format!("{e}. The print was saved; save again to finish setting up checkout."))
    })?;
    Ok((doc, note))
}

/// Make Stripe match one print: on sale (with the site's shipping and thank-you page)
/// when it's for sale and not sold out, otherwise taken down. Sets `doc.currency`.
async fn sync_print(
    account: &crate::dashboard::stripe::StripeAccount<'_>,
    state: &mut PrintStripe,
    doc: &mut Value,
    painting: &Value,
    site_doc: &Value,
    tenant: &TenantId,
    slug: &str,
) -> Result<(), crate::dashboard::stripe::StripeError> {
    let currency = currency_of(site_doc);
    doc["currency"] = json!(currency);
    let painting_title = painting["title"].as_str().unwrap_or_default().to_string();
    let name = display_name(doc, &painting_title);
    // The print's own first image, else the painting's.
    let image = main_image(doc, site_doc).or_else(|| main_image(painting, site_doc));
    let countries = shipping_countries(site_doc);
    let shipping = shipping_of(site_doc).and_then(|s| s.stripe).filter(|r| r.currency == currency);
    let success = success_url(site_doc);
    // Coming soon: shown on the website, but its payment link stays off until the drop.
    let sellable =
        doc["forSale"].as_bool().unwrap_or(false) && !doc["soldOut"].as_bool().unwrap_or(false) && !is_coming_soon(doc);
    let wanted = Wanted {
        name: &name,
        image: image.as_deref(),
        price_cents: doc["priceCents"].as_i64().unwrap_or_default(),
        currency: &currency,
        limit: doc["editionSize"].as_u64().map(|n| n as u32),
        shipping_countries: &countries,
        shipping_rate: shipping.as_ref().map(|r| r.rate_id.as_str()),
        success_url: success.as_deref(),
        tenant: tenant.as_ref(),
        slug,
    };
    // Only touch Stripe for a print that's been on sale, or should be now.
    if !sellable && !state.has_stripe_items() {
        return Ok(());
    }
    sync(account, state, sellable.then_some(&wanted)).await
}

/// POST /sites/{site}/prints { slug, print } → 201 { print, note? }
#[tracing::instrument(name = "Create print", skip(user, site, body, pool, stripe, config), fields(user = %user.username, site = %site, slug = %body.slug))]
pub async fn create(
    SignedIn(user): SignedIn,
    site: web::Path<String>,
    body: web::Json<CreateRequest>,
    pool: web::Data<PgPool>,
    stripe: web::Data<Stripe>,
    config: web::Data<DashboardConfig>,
) -> Result<HttpResponse, ApiError> {
    let tenant = site_for(&user, &site)?;
    let slug = parse_slug(&body.slug)?;
    let (print, note) = save(&pool, &stripe, &config, &tenant, &slug, &body.print, true).await?;
    tracing::info!("Print created");
    Ok(HttpResponse::Created().json(json!({ "print": print, "note": note })))
}

/// PUT /sites/{site}/prints/{slug} { print } → { print, note? }
#[tracing::instrument(name = "Update print", skip(user, path, body, pool, stripe, config), fields(user = %user.username, site = %path.0, slug = %path.1))]
pub async fn update(
    SignedIn(user): SignedIn,
    path: web::Path<(String, String)>,
    body: web::Json<UpdateRequest>,
    pool: web::Data<PgPool>,
    stripe: web::Data<Stripe>,
    config: web::Data<DashboardConfig>,
) -> Result<HttpResponse, ApiError> {
    let (site, slug) = path.into_inner();
    let tenant = site_for(&user, &site)?;
    let slug = parse_slug(&slug)?;
    let (print, note) = save(&pool, &stripe, &config, &tenant, &slug, &body.print, false).await?;
    tracing::info!("Print updated");
    Ok(HttpResponse::Ok().json(json!({ "print": print, "note": note })))
}

/// DELETE /sites/{site}/prints/{slug} → 204 (its Stripe product and link are archived)
#[tracing::instrument(name = "Delete print", skip(user, path, pool, stripe), fields(user = %user.username, site = %path.0, slug = %path.1))]
pub async fn delete(
    SignedIn(user): SignedIn,
    path: web::Path<(String, String)>,
    pool: web::Data<PgPool>,
    stripe: web::Data<Stripe>,
) -> Result<HttpResponse, ApiError> {
    let (site, slug) = path.into_inner();
    let tenant = site_for(&user, &site)?;
    let slug = parse_slug(&slug)?;
    let mut tx = pool.begin().await?;
    let Some(print) = load(&mut tx, &tenant, "print", slug.as_ref()).await? else {
        return Err(ApiError::NotFound("print", slug.as_ref().into()));
    };
    sqlx::query("DELETE FROM documents WHERE tenant_id = $1 AND doc_type = 'print' AND key = $2")
        .bind(tenant.as_ref())
        .bind(slug.as_ref())
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    // A deleted print can no longer be bought (best effort).
    let mut state = PrintStripe::from_print(&print);
    if state.has_stripe_items() {
        if let Some(account) = stripe.account(&tenant) {
            if let Err(e) = sync(&account, &mut state, None).await {
                tracing::error!(error = %e, "Couldn't archive a deleted print in Stripe; archive it by hand");
            }
        }
    }
    tracing::info!("Print deleted");
    Ok(HttpResponse::NoContent().finish())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShippingRequest {
    /// `null` = no shipping charge at checkout.
    shipping: Option<ShippingInput>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShippingInput {
    label: String,
    amount_cents: i64,
}

/// PUT /sites/{site}/shipping { shipping: { label, amountCents } | null }
///   → { shipping, updated, failed: [names], note? }
/// Sets the site's flat shipping charge, then remakes every print's payment link with it.
#[tracing::instrument(name = "Save shipping", skip(user, site, body, pool, stripe), fields(user = %user.username, site = %site))]
pub async fn save_shipping(
    SignedIn(user): SignedIn,
    site: web::Path<String>,
    body: web::Json<ShippingRequest>,
    pool: web::Data<PgPool>,
    stripe: web::Data<Stripe>,
) -> Result<HttpResponse, ApiError> {
    let tenant = site_for(&user, &site)?;
    if !tenant_exists(&pool, &tenant).await? {
        return Err(ApiError::TenantNotFound);
    }
    let wanted = match &body.shipping {
        None => None,
        Some(input) => {
            let label = input.label.trim();
            if label.is_empty() || label.chars().count() > 100 {
                return Err(ApiError::BadRequest("Give the shipping a name, like \"Shipping\" (up to 100 characters).".into()));
            }
            if !(0..=100_000).contains(&input.amount_cents) {
                return Err(ApiError::BadRequest("Shipping must be between $0 and $1,000.".into()));
            }
            Some((label.to_string(), input.amount_cents))
        }
    };

    let mut tx = pool.begin().await?;
    let mut site_doc = load(&mut tx, &tenant, "site", SITE_KEY).await?.ok_or(ApiError::TenantNotFound)?;
    let currency = currency_of(&site_doc);
    let old = shipping_of(&site_doc);
    let account = stripe.account(&tenant);
    // A rate made up in local test mode doesn't exist in Stripe: treat it as none.
    let old_rate = old
        .as_ref()
        .and_then(|s| s.stripe.clone())
        .filter(|r| !account.as_ref().is_some_and(|a| a.is_stale_id(&r.rate_id)));

    // A Stripe shipping rate can't be edited: make a new one when the charge changed.
    let new_shipping = match (&wanted, &account) {
        (None, _) => None,
        (Some((label, amount)), account) => {
            let same = old_rate.as_ref().filter(|r| &r.label == label && r.amount_cents == *amount && r.currency == currency);
            let rate = match (same, account) {
                (Some(rate), _) => Some(rate.clone()),
                (None, Some(account)) => {
                    let id = account.create_shipping_rate(label, *amount, &currency).await.map_err(|e| ApiError::Upstream(e.to_string()))?;
                    Some(ShippingRate { rate_id: id, label: label.clone(), amount_cents: *amount, currency: currency.clone() })
                }
                (None, None) => None,
            };
            Some(Shipping { label: label.clone(), amount_cents: *amount, stripe: rate })
        }
    };
    match &new_shipping {
        Some(s) => site_doc["store"]["shipping"] = serde_json::to_value(s).expect("shipping serializes"),
        None => {
            if let Some(store) = site_doc["store"].as_object_mut() {
                store.remove("shipping");
            }
        }
    }
    upsert_document(&mut *tx, &tenant, DocType::Site, SITE_KEY, &site_doc).await?;
    tx.commit().await?;

    // Every print's payment link now needs the new shipping option.
    let (updated, failed) = match &account {
        Some(account) => resync_all(&pool, account, &tenant, &site_doc).await?,
        None => (0, Vec::new()),
    };
    // The old rate is no longer offered anywhere.
    if let (Some(account), Some(old)) = (&account, &old_rate) {
        let still_used = new_shipping.as_ref().and_then(|s| s.stripe.as_ref()).is_some_and(|r| r.rate_id == old.rate_id);
        if !still_used {
            if let Err(e) = account.set_shipping_rate_active(&old.rate_id, false).await {
                tracing::warn!(error = %e, "Couldn't archive the old shipping rate");
            }
        }
    }

    let note = if !failed.is_empty() {
        Some(format!("Saved, but these prints couldn't be updated in Stripe: {}. Open each one and save it again.", failed.join(", ")))
    } else if account.is_none() {
        Some("Saved. Stripe isn't connected for this site yet, so it applies once it is.".to_string())
    } else {
        None
    };
    tracing::info!(updated, failed = failed.len(), "Shipping saved");
    Ok(HttpResponse::Ok().json(json!({
        "shipping": new_shipping.map(|s| json!({ "label": s.label, "amountCents": s.amount_cents })),
        "updated": updated,
        "failed": failed,
        "note": note,
    })))
}

/// Re-sync every print that's been in Stripe (e.g. after shipping changed).
/// Returns how many were updated and the names of any that failed.
async fn resync_all(
    pool: &PgPool,
    account: &crate::dashboard::stripe::StripeAccount<'_>,
    tenant: &TenantId,
    site_doc: &Value,
) -> Result<(usize, Vec<String>), ApiError> {
    let slugs: Vec<(String,)> = sqlx::query_as("SELECT key FROM documents WHERE tenant_id = $1 AND doc_type = 'print' ORDER BY key")
        .bind(tenant.as_ref())
        .fetch_all(pool)
        .await?;
    let mut updated = 0;
    let mut failed = Vec::new();
    for (slug,) in slugs {
        let mut tx = pool.begin().await?;
        let Some(mut doc) = load(&mut tx, tenant, "print", &slug).await? else { continue };
        let mut state = PrintStripe::from_print(&doc);
        if !state.has_stripe_items() {
            continue;
        }
        let painting = load(&mut tx, tenant, "product", doc["painting"].as_str().unwrap_or_default()).await?.unwrap_or(Value::Null);
        let outcome = sync_print(account, &mut state, &mut doc, &painting, site_doc, tenant, &slug).await;
        doc["stripe"] = serde_json::to_value(&state).expect("stripe state serializes");
        upsert_document(&mut *tx, tenant, DocType::Print, &slug, &doc).await?;
        tx.commit().await?;
        match outcome {
            Ok(()) => updated += 1,
            Err(e) => {
                tracing::error!(error = %e, print = %slug, "Couldn't update a print's payment link");
                failed.push(doc["title"].as_str().unwrap_or(&slug).to_string());
            }
        }
    }
    Ok((updated, failed))
}

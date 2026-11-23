//! Store routes: the site's print sizes, and putting an artwork on sale.

use actix_web::{web, HttpResponse};
use serde_json::{json, Value};
use sqlx::{PgPool, Postgres, Transaction};

use super::{site_for, SignedIn};
use crate::content::{tenant_exists, upsert_document, DocType, DocumentKey, TenantId, SITE_KEY};
use crate::dashboard::store::{self, ArtworkInfo, PrintSizeInput, ProductStore, Wanted};
use crate::dashboard::stripe::Stripe;
use crate::routes::error::ApiError;

async fn load_site(tx: &mut Transaction<'_, Postgres>, tenant: &TenantId) -> Result<Value, ApiError> {
    let row: Option<(Value,)> = sqlx::query_as(
        "SELECT data FROM documents WHERE tenant_id = $1 AND doc_type = 'site' AND key = $2 FOR UPDATE",
    )
    .bind(tenant.as_ref())
    .bind(SITE_KEY)
    .fetch_optional(&mut **tx)
    .await?;
    row.map(|(d,)| d).ok_or_else(|| ApiError::NotFound("site", SITE_KEY.into()))
}

pub(crate) fn currency_of(site: &Value) -> String {
    site["currency"].as_str().filter(|c| c.len() == 3).unwrap_or("cad").to_lowercase()
}

/// GET /sites/{site}/store → { stripeConfigured, currency, printSizes, originalSizeRate }
pub async fn settings(
    SignedIn(user): SignedIn,
    site: web::Path<String>,
    pool: web::Data<PgPool>,
    stripe: web::Data<Stripe>,
) -> Result<HttpResponse, ApiError> {
    let tenant = site_for(&user, &site)?;
    let mut tx = pool.begin().await?;
    let site_doc = load_site(&mut tx, &tenant).await?;
    tx.rollback().await?;
    Ok(HttpResponse::Ok().json(json!({
        "stripeConfigured": stripe.account(&tenant).is_some(),
        "stripeTestMode": stripe.is_offline_for(&tenant),
        "currency": currency_of(&site_doc).to_uppercase(),
        "printSizes": store::site_print_sizes(&site_doc),
        "originalSizeRate": store::original_size_rate(&site_doc),
        "originalSizePrints": store::original_size_prints_enabled(&site_doc),
    })))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SettingsRequest {
    print_sizes: Vec<PrintSizeInput>,
    /// Dollars per square inch for original-size prints. Omit to leave it as it is.
    #[serde(default)]
    original_size_rate: Option<f64>,
    /// Offer a print at each painting's own size automatically. Omit to leave it as it is.
    #[serde(default)]
    original_size_prints: Option<bool>,
}

/// PUT /sites/{site}/store { printSizes: [{ id?, label, priceCents }] } → saved settings.
/// Artworks already in the store pick up new prices when they're next updated.
#[tracing::instrument(name = "Save print sizes", skip(user, site, body, pool, stripe), fields(user = %user.username, site = %site))]
pub async fn save_settings(
    SignedIn(user): SignedIn,
    site: web::Path<String>,
    body: web::Json<SettingsRequest>,
    pool: web::Data<PgPool>,
    stripe: web::Data<Stripe>,
) -> Result<HttpResponse, ApiError> {
    let tenant = site_for(&user, &site)?;
    let sizes = store::validate_print_sizes(&body.print_sizes).map_err(ApiError::BadRequest)?;
    let mut tx = pool.begin().await?;
    let mut site_doc = load_site(&mut tx, &tenant).await?;
    if !site_doc["store"].is_object() {
        site_doc["store"] = json!({});
    }
    site_doc["store"]["printSizes"] = serde_json::to_value(&sizes).expect("print sizes serialize");
    if let Some(enabled) = body.original_size_prints {
        site_doc["store"]["originalSizePrints"] = serde_json::json!(enabled);
    }
    if let Some(rate) = body.original_size_rate {
        if !rate.is_finite() || !(0.01..=100.0).contains(&rate) {
            return Err(ApiError::BadRequest("The original-size price must be between $0.01 and $100 per square inch.".into()));
        }
        site_doc["store"]["originalSizePrintRate"] = serde_json::json!((rate * 1000.0).round() / 1000.0);
    }
    upsert_document(&mut *tx, &tenant, DocType::Site, SITE_KEY, &site_doc).await?;
    tx.commit().await?;
    tracing::info!(sizes = sizes.len(), "Print sizes saved");
    Ok(HttpResponse::Ok().json(json!({
        "stripeConfigured": stripe.account(&tenant).is_some(),
        "stripeTestMode": stripe.is_offline_for(&tenant),
        "currency": currency_of(&site_doc).to_uppercase(),
        "printSizes": sizes,
        "originalSizeRate": store::original_size_rate(&site_doc),
        "originalSizePrints": store::original_size_prints_enabled(&site_doc),
    })))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ListRequest {
    /// Visitors can inquire about the original (it has no price).
    #[serde(default)]
    original_available: bool,
    /// Which of the site's print sizes to sell.
    #[serde(default)]
    print_size_ids: Vec<String>,
}

/// Absolute address of the artwork's main image, for the Stripe product.
pub(crate) fn main_image(product: &Value, site: &Value) -> Option<String> {
    let url = product["images"][0]["url"].as_str()?;
    if url.starts_with("https://") {
        return Some(url.to_string());
    }
    let base = site["url"].as_str().filter(|u| u.starts_with("https://"))?;
    url.starts_with('/').then(|| format!("{}{url}", base.trim_end_matches('/')))
}

/// Sync one artwork with Stripe and save the result. Shared by list/unlist.
async fn apply(
    pool: &PgPool,
    stripe: &Stripe,
    tenant: &TenantId,
    slug: &DocumentKey,
    original_available: bool,
    print_size_ids: &[String],
    // false when taking everything off sale (nothing is wanted, not even the original-size print)
    selling: bool,
) -> Result<ProductStore, ApiError> {
    if !tenant_exists(pool, tenant).await? {
        return Err(ApiError::TenantNotFound);
    }

    let mut tx = pool.begin().await?;
    let site_doc = load_site(&mut tx, tenant).await?;
    let row: Option<(Value,)> = sqlx::query_as(
        "SELECT data FROM documents WHERE tenant_id = $1 AND doc_type = 'product' AND key = $2 FOR UPDATE",
    )
    .bind(tenant.as_ref())
    .bind(slug.as_ref())
    .fetch_optional(&mut *tx)
    .await?;
    let mut product = row.map(|(d,)| d).ok_or_else(|| ApiError::NotFound("artwork", slug.as_ref().into()))?;

    let sizes = store::site_print_sizes(&site_doc);
    // Prints are now their own documents (the Prints page). Per-artwork print sizes are
    // still accepted for older sites, but nothing is added automatically any more.
    let wanted_prints: Vec<_> = sizes.iter().filter(|s| print_size_ids.contains(&s.id)).cloned().collect();
    if let Some(unknown) = print_size_ids.iter().find(|id| !sizes.iter().any(|s| &s.id == *id)) {
        return Err(ApiError::BadRequest(format!("'{unknown}' isn't one of this site's print sizes.")));
    }

    let title = product["title"].as_str().unwrap_or(slug.as_ref()).to_string();
    let image = main_image(&product, &site_doc);
    let info = ArtworkInfo { tenant: tenant.as_ref(), slug: slug.as_ref(), title: &title, image: image.as_deref() };
    // The original is never a Stripe product (inquiry only), so a priced original from
    // before is archived. Stripe is only needed when there are prints to create or
    // something already in Stripe to change.
    let wanted = Wanted { original_price_cents: None, prints: &wanted_prints };
    let current = ProductStore::from_product(&product);
    let (mut synced, outcome) = if !wanted_prints.is_empty() || current.has_stripe_items() {
        let account = stripe.account(tenant).ok_or_else(|| {
            ApiError::BadRequest("Stripe isn't set up for this site yet, so prints can't be sold. Ask your website administrator to connect it.".into())
        })?;
        store::sync(&account, current, &wanted, &currency_of(&site_doc), &info).await
    } else {
        (ProductStore { currency: currency_of(&site_doc), ..current }, Ok(()))
    };
    synced.original_available = selling && original_available;

    // Save what happened in Stripe even if a later step failed, so nothing is orphaned.
    product["store"] = serde_json::to_value(&synced).expect("store serializes");
    upsert_document(&mut *tx, tenant, DocType::Product, slug.as_ref(), &product).await?;
    tx.commit().await?;

    outcome.map_err(|e| {
        tracing::error!(error = %e, "Stripe sync failed part-way");
        ApiError::Upstream(format!("{e}. Anything that did succeed was saved; try again to finish."))
    })?;
    Ok(synced)
}

/// PUT /sites/{site}/artworks/{slug}/store { originalPriceCents, printSizeIds } → { store }
/// "Add to store" / "Update store": creates or updates the Stripe products.
#[tracing::instrument(name = "List artwork in store", skip(user, path, body, pool, stripe), fields(user = %user.username, site = %path.0, slug = %path.1))]
pub async fn list(
    SignedIn(user): SignedIn,
    path: web::Path<(String, String)>,
    body: web::Json<ListRequest>,
    pool: web::Data<PgPool>,
    stripe: web::Data<Stripe>,
) -> Result<HttpResponse, ApiError> {
    let (site, slug) = path.into_inner();
    let tenant = site_for(&user, &site)?;
    let slug = DocumentKey::parse(&slug).map_err(ApiError::BadRequest)?;
    let synced = apply(&pool, &stripe, &tenant, &slug, body.original_available, &body.print_size_ids, true).await?;
    tracing::info!("Artwork listed in store");
    Ok(HttpResponse::Ok().json(json!({ "store": synced })))
}

/// DELETE /sites/{site}/artworks/{slug}/store → { store }: takes everything off sale
/// (the Stripe products are archived, not deleted).
#[tracing::instrument(name = "Remove artwork from store", skip(user, path, pool, stripe), fields(user = %user.username, site = %path.0, slug = %path.1))]
pub async fn unlist(
    SignedIn(user): SignedIn,
    path: web::Path<(String, String)>,
    pool: web::Data<PgPool>,
    stripe: web::Data<Stripe>,
) -> Result<HttpResponse, ApiError> {
    let (site, slug) = path.into_inner();
    let tenant = site_for(&user, &site)?;
    let slug = DocumentKey::parse(&slug).map_err(ApiError::BadRequest)?;
    let synced = apply(&pool, &stripe, &tenant, &slug, false, &[], false).await?;
    tracing::info!("Artwork removed from store");
    Ok(HttpResponse::Ok().json(json!({ "store": synced })))
}

/// Best effort: archive an artwork's Stripe products when it's deleted.
pub async fn archive_all(stripe: &Stripe, tenant: &TenantId, product: &Value) {
    let current = ProductStore::from_product(product);
    if !current.has_stripe_items() {
        return;
    }
    let Some(account) = stripe.account(tenant) else { return };
    let slug = product["slug"].as_str().unwrap_or_default();
    let title = product["title"].as_str().unwrap_or(slug);
    let info = ArtworkInfo { tenant: tenant.as_ref(), slug, title, image: None };
    let (_, outcome) =
        store::sync(&account, current.clone(), &Wanted { original_price_cents: None, prints: &[] }, &current.currency, &info).await;
    if let Err(e) = outcome {
        tracing::error!(error = %e, slug, "Couldn't archive a deleted artwork's Stripe products; archive them in Stripe by hand");
    }
}

//! Print CRUD. Each print is a `print` document linked to one painting and sold
//! through its own Stripe product and payment link (the website's Buy button).

use actix_web::{web, HttpResponse};
use serde_json::{json, Value};
use sqlx::{PgPool, Postgres, Transaction};

use super::store::{currency_of, main_image};
use super::{site_for, DashboardConfig, SignedIn};
use crate::content::{tenant_exists, upsert_document, DocType, DocumentKey, TenantId, SITE_KEY};
use crate::dashboard::prints::{build_print, display_name, shipping_countries, sync, PrintInput, PrintStripe, Wanted};
use crate::dashboard::stripe::Stripe;
use crate::routes::error::ApiError;

/// GET /sites/{site}/prints → { prints, stripeConfigured, stripeTestMode, currency }
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

    let currency = currency_of(&site_doc);
    doc["currency"] = json!(currency);
    let painting_title = painting["title"].as_str().unwrap_or_default().to_string();
    let name = display_name(&doc, &painting_title);
    // The print's own first image, else the painting's.
    let image = main_image(&doc, &site_doc).or_else(|| main_image(&painting, &site_doc));
    let countries = shipping_countries(&site_doc);
    let wanted = Wanted {
        name: &name,
        image: image.as_deref(),
        price_cents: input.price_cents,
        currency: &currency,
        limit: input.edition_size,
        shipping_countries: &countries,
        tenant: tenant.as_ref(),
        slug: slug.as_ref(),
    };

    let mut state = PrintStripe::from_print(&doc);
    let mut note = None;
    let outcome = match stripe.account(tenant) {
        Some(account) => sync(&account, &mut state, input.for_sale.then_some(&wanted)).await,
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

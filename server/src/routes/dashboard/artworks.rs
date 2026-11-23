//! Artwork CRUD. Artworks are stored as `product` documents. Curated collections
//! (hand-picked lists such as "gallery") are kept in step: the dashboard says
//! which curated collections an artwork belongs to, and its slug is added to
//! (top of the list) or removed from each one.

use actix_web::{web, HttpResponse};
use serde_json::{json, Value};
use sqlx::{PgPool, Postgres, Transaction};

use super::{site_for, DashboardConfig, SignedIn};
use crate::content::{tenant_exists, upsert_document, DocType, DocumentKey, TenantId};
use crate::dashboard::products::{build_product, ProductInput};
use crate::dashboard::stripe::Stripe;
use crate::routes::error::ApiError;

/// GET /sites/{site}/artworks → { artworks, collections, categories }
pub async fn list(
    SignedIn(user): SignedIn,
    site: web::Path<String>,
    pool: web::Data<PgPool>,
) -> Result<HttpResponse, ApiError> {
    let tenant = site_for(&user, &site)?;
    if !tenant_exists(&pool, &tenant).await? {
        return Err(ApiError::TenantNotFound);
    }
    let rows: Vec<(String, Value)> = sqlx::query_as(
        "SELECT doc_type, data FROM documents WHERE tenant_id = $1 AND doc_type IN ('product', 'collection') ORDER BY key",
    )
    .bind(tenant.as_ref())
    .fetch_all(pool.get_ref())
    .await?;

    let mut artworks = Vec::new();
    let mut collections = Vec::new();
    for (doc_type, data) in rows {
        if doc_type == "product" {
            artworks.push(data);
        } else {
            let curated = data["filter"]["type"] == "curated";
            collections.push(json!({
                "id": data["id"],
                "title": data["title"],
                "curated": curated,
                "productSlugs": if curated { data["filter"]["productSlugs"].clone() } else { json!([]) },
                "category": data["filter"]["category"],
            }));
        }
    }
    let mut categories: Vec<String> =
        artworks.iter().filter_map(|a| a["category"].as_str().map(str::to_string)).collect();
    categories.sort();
    categories.dedup();

    Ok(HttpResponse::Ok().json(json!({ "artworks": artworks, "collections": collections, "categories": categories })))
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateRequest {
    slug: String,
    artwork: ProductInput,
    #[serde(default)]
    collections: Vec<String>,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateRequest {
    artwork: ProductInput,
    #[serde(default)]
    collections: Vec<String>,
}

fn parse_slug(raw: &str) -> Result<DocumentKey, ApiError> {
    DocumentKey::parse(raw).map_err(|_| {
        ApiError::BadRequest("The web address name must be lowercase letters, numbers and dashes.".into())
    })
}

async fn load_product(
    tx: &mut Transaction<'_, Postgres>,
    tenant: &TenantId,
    slug: &str,
) -> Result<Option<Value>, sqlx::Error> {
    let row: Option<(Value,)> = sqlx::query_as(
        "SELECT data FROM documents WHERE tenant_id = $1 AND doc_type = 'product' AND key = $2 FOR UPDATE",
    )
    .bind(tenant.as_ref())
    .bind(slug)
    .fetch_optional(&mut **tx)
    .await?;
    Ok(row.map(|(data,)| data))
}

/// Put `slug` in exactly the curated collections listed in `wanted`
/// (`None` = take it out of all of them, for deletes).
async fn set_membership(
    tx: &mut Transaction<'_, Postgres>,
    tenant: &TenantId,
    slug: &str,
    wanted: Option<&[String]>,
) -> Result<(), ApiError> {
    let rows: Vec<(String, Value)> = sqlx::query_as(
        "SELECT key, data FROM documents WHERE tenant_id = $1 AND doc_type = 'collection' ORDER BY key FOR UPDATE",
    )
    .bind(tenant.as_ref())
    .fetch_all(&mut **tx)
    .await?;

    let curated: Vec<&String> =
        rows.iter().filter(|(_, d)| d["filter"]["type"] == "curated").map(|(k, _)| k).collect();
    for id in wanted.unwrap_or_default() {
        if !curated.contains(&id) {
            return Err(ApiError::BadRequest(format!("'{id}' isn't a list artworks can be added to.")));
        }
    }

    for (key, mut data) in rows {
        if data["filter"]["type"] != "curated" {
            continue;
        }
        let want = wanted.is_some_and(|w| w.contains(&key));
        let Some(slugs) = data["filter"]["productSlugs"].as_array_mut() else { continue };
        let has = slugs.iter().any(|s| s == slug);
        if want && !has {
            slugs.insert(0, json!(slug));
        } else if !want && has {
            slugs.retain(|s| s != slug);
        } else {
            continue;
        }
        upsert_document(&mut **tx, tenant, DocType::Collection, &key, &data).await?;
    }
    Ok(())
}

/// POST /sites/{site}/artworks → 201 { artwork }
#[tracing::instrument(name = "Create artwork", skip(user, site, body, pool, config), fields(user = %user.username, site = %site, slug = %body.slug))]
pub async fn create(
    SignedIn(user): SignedIn,
    site: web::Path<String>,
    body: web::Json<CreateRequest>,
    pool: web::Data<PgPool>,
    config: web::Data<DashboardConfig>,
) -> Result<HttpResponse, ApiError> {
    let tenant = site_for(&user, &site)?;
    let slug = parse_slug(&body.slug)?;
    if !tenant_exists(&pool, &tenant).await? {
        return Err(ApiError::TenantNotFound);
    }
    let doc = build_product(slug.as_ref(), &body.artwork, None, &config.api_base_url).map_err(ApiError::BadRequest)?;

    let mut tx = pool.begin().await?;
    if load_product(&mut tx, &tenant, slug.as_ref()).await?.is_some() {
        return Err(ApiError::Conflict(format!(
            "An artwork with the web address '{}' already exists. Choose another.",
            slug.as_ref()
        )));
    }
    upsert_document(&mut *tx, &tenant, DocType::Product, slug.as_ref(), &doc).await?;
    set_membership(&mut tx, &tenant, slug.as_ref(), Some(&body.collections)).await?;
    tx.commit().await?;
    tracing::info!("Artwork created");
    Ok(HttpResponse::Created().json(json!({ "artwork": doc })))
}

/// PUT /sites/{site}/artworks/{slug} → { artwork }
#[tracing::instrument(name = "Update artwork", skip(user, path, body, pool, config), fields(user = %user.username, site = %path.0, slug = %path.1))]
pub async fn update(
    SignedIn(user): SignedIn,
    path: web::Path<(String, String)>,
    body: web::Json<UpdateRequest>,
    pool: web::Data<PgPool>,
    config: web::Data<DashboardConfig>,
) -> Result<HttpResponse, ApiError> {
    let (site, slug) = path.into_inner();
    let tenant = site_for(&user, &site)?;
    let slug = parse_slug(&slug)?;

    let mut tx = pool.begin().await?;
    let existing = load_product(&mut tx, &tenant, slug.as_ref())
        .await?
        .ok_or_else(|| ApiError::NotFound("artwork", slug.as_ref().into()))?;
    let doc = build_product(slug.as_ref(), &body.artwork, Some(&existing), &config.api_base_url)
        .map_err(ApiError::BadRequest)?;
    upsert_document(&mut *tx, &tenant, DocType::Product, slug.as_ref(), &doc).await?;
    set_membership(&mut tx, &tenant, slug.as_ref(), Some(&body.collections)).await?;
    tx.commit().await?;
    tracing::info!("Artwork updated");
    Ok(HttpResponse::Ok().json(json!({ "artwork": doc })))
}

/// DELETE /sites/{site}/artworks/{slug} → 204
#[tracing::instrument(name = "Delete artwork", skip(user, path, pool, stripe), fields(user = %user.username, site = %path.0, slug = %path.1))]
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
    let Some(product) = load_product(&mut tx, &tenant, slug.as_ref()).await? else {
        return Err(ApiError::NotFound("artwork", slug.as_ref().into()));
    };
    sqlx::query("DELETE FROM documents WHERE tenant_id = $1 AND doc_type = 'product' AND key = $2")
        .bind(tenant.as_ref())
        .bind(slug.as_ref())
        .execute(&mut *tx)
        .await?;
    set_membership(&mut tx, &tenant, slug.as_ref(), None).await?;
    tx.commit().await?;
    // A deleted artwork can no longer be bought.
    super::store::archive_all(&stripe, &tenant, &product).await;
    tracing::info!("Artwork deleted");
    Ok(HttpResponse::NoContent().finish())
}

//! Public, read-only content endpoints for website heads. The tenant is in the URL:
//!   GET /api/v1/content/{tenantId}/site
//!   GET /api/v1/content/{tenantId}/pages/{slug}
//!   GET /api/v1/content/{tenantId}/products/{slug}
//!   GET /api/v1/content/{tenantId}/collections            (summaries: id, title, description)
//!   GET /api/v1/content/{tenantId}/collections/{id}?search=optional
//!   GET /api/v1/content/{tenantId}/forms/{id}
//!   GET /api/v1/content/{tenantId}/prints                 (prints for sale, with their painting)
//!   GET /api/v1/content/{tenantId}/prints/{slug}

use actix_web::http::header;
use actix_web::{web, HttpResponse};
use serde_json::{json, Map, Value};
use sqlx::PgPool;

use crate::content::{
    get_document, list_documents, product_summaries, referenced_documents, tenant_exists, CollectionQuery, DocType,
    DocumentKey, DocumentLookup, TenantId, SITE_KEY,
};
use crate::dashboard::prints::{public_print, size_label};
use crate::routes::error::ApiError;

/// Short shared caching: heads/CDNs reuse a response for a minute and may
/// serve a stale one for 5 more while refetching. Admin edits show up within ~1 min.
const CACHE_CONTROL: &str = "public, max-age=60, stale-while-revalidate=300";

#[derive(serde::Deserialize)]
pub struct CollectionParams {
    search: Option<String>,
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.route("/{tenant_id}/site", web::get().to(get_site))
        .route("/{tenant_id}/pages/{slug}", web::get().to(get_page))
        .route("/{tenant_id}/products/{slug}", web::get().to(get_product))
        .route("/{tenant_id}/collections", web::get().to(list_collections))
        .route("/{tenant_id}/collections/{id}", web::get().to(get_collection))
        .route("/{tenant_id}/forms/{id}", web::get().to(get_form))
        .route("/{tenant_id}/prints", web::get().to(list_prints))
        .route("/{tenant_id}/prints/{slug}", web::get().to(get_print));
}

fn parse_tenant(raw: &str) -> Result<TenantId, ApiError> {
    TenantId::parse(raw).map_err(ApiError::BadRequest)
}

fn parse_key(raw: &str) -> Result<DocumentKey, ApiError> {
    DocumentKey::parse(raw).map_err(ApiError::BadRequest)
}

fn ok(body: Value) -> HttpResponse {
    HttpResponse::Ok().insert_header((header::CACHE_CONTROL, CACHE_CONTROL)).json(body)
}

async fn fetch(pool: &PgPool, tenant: &TenantId, doc_type: DocType, key: &str) -> Result<Value, ApiError> {
    match get_document(pool, tenant, doc_type, key).await? {
        DocumentLookup::Found(doc) => Ok(doc),
        DocumentLookup::TenantNotFound => Err(ApiError::TenantNotFound),
        DocumentLookup::DocumentNotFound => Err(ApiError::NotFound(doc_type.as_str(), key.to_string())),
    }
}

#[tracing::instrument(name = "Get site", skip(pool))]
pub async fn get_site(tenant_id: web::Path<String>, pool: web::Data<PgPool>) -> Result<HttpResponse, ApiError> {
    let tenant = parse_tenant(&tenant_id)?;
    Ok(ok(fetch(&pool, &tenant, DocType::Site, SITE_KEY).await?))
}

/// The page, plus any forms/collections its blocks reference under
/// `included: { forms: {id: doc}, collections: {id: doc} }`.
#[tracing::instrument(name = "Get page", skip(pool))]
pub async fn get_page(path: web::Path<(String, String)>, pool: web::Data<PgPool>) -> Result<HttpResponse, ApiError> {
    let tenant = parse_tenant(&path.0)?;
    let slug = parse_key(&path.1)?;
    let mut page = fetch(&pool, &tenant, DocType::Page, slug.as_ref()).await?;

    let mut forms = Map::new();
    let mut collections = Map::new();
    for (doc_type, key) in referenced_documents(&page) {
        // A dangling reference shouldn't take the whole page down; skip it.
        if let DocumentLookup::Found(doc) = get_document(&pool, &tenant, doc_type, &key).await? {
            match doc_type {
                DocType::Form => forms.insert(key, doc),
                DocType::Collection => collections.insert(key, doc),
                _ => None,
            };
        } else {
            tracing::warn!(%key, doc_type = doc_type.as_str(), "Page references a missing document");
        }
    }
    page["included"] = json!({ "forms": forms, "collections": collections });

    Ok(ok(page))
}

#[tracing::instrument(name = "Get product", skip(pool))]
pub async fn get_product(path: web::Path<(String, String)>, pool: web::Data<PgPool>) -> Result<HttpResponse, ApiError> {
    let tenant = parse_tenant(&path.0)?;
    let slug = parse_key(&path.1)?;
    let mut product = fetch(&pool, &tenant, DocType::Product, slug.as_ref()).await?;
    // Prints of this painting that are for sale: { slug, title, size, sizeLabel, editionSize? }.
    let prints: Vec<Value> = list_documents(&pool, &tenant, DocType::Print)
        .await?
        .into_iter()
        .filter(|p| p["painting"] == slug.as_ref() && p["forSale"].as_bool().unwrap_or(false))
        .map(|p| {
            let mut out = json!({ "slug": p["slug"], "title": p["title"], "size": p["size"], "sizeLabel": size_label(&p["size"]) });
            if let Some(n) = p.get("editionSize") {
                out["editionSize"] = n.clone();
            }
            out
        })
        .collect();
    product["prints"] = Value::Array(prints);
    Ok(ok(product))
}

/// Prints for sale, each with its painting (`artwork: { slug, title, image }`) and
/// display `name`, ordered by painting then price. Prints whose painting is gone are skipped.
#[tracing::instrument(name = "List prints", skip(pool))]
pub async fn list_prints(tenant_id: web::Path<String>, pool: web::Data<PgPool>) -> Result<HttpResponse, ApiError> {
    let tenant = parse_tenant(&tenant_id)?;
    if !tenant_exists(&pool, &tenant).await? {
        return Err(ApiError::TenantNotFound);
    }
    let products = list_documents(&pool, &tenant, DocType::Product).await?;
    let mut prints: Vec<Value> = list_documents(&pool, &tenant, DocType::Print)
        .await?
        .iter()
        .filter(|p| p["forSale"].as_bool().unwrap_or(false))
        .filter_map(|p| products.iter().find(|a| a["slug"] == p["painting"]).map(|a| public_print(p, a)))
        .collect();
    prints.sort_by(|a, b| {
        let key = |p: &Value| (p["artwork"]["title"].as_str().unwrap_or_default().to_lowercase(), p["priceCents"].as_i64().unwrap_or_default());
        key(a).cmp(&key(b))
    });
    Ok(ok(Value::Array(prints)))
}

/// One print (even if no longer for sale: then it has no `buyUrl`).
#[tracing::instrument(name = "Get print", skip(pool))]
pub async fn get_print(path: web::Path<(String, String)>, pool: web::Data<PgPool>) -> Result<HttpResponse, ApiError> {
    let tenant = parse_tenant(&path.0)?;
    let slug = parse_key(&path.1)?;
    let print = fetch(&pool, &tenant, DocType::Print, slug.as_ref()).await?;
    let painting_slug = print["painting"].as_str().unwrap_or_default().to_string();
    let painting = match get_document(&pool, &tenant, DocType::Product, &painting_slug).await? {
        DocumentLookup::Found(doc) => doc,
        _ => return Err(ApiError::NotFound("print", slug.as_ref().to_string())),
    };
    Ok(ok(public_print(&print, &painting)))
}

/// Every collection as `[{ id, title, description }]`, ordered by id (for filter dropdowns).
#[tracing::instrument(name = "List collections", skip(pool))]
pub async fn list_collections(tenant_id: web::Path<String>, pool: web::Data<PgPool>) -> Result<HttpResponse, ApiError> {
    let tenant = parse_tenant(&tenant_id)?;
    if !tenant_exists(&pool, &tenant).await? {
        return Err(ApiError::TenantNotFound);
    }
    let summaries: Vec<Value> = list_documents(&pool, &tenant, DocType::Collection)
        .await?
        .iter()
        .map(|c| json!({ "id": c["id"], "title": c["title"], "description": c["description"] }))
        .collect();
    Ok(ok(Value::Array(summaries)))
}

/// The collection document plus `products`: summaries of matching products.
#[tracing::instrument(name = "Get collection", skip(pool, params))]
pub async fn get_collection(
    path: web::Path<(String, String)>,
    params: web::Query<CollectionParams>,
    pool: web::Data<PgPool>,
) -> Result<HttpResponse, ApiError> {
    let tenant = parse_tenant(&path.0)?;
    let id = parse_key(&path.1)?;
    let mut collection = fetch(&pool, &tenant, DocType::Collection, id.as_ref()).await?;
    let products = list_documents(&pool, &tenant, DocType::Product).await?;

    let query = CollectionQuery { search: params.search.as_deref() };
    collection["products"] = Value::Array(product_summaries(&collection, products, &query));
    Ok(ok(collection))
}

#[tracing::instrument(name = "Get form", skip(pool))]
pub async fn get_form(path: web::Path<(String, String)>, pool: web::Data<PgPool>) -> Result<HttpResponse, ApiError> {
    let tenant = parse_tenant(&path.0)?;
    let id = parse_key(&path.1)?;
    Ok(ok(fetch(&pool, &tenant, DocType::Form, id.as_ref()).await?))
}

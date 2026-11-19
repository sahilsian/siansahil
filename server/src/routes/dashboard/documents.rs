use actix_web::{web, HttpResponse};
use serde_json::{json, Value};
use sqlx::PgPool;

use super::{site_for, SignedIn};
use crate::content::{
    get_document_meta, list_document_meta, tenant_exists, upsert_document, DocType, DocumentKey, SITE_KEY,
};
use crate::dashboard::text_only::check_text_only;
use crate::routes::error::ApiError;

#[derive(serde::Deserialize)]
pub struct ListParams {
    #[serde(rename = "type")]
    doc_type: Option<String>,
}

/// GET /sites/{site}/documents?type=page → [{ type, key, version, updatedAt }]
pub async fn list(
    SignedIn(user): SignedIn,
    site: web::Path<String>,
    params: web::Query<ListParams>,
    pool: web::Data<PgPool>,
) -> Result<HttpResponse, ApiError> {
    let tenant = site_for(&user, &site)?;
    let doc_type = params.doc_type.as_deref().map(DocType::parse).transpose().map_err(ApiError::BadRequest)?;
    if !tenant_exists(&pool, &tenant).await? {
        return Err(ApiError::TenantNotFound);
    }
    Ok(HttpResponse::Ok().json(list_document_meta(&pool, &tenant, doc_type).await?))
}

fn parse_path(doc_type: &str, key: &str) -> Result<(DocType, DocumentKey), ApiError> {
    let doc_type = DocType::parse(doc_type).map_err(ApiError::BadRequest)?;
    let key = DocumentKey::parse(key).map_err(ApiError::BadRequest)?;
    if doc_type == DocType::Site && key.as_ref() != SITE_KEY {
        return Err(ApiError::BadRequest(format!("The site document's key must be '{SITE_KEY}'.")));
    }
    Ok((doc_type, key))
}

/// GET /sites/{site}/documents/{type}/{key} → { type, key, version, updatedAt, data }
pub async fn get(
    SignedIn(user): SignedIn,
    path: web::Path<(String, String, String)>,
    pool: web::Data<PgPool>,
) -> Result<HttpResponse, ApiError> {
    let (site, doc_type, key) = path.into_inner();
    let tenant = site_for(&user, &site)?;
    let (doc_type, key) = parse_path(&doc_type, &key)?;
    let row: Option<(Value,)> =
        sqlx::query_as("SELECT data FROM documents WHERE tenant_id = $1 AND doc_type = $2 AND key = $3")
            .bind(tenant.as_ref())
            .bind(doc_type.as_str())
            .bind(key.as_ref())
            .fetch_optional(pool.get_ref())
            .await?;
    let meta = get_document_meta(&pool, &tenant, doc_type, key.as_ref()).await?;
    let (Some((data,)), Some(meta)) = (row, meta) else {
        return Err(ApiError::NotFound(doc_type.as_str(), key.as_ref().into()));
    };
    let mut body = serde_json::to_value(meta).expect("DocumentMeta serializes");
    body["data"] = data;
    Ok(HttpResponse::Ok().json(body))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PutRequest {
    data: Value,
    /// The version the edit started from. If someone saved in the meantime, the
    /// save is refused instead of silently overwriting their changes.
    base_version: i32,
}

/// PUT /sites/{site}/documents/{type}/{key} — text-only changes to an existing document.
#[tracing::instrument(name = "Dashboard text edit", skip(user, path, body, pool), fields(user = %user.username, site = %path.0, doc_type = %path.1, key = %path.2))]
pub async fn put(
    SignedIn(user): SignedIn,
    path: web::Path<(String, String, String)>,
    body: web::Json<PutRequest>,
    pool: web::Data<PgPool>,
) -> Result<HttpResponse, ApiError> {
    let (site, doc_type, key) = path.into_inner();
    let tenant = site_for(&user, &site)?;
    let (doc_type, key) = parse_path(&doc_type, &key)?;
    if doc_type == DocType::Product {
        return Err(ApiError::BadRequest("Artworks are edited from the Gallery.".into()));
    }

    let mut tx = pool.begin().await?;
    let current: Option<(Value, i32)> = sqlx::query_as(
        "SELECT data, version FROM documents WHERE tenant_id = $1 AND doc_type = $2 AND key = $3 FOR UPDATE",
    )
    .bind(tenant.as_ref())
    .bind(doc_type.as_str())
    .bind(key.as_ref())
    .fetch_optional(&mut *tx)
    .await?;
    let Some((current, version)) = current else {
        return Err(ApiError::NotFound(doc_type.as_str(), key.as_ref().into()));
    };
    if version != body.base_version {
        return Err(ApiError::Conflict(
            "Someone else saved changes to this while you were editing. Reload to see them, then make your edits again."
                .into(),
        ));
    }
    check_text_only(&current, &body.data).map_err(ApiError::BadRequest)?;

    upsert_document(&mut *tx, &tenant, doc_type, key.as_ref(), &body.data).await?;
    tx.commit().await?;

    let meta = get_document_meta(&pool, &tenant, doc_type, key.as_ref())
        .await?
        .ok_or_else(|| ApiError::NotFound(doc_type.as_str(), key.as_ref().into()))?;
    tracing::info!(version = meta.version, "Saved text changes");
    let mut response = serde_json::to_value(meta).expect("DocumentMeta serializes");
    response["data"] = body.into_inner().data;
    Ok(HttpResponse::Ok().json(json!(response)))
}

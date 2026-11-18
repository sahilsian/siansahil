use actix_web::{web, HttpResponse};
use serde_json::{json, Value};
use sqlx::PgPool;

use crate::content::{
    delete_document, get_document, get_document_meta, list_document_meta, tenant_exists, upsert_document, DocType,
    DocumentKey, DocumentLookup, TenantId, UpsertOutcome, SITE_KEY,
};
use crate::routes::error::ApiError;

#[derive(serde::Deserialize)]
pub struct ListParams {
    /// Optional filter, e.g. `?type=page`.
    #[serde(rename = "type")]
    doc_type: Option<String>,
}

/// Parsed `{tenant_id}/documents/{type}/{key}` path.
struct DocPath {
    tenant: TenantId,
    doc_type: DocType,
    key: DocumentKey,
}

fn parse_doc_path((tenant, doc_type, key): (String, String, String)) -> Result<DocPath, ApiError> {
    let tenant = TenantId::parse(&tenant).map_err(ApiError::BadRequest)?;
    let doc_type = DocType::parse(&doc_type).map_err(ApiError::BadRequest)?;
    let key = DocumentKey::parse(&key).map_err(ApiError::BadRequest)?;
    if doc_type == DocType::Site && key.as_ref() != SITE_KEY {
        return Err(ApiError::BadRequest(format!("The site document's key must be '{SITE_KEY}'.")));
    }
    Ok(DocPath { tenant, doc_type, key })
}

async fn require_tenant(pool: &PgPool, tenant: &TenantId) -> Result<(), ApiError> {
    if tenant_exists(pool, tenant).await? { Ok(()) } else { Err(ApiError::TenantNotFound) }
}

/// GET /admin/tenants/{tenant_id}/documents?type=page → [{ type, key, version, updatedAt }]
pub async fn list(
    tenant_id: web::Path<String>,
    params: web::Query<ListParams>,
    pool: web::Data<PgPool>,
) -> Result<HttpResponse, ApiError> {
    let tenant = TenantId::parse(&tenant_id).map_err(ApiError::BadRequest)?;
    let doc_type = params.doc_type.as_deref().map(DocType::parse).transpose().map_err(ApiError::BadRequest)?;
    require_tenant(&pool, &tenant).await?;
    Ok(HttpResponse::Ok().json(list_document_meta(&pool, &tenant, doc_type).await?))
}

/// GET /admin/tenants/{tenant_id}/documents/{type}/{key} → { type, key, version, updatedAt, data }
pub async fn get(path: web::Path<(String, String, String)>, pool: web::Data<PgPool>) -> Result<HttpResponse, ApiError> {
    let DocPath { tenant, doc_type, key } = parse_doc_path(path.into_inner())?;
    let data = match get_document(&pool, &tenant, doc_type, key.as_ref()).await? {
        DocumentLookup::Found(data) => data,
        DocumentLookup::TenantNotFound => return Err(ApiError::TenantNotFound),
        DocumentLookup::DocumentNotFound => return Err(ApiError::NotFound(doc_type.as_str(), key.as_ref().into())),
    };
    let meta = get_document_meta(&pool, &tenant, doc_type, key.as_ref())
        .await?
        .ok_or_else(|| ApiError::NotFound(doc_type.as_str(), key.as_ref().into()))?;

    let mut body = serde_json::to_value(meta).expect("DocumentMeta serializes");
    body["data"] = data;
    Ok(HttpResponse::Ok().json(body))
}

/// PUT /admin/tenants/{tenant_id}/documents/{type}/{key}  body = the document.
/// The body must be an object whose `$type` matches the path type.
/// 201 when created; 200 when updated or unchanged (version bumps only on change).
#[tracing::instrument(name = "Put document", skip(path, body, pool), fields(tenant = %path.0, doc_type = %path.1, key = %path.2))]
pub async fn put(
    path: web::Path<(String, String, String)>,
    body: web::Json<Value>,
    pool: web::Data<PgPool>,
) -> Result<HttpResponse, ApiError> {
    let DocPath { tenant, doc_type, key } = parse_doc_path(path.into_inner())?;
    let data = body.into_inner();
    if !data.is_object() {
        return Err(ApiError::BadRequest("The document must be a JSON object.".into()));
    }
    if data["$type"] != doc_type.as_str() {
        return Err(ApiError::BadRequest(format!(
            "The document's \"$type\" must be \"{}\" to match the URL.",
            doc_type.as_str()
        )));
    }
    require_tenant(&pool, &tenant).await?;

    let outcome = upsert_document(pool.get_ref(), &tenant, doc_type, key.as_ref(), &data).await?;
    let meta = get_document_meta(&pool, &tenant, doc_type, key.as_ref())
        .await?
        .ok_or_else(|| ApiError::NotFound(doc_type.as_str(), key.as_ref().into()))?;

    let status = json!(match outcome {
        UpsertOutcome::Created => "created",
        UpsertOutcome::Updated => "updated",
        UpsertOutcome::Unchanged => "unchanged",
    });
    let mut body = serde_json::to_value(meta).expect("DocumentMeta serializes");
    body["status"] = status;

    Ok(if outcome == UpsertOutcome::Created { HttpResponse::Created().json(body) } else { HttpResponse::Ok().json(body) })
}

/// DELETE /admin/tenants/{tenant_id}/documents/{type}/{key} → 204
#[tracing::instrument(name = "Delete document", skip(path, pool), fields(tenant = %path.0, doc_type = %path.1, key = %path.2))]
pub async fn delete(path: web::Path<(String, String, String)>, pool: web::Data<PgPool>) -> Result<HttpResponse, ApiError> {
    let DocPath { tenant, doc_type, key } = parse_doc_path(path.into_inner())?;
    require_tenant(&pool, &tenant).await?;
    if delete_document(&pool, &tenant, doc_type, key.as_ref()).await? {
        Ok(HttpResponse::NoContent().finish())
    } else {
        Err(ApiError::NotFound(doc_type.as_str(), key.as_ref().into()))
    }
}

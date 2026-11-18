use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::{PgExecutor, PgPool};

use super::{DocType, TenantId};

/// Result of looking up one document, distinguishing an unknown tenant
/// from a known tenant that simply lacks the document.
#[derive(Debug)]
pub enum DocumentLookup {
    Found(Value),
    TenantNotFound,
    DocumentNotFound,
}

/// A document's identity and bookkeeping, without its content.
#[derive(Debug, serde::Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DocumentMeta {
    #[sqlx(rename = "doc_type")]
    #[serde(rename = "type")]
    pub doc_type: String,
    pub key: String,
    pub version: i32,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum UpsertOutcome {
    Created,
    Updated,
    Unchanged,
}

#[tracing::instrument(name = "Fetching document", skip(pool))]
pub async fn get_document(
    pool: &PgPool,
    tenant: &TenantId,
    doc_type: DocType,
    key: &str,
) -> Result<DocumentLookup, sqlx::Error> {
    // LEFT JOIN from tenants: no row = unknown tenant; NULL data = missing document.
    let row: Option<(Option<Value>,)> = sqlx::query_as(
        r#"
        SELECT d.data
        FROM tenants t
        LEFT JOIN documents d
            ON d.tenant_id = t.id AND d.doc_type = $2 AND d.key = $3
        WHERE t.id = $1
        "#,
    )
    .bind(tenant.as_ref())
    .bind(doc_type.as_str())
    .bind(key)
    .fetch_optional(pool)
    .await?;

    Ok(match row {
        None => DocumentLookup::TenantNotFound,
        Some((None,)) => DocumentLookup::DocumentNotFound,
        Some((Some(data),)) => DocumentLookup::Found(data),
    })
}

#[tracing::instrument(name = "Listing documents", skip(pool))]
pub async fn list_documents(
    pool: &PgPool,
    tenant: &TenantId,
    doc_type: DocType,
) -> Result<Vec<Value>, sqlx::Error> {
    let rows: Vec<(Value,)> = sqlx::query_as(
        "SELECT data FROM documents WHERE tenant_id = $1 AND doc_type = $2 ORDER BY key",
    )
    .bind(tenant.as_ref())
    .bind(doc_type.as_str())
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|(data,)| data).collect())
}

/// Metadata for a tenant's documents, optionally of one type, ordered by type then key.
pub async fn list_document_meta(
    pool: &PgPool,
    tenant: &TenantId,
    doc_type: Option<DocType>,
) -> Result<Vec<DocumentMeta>, sqlx::Error> {
    sqlx::query_as(
        "SELECT doc_type, key, version, updated_at FROM documents
         WHERE tenant_id = $1 AND ($2::text IS NULL OR doc_type = $2)
         ORDER BY doc_type, key",
    )
    .bind(tenant.as_ref())
    .bind(doc_type.map(DocType::as_str))
    .fetch_all(pool)
    .await
}

pub async fn get_document_meta(
    pool: &PgPool,
    tenant: &TenantId,
    doc_type: DocType,
    key: &str,
) -> Result<Option<DocumentMeta>, sqlx::Error> {
    sqlx::query_as(
        "SELECT doc_type, key, version, updated_at FROM documents
         WHERE tenant_id = $1 AND doc_type = $2 AND key = $3",
    )
    .bind(tenant.as_ref())
    .bind(doc_type.as_str())
    .bind(key)
    .fetch_optional(pool)
    .await
}

/// Insert or replace a document. `version` starts at 1 and is bumped only
/// when the content actually changes. The tenant must already exist.
pub async fn upsert_document(
    executor: impl PgExecutor<'_>,
    tenant: &TenantId,
    doc_type: DocType,
    key: &str,
    data: &Value,
) -> Result<UpsertOutcome, sqlx::Error> {
    // xmax = 0 identifies a freshly inserted row; no row back = unchanged
    // (the WHERE on the conflict update filtered it out).
    let row: Option<(bool,)> = sqlx::query_as(
        "INSERT INTO documents (tenant_id, doc_type, key, data) VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id, doc_type, key) DO UPDATE
         SET data = EXCLUDED.data,
             version = documents.version + 1,
             updated_at = now()
         WHERE documents.data IS DISTINCT FROM EXCLUDED.data
         RETURNING (xmax = 0) AS inserted",
    )
    .bind(tenant.as_ref())
    .bind(doc_type.as_str())
    .bind(key)
    .bind(data)
    .fetch_optional(executor)
    .await?;

    Ok(match row {
        Some((true,)) => UpsertOutcome::Created,
        Some((false,)) => UpsertOutcome::Updated,
        None => UpsertOutcome::Unchanged,
    })
}

/// Returns false when there was no such document.
pub async fn delete_document(
    pool: &PgPool,
    tenant: &TenantId,
    doc_type: DocType,
    key: &str,
) -> Result<bool, sqlx::Error> {
    let deleted = sqlx::query("DELETE FROM documents WHERE tenant_id = $1 AND doc_type = $2 AND key = $3")
        .bind(tenant.as_ref())
        .bind(doc_type.as_str())
        .bind(key)
        .execute(pool)
        .await?;
    Ok(deleted.rows_affected() > 0)
}

pub async fn tenant_exists(pool: &PgPool, tenant: &TenantId) -> Result<bool, sqlx::Error> {
    let row: Option<(i32,)> = sqlx::query_as("SELECT 1 FROM tenants WHERE id = $1")
        .bind(tenant.as_ref())
        .fetch_optional(pool)
        .await?;
    Ok(row.is_some())
}

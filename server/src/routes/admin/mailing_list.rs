use actix_web::{web, HttpResponse};
use sqlx::PgPool;

use crate::content::{tenant_exists, TenantId};
use crate::mailing_list::{list_subscribers, remove_subscriber, SubscriberAddress};
use crate::routes::error::ApiError;

async fn existing_tenant(pool: &PgPool, raw: &str) -> Result<TenantId, ApiError> {
    let tenant = TenantId::parse(raw).map_err(ApiError::BadRequest)?;
    if tenant_exists(pool, &tenant).await? { Ok(tenant) } else { Err(ApiError::TenantNotFound) }
}

/// GET /admin/tenants/{tenant_id}/mailing-list → [{ email, subscribedAt }], newest first
pub async fn list(tenant_id: web::Path<String>, pool: web::Data<PgPool>) -> Result<HttpResponse, ApiError> {
    let tenant = existing_tenant(&pool, &tenant_id).await?;
    Ok(HttpResponse::Ok().json(list_subscribers(&pool, &tenant).await?))
}

/// DELETE /admin/tenants/{tenant_id}/mailing-list/{email} → 204
#[tracing::instrument(name = "Remove subscriber", skip(path, pool), fields(tenant = %path.0))]
pub async fn remove(path: web::Path<(String, String)>, pool: web::Data<PgPool>) -> Result<HttpResponse, ApiError> {
    let (tenant_id, raw_email) = path.into_inner();
    let tenant = existing_tenant(&pool, &tenant_id).await?;
    let email = SubscriberAddress::parse(&raw_email).map_err(ApiError::BadRequest)?;
    if remove_subscriber(&pool, &tenant, &email).await? {
        Ok(HttpResponse::NoContent().finish())
    } else {
        Err(ApiError::NotFound("subscriber", email.as_ref().to_string()))
    }
}

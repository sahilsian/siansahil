use actix_web::http::header;
use actix_web::{web, HttpResponse};
use sqlx::PgPool;

use crate::content::{
    create_tenant, delete_tenant, get_tenant, list_tenants, parse_domains, update_tenant_domains, TenantId,
};
use crate::routes::error::ApiError;

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateTenant {
    id: String,
    #[serde(default)]
    domains: Vec<String>,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateTenant {
    domains: Vec<String>,
}

fn parse_tenant(raw: &str) -> Result<TenantId, ApiError> {
    TenantId::parse(raw).map_err(ApiError::BadRequest)
}

/// GET /admin/tenants
pub async fn list(pool: web::Data<PgPool>) -> Result<HttpResponse, ApiError> {
    Ok(HttpResponse::Ok().json(list_tenants(&pool).await?))
}

/// POST /admin/tenants  { id, domains? } → 201, or 409 if the id is taken.
#[tracing::instrument(name = "Create tenant", skip(body, pool), fields(tenant = %body.id))]
pub async fn create(body: web::Json<CreateTenant>, pool: web::Data<PgPool>) -> Result<HttpResponse, ApiError> {
    let id = parse_tenant(&body.id)?;
    let domains = parse_domains(&body.domains).map_err(ApiError::BadRequest)?;
    let tenant = create_tenant(&pool, &id, &domains)
        .await?
        .ok_or_else(|| ApiError::Conflict(format!("Tenant '{}' already exists.", id.as_ref())))?;

    Ok(HttpResponse::Created()
        .insert_header((header::LOCATION, format!("/api/v1/admin/tenants/{}", tenant.id)))
        .json(tenant))
}

/// GET /admin/tenants/{tenant_id}
pub async fn get(tenant_id: web::Path<String>, pool: web::Data<PgPool>) -> Result<HttpResponse, ApiError> {
    let id = parse_tenant(&tenant_id)?;
    let tenant = get_tenant(&pool, &id).await?.ok_or(ApiError::TenantNotFound)?;
    Ok(HttpResponse::Ok().json(tenant))
}

/// PUT /admin/tenants/{tenant_id}  { domains } — replaces the domain list.
#[tracing::instrument(name = "Update tenant", skip(body, pool))]
pub async fn update(
    tenant_id: web::Path<String>,
    body: web::Json<UpdateTenant>,
    pool: web::Data<PgPool>,
) -> Result<HttpResponse, ApiError> {
    let id = parse_tenant(&tenant_id)?;
    let domains = parse_domains(&body.domains).map_err(ApiError::BadRequest)?;
    let tenant = update_tenant_domains(&pool, &id, &domains).await?.ok_or(ApiError::TenantNotFound)?;
    Ok(HttpResponse::Ok().json(tenant))
}

/// DELETE /admin/tenants/{tenant_id} — also deletes all its documents. 204.
#[tracing::instrument(name = "Delete tenant", skip(pool))]
pub async fn delete(tenant_id: web::Path<String>, pool: web::Data<PgPool>) -> Result<HttpResponse, ApiError> {
    let id = parse_tenant(&tenant_id)?;
    if delete_tenant(&pool, &id).await? {
        Ok(HttpResponse::NoContent().finish())
    } else {
        Err(ApiError::TenantNotFound)
    }
}

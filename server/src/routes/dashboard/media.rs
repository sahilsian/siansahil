use actix_web::{web, HttpResponse};
use serde_json::json;
use sqlx::PgPool;

use super::{site_for, DashboardConfig, SignedIn};
use crate::content::tenant_exists;
use crate::dashboard::media::{self, StoreError};
use crate::routes::error::ApiError;

#[derive(serde::Deserialize)]
pub struct UploadParams {
    /// Original file name, kept for the image's `name` field.
    name: Option<String>,
}

/// POST /sites/{site}/media?name=photo.jpg  body = image bytes
/// → { url, width, height, name } (the shape of an Image in content documents).
#[tracing::instrument(name = "Upload image", skip(user, site, params, body, pool, config), fields(user = %user.username, site = %site, bytes = body.len()))]
pub async fn upload(
    SignedIn(user): SignedIn,
    site: web::Path<String>,
    params: web::Query<UploadParams>,
    body: web::Bytes,
    pool: web::Data<PgPool>,
    config: web::Data<DashboardConfig>,
) -> Result<HttpResponse, ApiError> {
    let tenant = site_for(&user, &site)?;
    if !tenant_exists(&pool, &tenant).await? {
        return Err(ApiError::TenantNotFound);
    }
    let (kind, width, height) = media::inspect(&body).map_err(ApiError::BadRequest)?;
    let stored = media::store(&pool, &tenant, &body, kind, width, height).await.map_err(|e| match e {
        StoreError::QuotaExceeded => ApiError::BadRequest("This site's image storage is full.".into()),
        StoreError::Database(e) => e.into(),
    })?;

    let url = format!("{}/api/v1/media/{}/{}.{}", config.api_base_url, tenant.as_ref(), stored.id, stored.kind_ext);
    let name: String = params
        .name
        .as_deref()
        .map(|n| n.chars().filter(|c| !c.is_control() && !matches!(c, '/' | '\\' | '<' | '>' | '"')).take(200).collect())
        .filter(|n: &String| !n.trim().is_empty())
        .unwrap_or_else(|| format!("{}.{}", &stored.id[..12], stored.kind_ext));
    tracing::info!(width, height, "Image stored");
    Ok(HttpResponse::Created().json(json!({ "url": url, "width": width, "height": height, "name": name })))
}

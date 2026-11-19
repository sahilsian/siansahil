//! Public image delivery for uploads made in the dashboard:
//!   GET /api/v1/media/{tenantId}/{sha256}.{jpg|png|webp}
//!
//! The address contains a hash of the content, so a URL always means the same
//! bytes and can be cached forever.

use actix_web::http::header;
use actix_web::{web, HttpResponse};
use sqlx::PgPool;

use crate::content::TenantId;
use crate::dashboard::media::{self, ImageKind};
use crate::routes::error::ApiError;

pub async fn get(path: web::Path<(String, String)>, pool: web::Data<PgPool>) -> Result<HttpResponse, ApiError> {
    let (tenant, file) = path.into_inner();
    let tenant = TenantId::parse(&tenant).map_err(ApiError::BadRequest)?;
    let not_found = || ApiError::NotFound("image", file.clone());

    let (id, ext) = file.split_once('.').ok_or_else(not_found)?;
    let valid_id = id.len() == 64 && id.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'));
    let kind = ImageKind::from_extension(ext).filter(|_| valid_id).ok_or_else(not_found)?;

    let (content_type, bytes) = media::fetch(&pool, &tenant, id).await?.ok_or_else(not_found)?;
    if content_type != kind.content_type() {
        return Err(not_found());
    }
    Ok(HttpResponse::Ok()
        .insert_header((header::CONTENT_TYPE, content_type))
        .insert_header((header::CACHE_CONTROL, "public, max-age=31536000, immutable"))
        .insert_header((header::X_CONTENT_TYPE_OPTIONS, "nosniff"))
        .insert_header((header::CONTENT_SECURITY_POLICY, "default-src 'none'"))
        .body(bytes))
}

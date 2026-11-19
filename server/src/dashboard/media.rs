//! Uploaded images, stored in Postgres and served publicly by URL.
//!
//! Only JPEG, PNG and WebP are accepted, recognised from the file's own bytes
//! (never from the name or the client's Content-Type). SVG is refused on purpose:
//! it can carry scripts.

use sha2::{Digest, Sha256};
use sqlx::PgPool;

use crate::content::TenantId;

/// Largest single upload. The dashboard shrinks photos before sending them.
pub const MAX_UPLOAD_BYTES: usize = 10 * 1024 * 1024;
/// Total stored per tenant.
pub const MAX_TENANT_BYTES: i64 = 2 * 1024 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageKind {
    Jpeg,
    Png,
    Webp,
}

impl ImageKind {
    pub fn sniff(bytes: &[u8]) -> Option<Self> {
        if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
            Some(ImageKind::Jpeg)
        } else if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
            Some(ImageKind::Png)
        } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
            Some(ImageKind::Webp)
        } else {
            None
        }
    }

    pub fn content_type(self) -> &'static str {
        match self {
            ImageKind::Jpeg => "image/jpeg",
            ImageKind::Png => "image/png",
            ImageKind::Webp => "image/webp",
        }
    }

    pub fn extension(self) -> &'static str {
        match self {
            ImageKind::Jpeg => "jpg",
            ImageKind::Png => "png",
            ImageKind::Webp => "webp",
        }
    }

    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext {
            "jpg" => Some(ImageKind::Jpeg),
            "png" => Some(ImageKind::Png),
            "webp" => Some(ImageKind::Webp),
            _ => None,
        }
    }
}

#[derive(Debug, serde::Serialize)]
pub struct StoredImage {
    pub id: String,
    pub kind_ext: &'static str,
    pub width: u32,
    pub height: u32,
}

/// Check an upload is a real image; returns its kind and size in pixels.
pub fn inspect(bytes: &[u8]) -> Result<(ImageKind, u32, u32), String> {
    let kind = ImageKind::sniff(bytes).ok_or("Only JPEG, PNG or WebP images can be uploaded.")?;
    let size = imagesize::blob_size(bytes).map_err(|_| "That image file looks damaged.".to_string())?;
    let (w, h) = (size.width, size.height);
    if w == 0 || h == 0 || w > 30_000 || h > 30_000 {
        return Err("That image's dimensions aren't supported.".into());
    }
    Ok((kind, w as u32, h as u32))
}

pub enum StoreError {
    QuotaExceeded,
    Database(sqlx::Error),
}

impl From<sqlx::Error> for StoreError {
    fn from(e: sqlx::Error) -> Self {
        StoreError::Database(e)
    }
}

pub async fn store(
    pool: &PgPool,
    tenant: &TenantId,
    bytes: &[u8],
    kind: ImageKind,
    width: u32,
    height: u32,
) -> Result<StoredImage, StoreError> {
    let id = hex::encode(Sha256::digest(bytes));
    let (used,): (i64,) = sqlx::query_as("SELECT COALESCE(SUM(length(bytes)), 0)::bigint FROM media WHERE tenant_id = $1")
        .bind(tenant.as_ref())
        .fetch_one(pool)
        .await?;
    if used + bytes.len() as i64 > MAX_TENANT_BYTES {
        return Err(StoreError::QuotaExceeded);
    }
    sqlx::query(
        "INSERT INTO media (tenant_id, id, content_type, width, height, bytes)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tenant_id, id) DO NOTHING",
    )
    .bind(tenant.as_ref())
    .bind(&id)
    .bind(kind.content_type())
    .bind(width as i32)
    .bind(height as i32)
    .bind(bytes)
    .execute(pool)
    .await?;
    Ok(StoredImage { id, kind_ext: kind.extension(), width, height })
}

/// `(content type, bytes)` for a stored image.
pub async fn fetch(pool: &PgPool, tenant: &TenantId, id: &str) -> Result<Option<(String, Vec<u8>)>, sqlx::Error> {
    sqlx::query_as("SELECT content_type, bytes FROM media WHERE tenant_id = $1 AND id = $2")
        .bind(tenant.as_ref())
        .bind(id)
        .fetch_optional(pool)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    // Smallest valid 1x1 PNG.
    const PNG_1X1: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0D, 0x49,
        0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00,
        0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];

    #[test]
    fn recognises_real_images_by_their_bytes() {
        assert_eq!(inspect(PNG_1X1).unwrap(), (ImageKind::Png, 1, 1));
    }

    #[test]
    fn refuses_svg_html_and_garbage() {
        for bad in [&b"<svg xmlns='http://www.w3.org/2000/svg'></svg>"[..], b"<html><script>", b"", b"\xFF\xD8"] {
            assert!(inspect(bad).is_err());
        }
    }
}

//! Uploaded images: stored in Cloudflare R2 (production) or Postgres (local
//! development), and served publicly by URL.
//!
//! Only JPEG, PNG and WebP are accepted, recognised from the file's own bytes
//! (never from the name or the client's Content-Type). SVG is refused on purpose:
//! it can carry scripts.
//!
//! Files are named by the SHA-256 of their content, so an address always means the
//! same bytes (safe to cache forever) and re-uploading a photo doesn't duplicate it.

use sha2::{Digest, Sha256};
use sqlx::PgPool;

use super::r2::R2Client;
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

/// Where uploads go.
pub enum MediaStore {
    /// In the `media` table, served by this server at `/api/v1/media/...`.
    Database { api_base_url: String },
    /// In a Cloudflare R2 bucket, served from its public domain.
    R2(R2Client),
}

impl MediaStore {
    /// R2 when configured, otherwise the database. R2 settings that exist but are
    /// all blank (declared but not filled in) count as "not configured"; partly
    /// filled-in settings are an error, so a typo can't silently fall back.
    pub fn from_settings(settings: &crate::config::MediaSettings, api_base_url: &str) -> Result<Self, String> {
        use secrecy::ExposeSecret;
        let database = || MediaStore::Database { api_base_url: api_base_url.trim_end_matches('/').to_string() };
        let Some(r2) = &settings.r2 else { return Ok(database()) };
        let fields = [
            ("account_id", r2.account_id.trim()),
            ("bucket", r2.bucket.trim()),
            ("access_key_id", r2.access_key_id.trim()),
            ("secret_access_key", r2.secret_access_key.expose_secret().trim()),
            ("public_base_url", r2.public_base_url.trim()),
        ];
        let missing: Vec<&str> = fields.iter().filter(|(_, v)| v.is_empty()).map(|(k, _)| *k).collect();
        if missing.len() == fields.len() {
            return Ok(database());
        }
        if !missing.is_empty() {
            return Err(format!("R2 is partly configured; missing media.r2: {}", missing.join(", ")));
        }
        Ok(MediaStore::R2(R2Client::new(r2)?))
    }

    pub fn describe(&self) -> &'static str {
        match self {
            MediaStore::Database { .. } => "database",
            MediaStore::R2(_) => "r2",
        }
    }
}

#[derive(Debug)]
pub struct StoredImage {
    pub id: String,
    /// Public address of the image.
    pub url: String,
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
    /// The R2 upload failed (details are logged).
    Upload(String),
}

impl From<sqlx::Error> for StoreError {
    fn from(e: sqlx::Error) -> Self {
        StoreError::Database(e)
    }
}

pub async fn store(
    media: &MediaStore,
    pool: &PgPool,
    tenant: &TenantId,
    bytes: Vec<u8>,
    kind: ImageKind,
    width: u32,
    height: u32,
) -> Result<StoredImage, StoreError> {
    let id = hex::encode(Sha256::digest(&bytes));
    let size = bytes.len() as i64;
    let (used,): (i64,) = sqlx::query_as(
        "SELECT COALESCE(SUM(size_bytes), 0)::bigint FROM media WHERE tenant_id = $1 AND id <> $2",
    )
    .bind(tenant.as_ref())
    .bind(&id)
    .fetch_one(pool)
    .await?;
    if used + size > MAX_TENANT_BYTES {
        return Err(StoreError::QuotaExceeded);
    }

    let file = format!("{id}.{}", kind.extension());
    let (url, kept_bytes, storage) = match media {
        MediaStore::Database { api_base_url } => {
            (format!("{api_base_url}/api/v1/media/{}/{file}", tenant.as_ref()), Some(bytes), "database")
        }
        MediaStore::R2(r2) => {
            let key = format!("{}/{file}", tenant.as_ref());
            // Always upload: putting the same bytes again is harmless, and it covers
            // a photo first stored in the database before R2 was set up.
            r2.put(&key, bytes, kind.content_type()).await.map_err(StoreError::Upload)?;
            (r2.public_url(&key), None, "r2")
        }
    };

    sqlx::query(
        "INSERT INTO media (tenant_id, id, content_type, width, height, bytes, size_bytes, storage)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (tenant_id, id) DO NOTHING",
    )
    .bind(tenant.as_ref())
    .bind(&id)
    .bind(kind.content_type())
    .bind(width as i32)
    .bind(height as i32)
    .bind(kept_bytes)
    .bind(size as i32)
    .bind(storage)
    .execute(pool)
    .await?;
    Ok(StoredImage { id, url, kind_ext: kind.extension(), width, height })
}

/// `(content type, bytes)` for an image kept in the database.
pub async fn fetch(pool: &PgPool, tenant: &TenantId, id: &str) -> Result<Option<(String, Vec<u8>)>, sqlx::Error> {
    sqlx::query_as(
        "SELECT content_type, bytes FROM media WHERE tenant_id = $1 AND id = $2 AND bytes IS NOT NULL",
    )
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

    fn r2(account: &str, bucket: &str, key: &str, secret: &str, public: &str) -> crate::config::MediaSettings {
        crate::config::MediaSettings {
            r2: Some(crate::config::R2Settings {
                account_id: account.into(),
                bucket: bucket.into(),
                access_key_id: key.into(),
                secret_access_key: secrecy::Secret::new(secret.into()),
                public_base_url: public.into(),
                endpoint: None,
            }),
        }
    }

    #[test]
    fn chooses_storage_from_settings() {
        let base = "https://api.example.com";
        let none = crate::config::MediaSettings::default();
        assert_eq!(MediaStore::from_settings(&none, base).unwrap().describe(), "database");
        assert_eq!(MediaStore::from_settings(&r2("", "", "", "", ""), base).unwrap().describe(), "database");
        let full = r2("acct", "bucket", "key", "secret", "https://images.example.com");
        assert_eq!(MediaStore::from_settings(&full, base).unwrap().describe(), "r2");
        assert!(MediaStore::from_settings(&r2("acct", "", "key", "secret", "https://images.example.com"), base).is_err());
        assert!(MediaStore::from_settings(&r2("acct", "bucket", "key", "secret", "images.example.com"), base).is_err());
    }

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

use actix_web::body::MessageBody;
use actix_web::dev::{ServiceRequest, ServiceResponse};
use actix_web::http::header::AUTHORIZATION;
use actix_web::middleware::Next;
use actix_web::web;
use secrecy::{ExposeSecret, Secret};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

use crate::routes::error::ApiError;

/// Keys shorter than this are refused at startup.
pub const MIN_ADMIN_KEY_LEN: usize = 32;

/// The configured admin key, kept only as a SHA-256 digest. Comparing
/// fixed-length digests in constant time leaks neither content nor length.
pub struct AdminKey {
    digest: [u8; 32],
}

impl AdminKey {
    pub fn new(key: &Secret<String>) -> Result<Self, String> {
        let key = key.expose_secret();
        if key.len() < MIN_ADMIN_KEY_LEN {
            return Err(format!("admin.api_key must be at least {MIN_ADMIN_KEY_LEN} characters"));
        }
        Ok(Self { digest: Sha256::digest(key.as_bytes()).into() })
    }

    fn matches(&self, presented: &str) -> bool {
        let presented: [u8; 32] = Sha256::digest(presented.as_bytes()).into();
        self.digest.ct_eq(&presented).into()
    }
}

/// Middleware for the admin scope: requires `Authorization: Bearer <admin key>`.
pub async fn require_admin_key(
    req: ServiceRequest,
    next: Next<impl MessageBody>,
) -> Result<ServiceResponse<impl MessageBody>, actix_web::Error> {
    let key = req
        .app_data::<web::Data<AdminKey>>()
        .expect("AdminKey must be registered as app data");

    let presented = req
        .headers()
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(str::trim);

    match presented {
        Some(token) if key.matches(token) => next.call(req).await,
        _ => {
            tracing::warn!(path = %req.path(), "Rejected admin request without a valid key");
            Err(ApiError::Unauthorized.into())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(s: &str) -> Secret<String> {
        Secret::new(s.to_string())
    }

    #[test]
    fn rejects_short_keys() {
        assert!(AdminKey::new(&key("too-short")).is_err());
    }

    #[test]
    fn matches_only_the_exact_key() {
        let k = AdminKey::new(&key("0123456789abcdef0123456789abcdef")).unwrap();
        assert!(k.matches("0123456789abcdef0123456789abcdef"));
        assert!(!k.matches("0123456789abcdef0123456789abcdeF"));
        assert!(!k.matches(""));
    }
}

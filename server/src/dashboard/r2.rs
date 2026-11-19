//! Minimal Cloudflare R2 client: uploads one object with an S3-style signed PUT.
//!
//! R2 speaks the S3 API, which authenticates requests with AWS Signature V4.
//! Only the one call we need is implemented here, rather than pulling in a full SDK.

use std::time::Duration;

use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use secrecy::{ExposeSecret, Secret};
use sha2::{Digest, Sha256};

use crate::config::R2Settings;

type HmacSha256 = Hmac<Sha256>;

/// Cached by browsers and Cloudflare's edge for a year: object names contain a
/// hash of the content, so a name always means the same bytes.
pub const IMMUTABLE: &str = "public, max-age=31536000, immutable";

pub struct R2Client {
    http: reqwest::Client,
    /// e.g. `https://<account>.r2.cloudflarestorage.com`
    endpoint: String,
    host: String,
    bucket: String,
    access_key_id: String,
    secret_access_key: Secret<String>,
    /// Where uploaded objects are publicly readable, e.g. `https://images.example.com`.
    pub public_base_url: String,
}

impl R2Client {
    pub fn new(settings: &R2Settings) -> Result<Self, String> {
        let endpoint = settings
            .endpoint
            .clone()
            .unwrap_or_else(|| format!("https://{}.r2.cloudflarestorage.com", settings.account_id.trim()))
            .trim_end_matches('/')
            .to_string();
        let host = endpoint
            .split_once("://")
            .map(|(_, rest)| rest.split('/').next().unwrap_or(rest).to_string())
            .ok_or("media.r2.endpoint must be a full URL")?;
        let public_base_url = settings.public_base_url.trim().trim_end_matches('/').to_string();
        if !public_base_url.starts_with("https://") && !public_base_url.starts_with("http://") {
            return Err("media.r2.public_base_url must be a full URL, e.g. https://images.example.com".into());
        }
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self {
            http,
            endpoint,
            host,
            bucket: settings.bucket.trim().to_string(),
            access_key_id: settings.access_key_id.trim().to_string(),
            secret_access_key: settings.secret_access_key.clone(),
            public_base_url,
        })
    }

    /// Public address of an object key.
    pub fn public_url(&self, key: &str) -> String {
        format!("{}/{key}", self.public_base_url)
    }

    /// Upload (or overwrite) one object. `key` must be URL-safe (`a-z 0-9 - . /`).
    pub async fn put(&self, key: &str, bytes: Vec<u8>, content_type: &str) -> Result<(), String> {
        let path = format!("/{}/{key}", self.bucket);
        let payload_hash = hex::encode(Sha256::digest(&bytes));
        let now = Utc::now();
        let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
        let headers = [
            ("cache-control", IMMUTABLE.to_string()),
            ("content-type", content_type.to_string()),
            ("host", self.host.clone()),
            ("x-amz-content-sha256", payload_hash.clone()),
            ("x-amz-date", amz_date.clone()),
        ];
        let authorization = sign(&SigningInput {
            method: "PUT",
            path: &path,
            query: "",
            headers: &headers,
            payload_hash: &payload_hash,
            now,
            region: "auto",
            service: "s3",
            access_key_id: &self.access_key_id,
            secret_access_key: self.secret_access_key.expose_secret(),
        });

        let response = self
            .http
            .put(format!("{}{path}", self.endpoint))
            .header("authorization", authorization)
            .header("cache-control", IMMUTABLE)
            .header("content-type", content_type)
            .header("x-amz-content-sha256", payload_hash)
            .header("x-amz-date", amz_date)
            .body(bytes)
            .send()
            .await
            .map_err(|e| format!("couldn't reach R2: {e}"))?;
        if response.status().is_success() {
            Ok(())
        } else {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            Err(format!("R2 refused the upload ({status}): {}", body.chars().take(300).collect::<String>()))
        }
    }
}

pub struct SigningInput<'a> {
    pub method: &'a str,
    /// Already URL-encoded path, e.g. `/bucket/key.jpg`.
    pub path: &'a str,
    /// Canonical query string ("" for none).
    pub query: &'a str,
    /// Every header to sign, names lowercase, sorted by name, including `host`.
    pub headers: &'a [(&'a str, String)],
    pub payload_hash: &'a str,
    pub now: DateTime<Utc>,
    pub region: &'a str,
    pub service: &'a str,
    pub access_key_id: &'a str,
    pub secret_access_key: &'a str,
}

fn hmac(key: &[u8], data: &str) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC accepts any key length");
    mac.update(data.as_bytes());
    mac.finalize().into_bytes().to_vec()
}

/// The `Authorization` header value for an AWS Signature V4 request.
pub fn sign(input: &SigningInput<'_>) -> String {
    let amz_date = input.now.format("%Y%m%dT%H%M%SZ").to_string();
    let date = input.now.format("%Y%m%d").to_string();

    let canonical_headers: String =
        input.headers.iter().map(|(name, value)| format!("{name}:{}\n", value.trim())).collect();
    let signed_headers = input.headers.iter().map(|(name, _)| *name).collect::<Vec<_>>().join(";");
    let canonical_request = format!(
        "{}\n{}\n{}\n{canonical_headers}\n{signed_headers}\n{}",
        input.method, input.path, input.query, input.payload_hash
    );

    let scope = format!("{date}/{}/{}/aws4_request", input.region, input.service);
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{amz_date}\n{scope}\n{}",
        hex::encode(Sha256::digest(canonical_request.as_bytes()))
    );

    let k_date = hmac(format!("AWS4{}", input.secret_access_key).as_bytes(), &date);
    let k_region = hmac(&k_date, input.region);
    let k_service = hmac(&k_region, input.service);
    let k_signing = hmac(&k_service, "aws4_request");
    let signature = hex::encode(hmac(&k_signing, &string_to_sign));

    format!(
        "AWS4-HMAC-SHA256 Credential={}/{scope}, SignedHeaders={signed_headers}, Signature={signature}",
        input.access_key_id
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    /// The worked "GET Object" example from AWS's Signature V4 documentation
    /// ("Signature Calculations for the Authorization Header", Example: GET Object).
    #[test]
    fn matches_the_aws_documentation_example() {
        let empty = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
        let headers = [
            ("host", "examplebucket.s3.amazonaws.com".to_string()),
            ("range", "bytes=0-9".to_string()),
            ("x-amz-content-sha256", empty.to_string()),
            ("x-amz-date", "20130524T000000Z".to_string()),
        ];
        let auth = sign(&SigningInput {
            method: "GET",
            path: "/test.txt",
            query: "",
            headers: &headers,
            payload_hash: empty,
            now: Utc.with_ymd_and_hms(2013, 5, 24, 0, 0, 0).unwrap(),
            region: "us-east-1",
            service: "s3",
            access_key_id: "AKIAIOSFODNN7EXAMPLE",
            secret_access_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        });
        assert_eq!(
            auth,
            "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, \
             SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, \
             Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"
        );
    }
}

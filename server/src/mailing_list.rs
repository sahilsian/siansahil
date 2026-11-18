//! Per-tenant mailing list storage.

use chrono::{DateTime, Utc};
use sqlx::PgPool;

use crate::content::TenantId;
use crate::domain::SubscriberEmail;

/// Longest address accepted (RFC 5321 path limit).
const MAX_EMAIL_LEN: usize = 254;

/// A validated, normalised (trimmed + lowercased) subscriber address.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SubscriberAddress(String);

impl SubscriberAddress {
    pub fn parse(raw: &str) -> Result<Self, String> {
        let normalised = raw.trim().to_lowercase();
        if normalised.len() > MAX_EMAIL_LEN {
            return Err("That email address is too long.".into());
        }
        SubscriberEmail::parse(normalised.clone()).map_err(|_| "Please enter a valid email address.".to_string())?;
        Ok(Self(normalised))
    }
}

impl AsRef<str> for SubscriberAddress {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Subscriber {
    pub email: String,
    pub subscribed_at: DateTime<Utc>,
}

/// Store a subscriber. Returns true when newly added, false when the
/// address was already on this tenant's list. The tenant must exist.
pub async fn add_subscriber(pool: &PgPool, tenant: &TenantId, email: &SubscriberAddress) -> Result<bool, sqlx::Error> {
    let inserted = sqlx::query(
        "INSERT INTO mailing_list_subscribers (tenant_id, email) VALUES ($1, $2)
         ON CONFLICT (tenant_id, email) DO NOTHING",
    )
    .bind(tenant.as_ref())
    .bind(email.as_ref())
    .execute(pool)
    .await?;
    Ok(inserted.rows_affected() == 1)
}

/// Newest first.
pub async fn list_subscribers(pool: &PgPool, tenant: &TenantId) -> Result<Vec<Subscriber>, sqlx::Error> {
    sqlx::query_as(
        "SELECT email, subscribed_at FROM mailing_list_subscribers
         WHERE tenant_id = $1 ORDER BY subscribed_at DESC, email",
    )
    .bind(tenant.as_ref())
    .fetch_all(pool)
    .await
}

/// Returns false when the address wasn't subscribed.
pub async fn remove_subscriber(pool: &PgPool, tenant: &TenantId, email: &SubscriberAddress) -> Result<bool, sqlx::Error> {
    let deleted = sqlx::query("DELETE FROM mailing_list_subscribers WHERE tenant_id = $1 AND email = $2")
        .bind(tenant.as_ref())
        .bind(email.as_ref())
        .execute(pool)
        .await?;
    Ok(deleted.rows_affected() > 0)
}

#[cfg(test)]
mod tests {
    use super::SubscriberAddress;

    #[test]
    fn normalises_case_and_whitespace() {
        assert_eq!(SubscriberAddress::parse("  Hello@Example.COM ").unwrap().as_ref(), "hello@example.com");
    }

    #[test]
    fn rejects_invalid_and_overlong_addresses() {
        let too_long = format!("{}@example.com", "a".repeat(250));
        for bad in ["", "   ", "not-an-email", "a@", "@b.com", too_long.as_str()] {
            assert!(SubscriberAddress::parse(bad).is_err(), "{bad:?}");
        }
    }
}

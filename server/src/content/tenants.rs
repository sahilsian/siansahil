use chrono::{DateTime, Utc};
use sqlx::PgPool;

use super::TenantId;

/// A tenant as returned by the admin API.
#[derive(Debug, serde::Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TenantRecord {
    pub id: String,
    pub domains: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub document_count: i64,
}

/// Validate and normalise a tenant's domains: lowercase hostnames
/// (letters, digits, `.`, `-`; ≤253 chars; no scheme/path/port), de-duplicated.
pub fn parse_domains(raw: &[String]) -> Result<Vec<String>, String> {
    let mut domains: Vec<String> = Vec::new();
    for d in raw {
        let domain = d.trim().to_lowercase();
        let valid = (1..=253).contains(&domain.len())
            && domain.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '-')
            && !domain.starts_with(['.', '-'])
            && !domain.ends_with(['.', '-'])
            && !domain.contains("..");
        if !valid {
            return Err(format!("'{d}' is not a valid domain (use a bare hostname like example.com)"));
        }
        if !domains.contains(&domain) {
            domains.push(domain);
        }
    }
    Ok(domains)
}

const SELECT_TENANT: &str = r#"
    SELECT t.id, t.domains, t.created_at,
           (SELECT COUNT(*) FROM documents d WHERE d.tenant_id = t.id) AS document_count
    FROM tenants t
"#;

pub async fn list_tenants(pool: &PgPool) -> Result<Vec<TenantRecord>, sqlx::Error> {
    sqlx::query_as(&format!("{SELECT_TENANT} ORDER BY t.id")).fetch_all(pool).await
}

pub async fn get_tenant(pool: &PgPool, id: &TenantId) -> Result<Option<TenantRecord>, sqlx::Error> {
    sqlx::query_as(&format!("{SELECT_TENANT} WHERE t.id = $1"))
        .bind(id.as_ref())
        .fetch_optional(pool)
        .await
}

/// `Ok(None)` when the id is already taken.
pub async fn create_tenant(
    pool: &PgPool,
    id: &TenantId,
    domains: &[String],
) -> Result<Option<TenantRecord>, sqlx::Error> {
    let inserted = sqlx::query("INSERT INTO tenants (id, domains) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING")
        .bind(id.as_ref())
        .bind(domains)
        .execute(pool)
        .await?;
    if inserted.rows_affected() == 0 {
        return Ok(None);
    }
    get_tenant(pool, id).await
}

/// `Ok(None)` when the tenant doesn't exist.
pub async fn update_tenant_domains(
    pool: &PgPool,
    id: &TenantId,
    domains: &[String],
) -> Result<Option<TenantRecord>, sqlx::Error> {
    let updated = sqlx::query("UPDATE tenants SET domains = $2 WHERE id = $1")
        .bind(id.as_ref())
        .bind(domains)
        .execute(pool)
        .await?;
    if updated.rows_affected() == 0 {
        return Ok(None);
    }
    get_tenant(pool, id).await
}

/// Deletes the tenant and (via ON DELETE CASCADE) all its documents.
/// Returns false when the tenant didn't exist.
pub async fn delete_tenant(pool: &PgPool, id: &TenantId) -> Result<bool, sqlx::Error> {
    let deleted = sqlx::query("DELETE FROM tenants WHERE id = $1").bind(id.as_ref()).execute(pool).await?;
    Ok(deleted.rows_affected() > 0)
}

#[cfg(test)]
mod tests {
    use super::parse_domains;

    fn strings(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn normalises_and_dedupes() {
        let out = parse_domains(&strings(&[" SianSahil.com ", "www.siansahil.com", "siansahil.com"])).unwrap();
        assert_eq!(out, ["siansahil.com", "www.siansahil.com"]);
    }

    #[test]
    fn empty_list_is_allowed() {
        assert!(parse_domains(&[]).unwrap().is_empty());
    }

    #[test]
    fn rejects_urls_and_junk() {
        for bad in ["https://x.com", "x.com/path", "x.com:443", "", ".x.com", "x..com", "x com"] {
            assert!(parse_domains(&strings(&[bad])).is_err(), "{bad:?}");
        }
    }
}

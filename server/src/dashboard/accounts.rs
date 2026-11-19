//! Dashboard accounts: password hashing, random tokens, users and sessions.
//!
//! Accounts are created by a superadmin (or, for the first superadmin, with the
//! admin API key) with a username and password; there is no self sign-up.
//!
//! Security notes:
//! - Passwords are hashed with Argon2id (OWASP-recommended parameters, the crate default).
//! - Session tokens are 256 random bits from the OS. Only their SHA-256 is stored,
//!   so a database leak can't be replayed as working cookies.
//! - Sessions expire 14 days after sign-in, or after 3 days without use.
//! - Changing or resetting a password ends that account's other sessions.

use std::sync::LazyLock;

use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use chrono::{DateTime, Utc};
use sha2::{Digest, Sha256};
use sqlx::{PgExecutor, PgPool};
use uuid::Uuid;

use crate::content::TenantId;
use crate::mailing_list::SubscriberAddress;

pub const MIN_PASSWORD_CHARS: usize = 15;
/// Upper bound so a huge "password" can't be used to burn CPU in Argon2.
pub const MAX_PASSWORD_CHARS: usize = 128;
pub const SESSION_DAYS: i64 = 14;
pub const SESSION_IDLE_DAYS: i64 = 3;

// ------------------------------------------------------------------ roles

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Superadmin,
    Editor,
}

impl Role {
    pub fn as_str(self) -> &'static str {
        match self {
            Role::Superadmin => "superadmin",
            Role::Editor => "editor",
        }
    }

    pub fn parse(raw: &str) -> Result<Self, String> {
        match raw {
            "superadmin" => Ok(Role::Superadmin),
            "editor" => Ok(Role::Editor),
            other => Err(format!("'{other}' is not a role (superadmin, editor)")),
        }
    }
}

// ------------------------------------------------------------------ tokens

/// 256 random bits from the OS, hex encoded (64 chars).
pub fn new_token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("the OS random number generator is unavailable");
    hex::encode(bytes)
}

pub fn hash_token(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

// ------------------------------------------------------------------ usernames & passwords

/// 3–32 chars of `a-z 0-9 _ . -`, starting with a letter or digit. Returned lowercased.
pub fn parse_username(raw: &str) -> Result<String, String> {
    let name = raw.trim().to_lowercase();
    let valid = (3..=32).contains(&name.len())
        && name.chars().next().is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '_' | '.' | '-'));
    if valid {
        Ok(name)
    } else {
        Err("Usernames are 3–32 characters: letters, numbers, '.', '_' or '-'.".into())
    }
}

pub fn validate_password(password: &str, username: &str) -> Result<(), String> {
    let chars = password.chars().count();
    if chars < MIN_PASSWORD_CHARS {
        return Err(format!("Passwords must be at least {MIN_PASSWORD_CHARS} characters."));
    }
    if chars > MAX_PASSWORD_CHARS {
        return Err(format!("Passwords can be at most {MAX_PASSWORD_CHARS} characters."));
    }
    if password.to_lowercase().contains(username) {
        return Err("The password can't contain the username.".into());
    }
    Ok(())
}

/// Argon2id hash as a PHC string. CPU-heavy: call from `web::block`.
pub fn hash_password(password: &str) -> Result<String, String> {
    let mut salt = [0u8; 16];
    getrandom::fill(&mut salt).map_err(|e| e.to_string())?;
    let salt = SaltString::encode_b64(&salt).map_err(|e| e.to_string())?;
    Argon2::default().hash_password(password.as_bytes(), &salt).map(|h| h.to_string()).map_err(|e| e.to_string())
}

/// A real hash of a throwaway password, checked when the username doesn't exist,
/// so a failed sign-in takes as long whether or not the account is real.
static DUMMY_HASH: LazyLock<String> =
    LazyLock::new(|| hash_password("dummy password that is never accepted").expect("hash dummy password"));

/// CPU-heavy: call from `web::block`. `None` = unknown user (still does the work).
pub fn verify_password(password: &str, phc: Option<&str>) -> bool {
    let phc = phc.unwrap_or(DUMMY_HASH.as_str());
    let Ok(parsed) = PasswordHash::new(phc) else { return false };
    let matched = Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok();
    matched && phc != DUMMY_HASH.as_str()
}

/// An optional, normalised email address ("" = none).
pub fn parse_optional_email(raw: Option<&str>) -> Result<Option<String>, String> {
    match raw.map(str::trim).filter(|e| !e.is_empty()) {
        None => Ok(None),
        Some(e) => Ok(Some(SubscriberAddress::parse(e)?.as_ref().to_string())),
    }
}

// ------------------------------------------------------------------ users

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub email: Option<String>,
    pub role: Role,
    pub tenant_id: Option<String>,
}

impl User {
    pub fn is_superadmin(&self) -> bool {
        self.role == Role::Superadmin
    }

    /// Superadmins can reach every tenant; editors only their own.
    pub fn can_access(&self, tenant: &TenantId) -> bool {
        self.is_superadmin() || self.tenant_id.as_deref() == Some(tenant.as_ref())
    }
}

#[derive(sqlx::FromRow)]
struct UserRow {
    id: Uuid,
    username: String,
    email: Option<String>,
    role: String,
    tenant_id: Option<String>,
}

impl From<UserRow> for User {
    fn from(r: UserRow) -> Self {
        User {
            id: r.id,
            username: r.username,
            email: r.email,
            role: Role::parse(&r.role).unwrap_or(Role::Editor),
            tenant_id: r.tenant_id,
        }
    }
}

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UserListing {
    pub id: Uuid,
    pub username: String,
    pub email: Option<String>,
    pub role: String,
    pub tenant_id: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// `(user, password hash)` for a sign-in attempt.
pub async fn find_login(pool: &PgPool, username: &str) -> Result<Option<(User, String)>, sqlx::Error> {
    let row: Option<(Uuid, String, Option<String>, String, Option<String>, String)> = sqlx::query_as(
        "SELECT id, username, email, role, tenant_id, password_hash FROM dashboard_users WHERE username = $1",
    )
    .bind(username)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|(id, username, email, role, tenant_id, hash)| {
        (UserRow { id, username, email, role, tenant_id }.into(), hash)
    }))
}

pub async fn password_hash(pool: &PgPool, user_id: Uuid) -> Result<Option<String>, sqlx::Error> {
    let row: Option<(String,)> = sqlx::query_as("SELECT password_hash FROM dashboard_users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|(h,)| h))
}

pub async fn list_users(pool: &PgPool) -> Result<Vec<UserListing>, sqlx::Error> {
    sqlx::query_as(
        "SELECT id, username, email, role, tenant_id, created_at FROM dashboard_users
         ORDER BY tenant_id NULLS FIRST, username",
    )
    .fetch_all(pool)
    .await
}

pub async fn delete_user(pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
    let done = sqlx::query("DELETE FROM dashboard_users WHERE id = $1").bind(id).execute(pool).await?;
    Ok(done.rows_affected() > 0)
}

#[derive(Debug)]
pub enum CreateUserError {
    UsernameTaken,
    EmailTaken,
    Database(sqlx::Error),
}

impl From<sqlx::Error> for CreateUserError {
    fn from(e: sqlx::Error) -> Self {
        CreateUserError::Database(e)
    }
}

/// Create an account. `username` is already validated and `password_hash` hashed.
pub async fn create_user(
    pool: &PgPool,
    username: &str,
    email: Option<&str>,
    password_hash: &str,
    role: Role,
    tenant: Option<&TenantId>,
) -> Result<User, CreateUserError> {
    let inserted: Result<UserRow, sqlx::Error> = sqlx::query_as(
        "INSERT INTO dashboard_users (id, username, email, password_hash, role, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, username, email, role, tenant_id",
    )
    .bind(Uuid::new_v4())
    .bind(username)
    .bind(email)
    .bind(password_hash)
    .bind(role.as_str())
    .bind(tenant.map(|t| t.as_ref().to_string()))
    .fetch_one(pool)
    .await;
    match inserted {
        Ok(row) => Ok(row.into()),
        Err(sqlx::Error::Database(db)) if db.is_unique_violation() => {
            Err(if db.constraint().is_some_and(|c| c.contains("email")) {
                CreateUserError::EmailTaken
            } else {
                CreateUserError::UsernameTaken
            })
        }
        Err(e) => Err(e.into()),
    }
}

/// Replace a password and end the account's sessions, except `keep_session`
/// (the raw token of the session making the change, if it's the user themself).
/// Returns false when there's no such user.
pub async fn set_password(
    pool: &PgPool,
    user_id: Uuid,
    password_hash: &str,
    keep_session: Option<&str>,
) -> Result<bool, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let updated = sqlx::query("UPDATE dashboard_users SET password_hash = $2 WHERE id = $1")
        .bind(user_id)
        .bind(password_hash)
        .execute(&mut *tx)
        .await?;
    if updated.rows_affected() == 0 {
        return Ok(false);
    }
    sqlx::query("DELETE FROM dashboard_sessions WHERE user_id = $1 AND ($2::bytea IS NULL OR token_hash <> $2)")
        .bind(user_id)
        .bind(keep_session.map(hash_token))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(true)
}

// ------------------------------------------------------------------ sessions

/// Start a session; returns the raw token for the cookie.
pub async fn create_session(executor: impl PgExecutor<'_>, user_id: Uuid) -> Result<String, sqlx::Error> {
    let token = new_token();
    sqlx::query(
        "INSERT INTO dashboard_sessions (token_hash, user_id, expires_at)
         VALUES ($1, $2, now() + make_interval(days => $3))",
    )
    .bind(hash_token(&token))
    .bind(user_id)
    .bind(SESSION_DAYS as i32)
    .execute(executor)
    .await?;
    Ok(token)
}

/// The signed-in user for a session cookie, refreshing its idle timer.
pub async fn session_user(pool: &PgPool, token: &str) -> Result<Option<User>, sqlx::Error> {
    let row: Option<UserRow> = sqlx::query_as(
        "WITH s AS (
             UPDATE dashboard_sessions SET last_seen_at = now()
             WHERE token_hash = $1
               AND expires_at > now()
               AND last_seen_at > now() - make_interval(days => $2)
             RETURNING user_id
         )
         SELECT u.id, u.username, u.email, u.role, u.tenant_id
         FROM s JOIN dashboard_users u ON u.id = s.user_id",
    )
    .bind(hash_token(token))
    .bind(SESSION_IDLE_DAYS as i32)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(User::from))
}

pub async fn delete_session(pool: &PgPool, token: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM dashboard_sessions WHERE token_hash = $1").bind(hash_token(token)).execute(pool).await?;
    Ok(())
}

pub async fn delete_expired_sessions(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "DELETE FROM dashboard_sessions
         WHERE expires_at <= now() OR last_seen_at <= now() - make_interval(days => $1)",
    )
    .bind(SESSION_IDLE_DAYS as i32)
    .execute(pool)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn usernames_are_normalised_and_restricted() {
        assert_eq!(parse_username("  Adrianna.H ").unwrap(), "adrianna.h");
        for bad in ["ab", "-abc", "has space", "émile", &"a".repeat(33)] {
            assert!(parse_username(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn passwords_must_be_long_and_not_contain_the_username() {
        assert!(validate_password("short", "adri").is_err());
        assert!(validate_password("adri-is-my-name-1234", "adri").is_err());
        assert!(validate_password("correct horse battery staple", "adri").is_ok());
        assert!(validate_password(&"x".repeat(129), "adri").is_err());
    }

    #[test]
    fn password_hashes_verify_only_the_right_password() {
        let hash = hash_password("correct horse battery staple").unwrap();
        assert!(verify_password("correct horse battery staple", Some(&hash)));
        assert!(!verify_password("correct horse battery stapler", Some(&hash)));
        assert!(!verify_password("dummy password that is never accepted", None));
    }

    #[test]
    fn tokens_are_random_and_hashes_are_stable() {
        let (a, b) = (new_token(), new_token());
        assert_eq!(a.len(), 64);
        assert_ne!(a, b);
        assert_eq!(hash_token(&a), hash_token(&a));
    }

    #[test]
    fn emails_are_optional_but_validated() {
        assert_eq!(parse_optional_email(None).unwrap(), None);
        assert_eq!(parse_optional_email(Some("  ")).unwrap(), None);
        assert_eq!(parse_optional_email(Some(" Adri@Example.com ")).unwrap().as_deref(), Some("adri@example.com"));
        assert!(parse_optional_email(Some("not an email")).is_err());
    }

    #[test]
    fn generated_passwords_are_long_random_and_valid() {
        let (a, b) = (generate_password(), generate_password());
        assert_ne!(a, b);
        assert_eq!(a.len(), 24);
        assert!(validate_password(&a, "someone").is_ok());
        assert!(a.split('-').all(|g| g.len() == 4 && g.bytes().all(|c| PASSWORD_ALPHABET.contains(&c))));
    }
}

/// 32 symbols, so each random byte maps to one evenly (no bias). No 0/o, 1/l look-alikes.
const PASSWORD_ALPHABET: &[u8; 32] = b"abcdefghijkmnpqrstuvwxyz23456789";

/// A strong random password like `kfp7-x2mq-9wzh-c3rt-v8nd`: 20 random symbols
/// (100 bits) in groups of four, easy to read out or type on a phone.
pub fn generate_password() -> String {
    let mut bytes = [0u8; 20];
    getrandom::fill(&mut bytes).expect("the OS random number generator is unavailable");
    bytes
        .chunks(4)
        .map(|group| group.iter().map(|b| PASSWORD_ALPHABET[(b % 32) as usize] as char).collect::<String>())
        .collect::<Vec<_>>()
        .join("-")
}

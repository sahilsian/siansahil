//! Creating accounts and setting passwords. Shared by the superadmin screen and
//! the admin API (which is how the first superadmin account is made).

use actix_web::web;
use sqlx::PgPool;

use crate::content::{tenant_exists, TenantId};
use crate::dashboard::accounts::{self, CreateUserError, Role, User};
use crate::routes::error::ApiError;

/// Argon2 hashing off the async workers.
pub async fn hash(password: String) -> Result<String, ApiError> {
    web::block(move || accounts::hash_password(&password))
        .await
        .map_err(ApiError::internal)?
        .map_err(ApiError::internal)
}

pub struct NewAccount<'a> {
    pub username: &'a str,
    pub password: &'a str,
    pub email: Option<&'a str>,
    pub role: Role,
    pub tenant: Option<TenantId>,
}

pub async fn create_account(pool: &PgPool, new: NewAccount<'_>) -> Result<User, ApiError> {
    match (new.role, &new.tenant) {
        (Role::Editor, None) => return Err(ApiError::BadRequest("Choose which website this account can edit.".into())),
        (Role::Superadmin, Some(_)) => return Err(ApiError::BadRequest("Superadmins aren't tied to one website.".into())),
        _ => {}
    }
    if let Some(t) = &new.tenant {
        if !tenant_exists(pool, t).await? {
            return Err(ApiError::TenantNotFound);
        }
    }
    let username = accounts::parse_username(new.username).map_err(ApiError::BadRequest)?;
    accounts::validate_password(new.password, &username).map_err(ApiError::BadRequest)?;
    let email = accounts::parse_optional_email(new.email).map_err(ApiError::BadRequest)?;
    let password_hash = hash(new.password.to_string()).await?;

    let user = accounts::create_user(pool, &username, email.as_deref(), &password_hash, new.role, new.tenant.as_ref())
        .await
        .map_err(|e| match e {
            CreateUserError::UsernameTaken => ApiError::Conflict("That username is taken. Choose another.".into()),
            CreateUserError::EmailTaken => ApiError::Conflict("Another account already uses that email address.".into()),
            CreateUserError::Database(e) => e.into(),
        })?;
    tracing::info!(username = %user.username, role = user.role.as_str(), site = ?user.tenant_id, "Dashboard account created");
    Ok(user)
}

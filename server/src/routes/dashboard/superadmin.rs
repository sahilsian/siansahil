use actix_web::{web, HttpResponse};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

use super::account_admin::{create_account, hash, NewAccount};
use super::Superadmin;
use crate::content::TenantId;
use crate::dashboard::accounts::{self, Role};
use crate::routes::error::ApiError;

/// GET /admin/accounts → { users }
pub async fn accounts(_: Superadmin, pool: web::Data<PgPool>) -> Result<HttpResponse, ApiError> {
    Ok(HttpResponse::Ok().json(json!({ "users": accounts::list_users(&pool).await? })))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateRequest {
    username: String,
    password: String,
    site_id: String,
    #[serde(default)]
    email: Option<String>,
}

/// POST /admin/users { username, password, siteId, email? } → 201 { user }
/// Creates an editor for one website.
#[tracing::instrument(name = "Superadmin creates account", skip(admin, body, pool), fields(by = %admin.username, site = %body.site_id))]
pub async fn create_user(
    Superadmin(admin): Superadmin,
    body: web::Json<CreateRequest>,
    pool: web::Data<PgPool>,
) -> Result<HttpResponse, ApiError> {
    let tenant = TenantId::parse(&body.site_id).map_err(ApiError::BadRequest)?;
    let user = create_account(
        &pool,
        NewAccount {
            username: &body.username,
            password: &body.password,
            email: body.email.as_deref(),
            role: Role::Editor,
            tenant: Some(tenant),
        },
    )
    .await?;
    Ok(HttpResponse::Created().json(json!({ "user": user })))
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResetRequest {
    password: String,
}

/// PUT /admin/users/{id}/password { password } → 200. Signs that account out everywhere.
#[tracing::instrument(name = "Superadmin resets password", skip(admin, body, pool), fields(by = %admin.username))]
pub async fn reset_password(
    Superadmin(admin): Superadmin,
    id: web::Path<Uuid>,
    body: web::Json<ResetRequest>,
    pool: web::Data<PgPool>,
) -> Result<HttpResponse, ApiError> {
    let id = id.into_inner();
    let users = accounts::list_users(&pool).await?;
    let target = users.iter().find(|u| u.id == id).ok_or_else(|| ApiError::NotFound("user", "that id".into()))?;
    accounts::validate_password(&body.password, &target.username).map_err(ApiError::BadRequest)?;
    let new_hash = hash(body.password.clone()).await?;
    // Resetting your own password here keeps nothing: you sign in again with the new one.
    accounts::set_password(&pool, id, &new_hash, None).await?;
    tracing::info!(target = %target.username, "Password reset");
    Ok(HttpResponse::Ok().json(json!({ "status": "password_reset" })))
}

/// DELETE /admin/users/{id} → 204. Also ends all of that user's sessions.
#[tracing::instrument(name = "Remove dashboard user", skip(admin, pool), fields(by = %admin.username))]
pub async fn remove_user(
    Superadmin(admin): Superadmin,
    id: web::Path<Uuid>,
    pool: web::Data<PgPool>,
) -> Result<HttpResponse, ApiError> {
    let id = id.into_inner();
    if id == admin.id {
        return Err(ApiError::BadRequest("You can't remove your own account.".into()));
    }
    if accounts::delete_user(&pool, id).await? {
        tracing::info!(removed = %id, "Dashboard user removed");
        Ok(HttpResponse::NoContent().finish())
    } else {
        Err(ApiError::NotFound("user", "that id".into()))
    }
}

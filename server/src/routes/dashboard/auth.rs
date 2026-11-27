use actix_web::{web, HttpRequest, HttpResponse};
use serde_json::json;
use sqlx::PgPool;

use super::{client_key, DashboardConfig, SignedIn};
use crate::dashboard::accounts::{self, MAX_PASSWORD_CHARS};
use crate::dashboard::throttle::AuthThrottles;
use crate::routes::error::ApiError;

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LoginRequest {
    username: String,
    password: String,
}

/// POST /auth/login → sets the session cookie.
#[tracing::instrument(name = "Dashboard sign-in", skip(req, body, pool, config, throttles), fields(username = %body.username.trim().to_lowercase()))]
pub async fn login(
    req: HttpRequest,
    body: web::Json<LoginRequest>,
    pool: web::Data<PgPool>,
    config: web::Data<DashboardConfig>,
    throttles: web::Data<AuthThrottles>,
) -> Result<HttpResponse, ApiError> {
    let client = client_key(&req);
    let username = body.username.trim().to_lowercase();
    if throttles.client.is_blocked(&client) || throttles.username.is_blocked(&username) {
        tracing::warn!("Sign-in refused: too many failed attempts");
        return Err(ApiError::TooManyRequests);
    }

    let fail = || {
        throttles.username.record_failure(&username);
        throttles.client.record_failure(&client);
        ApiError::InvalidCredentials
    };
    if username.len() > 64 || body.password.chars().count() > MAX_PASSWORD_CHARS {
        return Err(fail());
    }

    let found = accounts::find_login(&pool, &username).await?;
    let password = body.password.clone();
    let hash = found.as_ref().map(|(_, hash)| hash.clone());
    let matched = web::block(move || accounts::verify_password(&password, hash.as_deref()))
        .await
        .map_err(ApiError::internal)?;

    let Some((user, _)) = found.filter(|_| matched) else {
        tracing::warn!("Sign-in failed");
        return Err(fail());
    };

    throttles.username.clear(&username);
    if let Err(e) = accounts::delete_expired_sessions(&pool).await {
        tracing::warn!(error = %e, "Couldn't clean up expired sessions");
    }
    let token = accounts::create_session(pool.get_ref(), user.id).await?;
    tracing::info!("Signed in");
    Ok(HttpResponse::Ok().cookie(config.session_cookie(token)).json(json!({ "status": "signed_in" })))
}

/// POST /auth/logout → ends the session (if any) and clears the cookie.
pub async fn logout(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    config: web::Data<DashboardConfig>,
) -> Result<HttpResponse, ApiError> {
    if let Some(cookie) = req.cookie(config.cookie_name()) {
        accounts::delete_session(&pool, cookie.value()).await?;
    }
    Ok(HttpResponse::Ok().cookie(config.removal_cookie()).json(json!({ "status": "signed_out" })))
}

#[derive(serde::Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct SiteSummary {
    id: String,
    name: Option<String>,
    url: Option<String>,
    /// What the site's gallery items are called, e.g. { item: "event", items: "events" } (site.terms).
    #[serde(skip_serializing_if = "Option::is_none")]
    terms: Option<serde_json::Value>,
    /// Dashboard sections the site uses, e.g. { prints: false } (site.features).
    #[serde(skip_serializing_if = "Option::is_none")]
    features: Option<serde_json::Value>,
}

async fn sites_for(pool: &PgPool, only: Option<&str>) -> Result<Vec<SiteSummary>, sqlx::Error> {
    sqlx::query_as(
        "SELECT t.id, d.data->>'name' AS name, d.data->>'url' AS url,
                d.data->'terms' AS terms, d.data->'features' AS features
         FROM tenants t
         LEFT JOIN documents d ON d.tenant_id = t.id AND d.doc_type = 'site' AND d.key = 'main'
         WHERE $1::text IS NULL OR t.id = $1
         ORDER BY t.id",
    )
    .bind(only)
    .fetch_all(pool)
    .await
}

/// GET /me → { user, sites }: who is signed in and which sites they can edit.
pub async fn me(SignedIn(user): SignedIn, pool: web::Data<PgPool>) -> Result<HttpResponse, ApiError> {
    let only = if user.is_superadmin() { None } else { user.tenant_id.as_deref() };
    let sites = sites_for(&pool, only).await?;
    Ok(HttpResponse::Ok().json(json!({ "user": user, "sites": sites })))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChangePasswordRequest {
    current_password: String,
    new_password: String,
}

/// POST /auth/password { currentPassword, newPassword } — change your own password.
/// Signs out your other devices; this one stays signed in.
#[tracing::instrument(name = "Change dashboard password", skip(user, req, body, pool, config, throttles), fields(username = %user.username))]
pub async fn change_password(
    SignedIn(user): SignedIn,
    req: HttpRequest,
    body: web::Json<ChangePasswordRequest>,
    pool: web::Data<PgPool>,
    config: web::Data<DashboardConfig>,
    throttles: web::Data<AuthThrottles>,
) -> Result<HttpResponse, ApiError> {
    if throttles.username.is_blocked(&user.username) {
        return Err(ApiError::TooManyRequests);
    }
    accounts::validate_password(&body.new_password, &user.username).map_err(ApiError::BadRequest)?;
    if body.current_password.chars().count() > MAX_PASSWORD_CHARS {
        return Err(ApiError::BadRequest("Your current password is incorrect.".into()));
    }

    let stored = accounts::password_hash(&pool, user.id).await?;
    let current = body.current_password.clone();
    let matched = web::block(move || accounts::verify_password(&current, stored.as_deref()))
        .await
        .map_err(ApiError::internal)?;
    if !matched {
        throttles.username.record_failure(&user.username);
        tracing::warn!("Password change refused: wrong current password");
        return Err(ApiError::BadRequest("Your current password is incorrect.".into()));
    }

    let new_hash = super::account_admin::hash(body.new_password.clone()).await?;
    let this_session = req.cookie(config.cookie_name()).map(|c| c.value().to_string());
    accounts::set_password(&pool, user.id, &new_hash, this_session.as_deref()).await?;
    tracing::info!("Password changed");
    Ok(HttpResponse::Ok().json(json!({ "status": "password_changed" })))
}

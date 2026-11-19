use actix_web::{web, HttpResponse};
use serde_json::json;
use sqlx::PgPool;

use crate::content::TenantId;
use crate::dashboard::accounts::{generate_password, Role};
use crate::routes::dashboard::account_admin::{create_account, NewAccount};
use crate::routes::error::ApiError;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateRequest {
    username: String,
    /// "superadmin" (no tenantId) or "editor" (with tenantId).
    role: String,
    #[serde(default)]
    tenant_id: Option<String>,
    /// Omit to have a strong one generated (returned once in the response).
    #[serde(default)]
    password: Option<String>,
    #[serde(default)]
    email: Option<String>,
}

/// POST /admin/dashboard-users { username, role, tenantId?, password?, email? }
/// → 201 { user, password? }
///
/// How the very first superadmin is made: there's no dashboard account yet to
/// create it from, so this uses the admin API key instead.
#[tracing::instrument(name = "Admin API creates dashboard account", skip(body, pool), fields(role = %body.role))]
pub async fn create(body: web::Json<CreateRequest>, pool: web::Data<PgPool>) -> Result<HttpResponse, ApiError> {
    let role = Role::parse(&body.role).map_err(ApiError::BadRequest)?;
    let tenant = body.tenant_id.as_deref().map(TenantId::parse).transpose().map_err(ApiError::BadRequest)?;
    let generated = body.password.is_none().then(generate_password);
    let password = body.password.as_deref().or(generated.as_deref()).expect("a password is always set");

    let user = create_account(
        &pool,
        NewAccount { username: &body.username, password, email: body.email.as_deref(), role, tenant },
    )
    .await?;
    Ok(HttpResponse::Created().json(json!({ "user": user, "password": generated })))
}

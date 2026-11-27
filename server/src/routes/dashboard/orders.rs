//! Print orders in the dashboard: the list, and ticking an order off as shipped.

use actix_web::{web, HttpResponse};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

use super::{site_for, SignedIn};
use crate::content::tenant_exists;
use crate::dashboard::orders::{list_orders, set_shipped};
use crate::dashboard::stripe::Stripe;
use crate::routes::error::ApiError;

/// GET /sites/{site}/orders → { orders: [...], connected }
/// `connected`: this site's Stripe webhook is set up, so new sales are recorded.
pub async fn list(
    SignedIn(user): SignedIn,
    site: web::Path<String>,
    pool: web::Data<PgPool>,
    stripe: web::Data<Stripe>,
) -> Result<HttpResponse, ApiError> {
    let tenant = site_for(&user, &site)?;
    if !tenant_exists(&pool, &tenant).await? {
        return Err(ApiError::TenantNotFound);
    }
    let orders = list_orders(&pool, &tenant).await?;
    Ok(HttpResponse::Ok().json(json!({ "orders": orders, "connected": stripe.webhook_secret(&tenant).is_some() })))
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ShippedRequest {
    shipped: bool,
}

/// PUT /sites/{site}/orders/{id} { shipped } → 204
#[tracing::instrument(name = "Mark order shipped", skip(user, path, body, pool), fields(user = %user.username, site = %path.0, order = %path.1))]
pub async fn update(
    SignedIn(user): SignedIn,
    path: web::Path<(String, String)>,
    body: web::Json<ShippedRequest>,
    pool: web::Data<PgPool>,
) -> Result<HttpResponse, ApiError> {
    let (site, id) = path.into_inner();
    let tenant = site_for(&user, &site)?;
    let id = Uuid::parse_str(&id).map_err(|_| ApiError::NotFound("order", id.clone()))?;
    if !set_shipped(&pool, &tenant, id, body.shipped).await? {
        return Err(ApiError::NotFound("order", id.to_string()));
    }
    Ok(HttpResponse::NoContent().finish())
}

use actix_web::{web, HttpResponse};
use serde_json::json;
use sqlx::PgPool;

use super::{site_for, SignedIn};
use crate::content::tenant_exists;
use crate::mailing_list::{add_subscriber, list_subscribers, remove_subscriber, SubscriberAddress};
use crate::routes::error::ApiError;

/// GET /sites/{site}/mailing-list → { subscribers: [{ email, subscribedAt }] }, newest first
pub async fn list(
    SignedIn(user): SignedIn,
    site: web::Path<String>,
    pool: web::Data<PgPool>,
) -> Result<HttpResponse, ApiError> {
    let tenant = site_for(&user, &site)?;
    if !tenant_exists(&pool, &tenant).await? {
        return Err(ApiError::TenantNotFound);
    }
    Ok(HttpResponse::Ok().json(json!({ "subscribers": list_subscribers(&pool, &tenant).await? })))
}

/// Most addresses accepted in one go.
const MAX_IMPORT: usize = 5_000;

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AddRequest {
    emails: Vec<String>,
}

/// POST /sites/{site}/mailing-list/add { emails: [...] } → { added, alreadySubscribed, invalid: [...] }
/// For bringing in an existing list. No notification emails are sent.
#[tracing::instrument(name = "Dashboard adds subscribers", skip(user, site, body, pool), fields(user = %user.username, site = %site, count = body.emails.len()))]
pub async fn add(
    SignedIn(user): SignedIn,
    site: web::Path<String>,
    body: web::Json<AddRequest>,
    pool: web::Data<PgPool>,
) -> Result<HttpResponse, ApiError> {
    let tenant = site_for(&user, &site)?;
    if !tenant_exists(&pool, &tenant).await? {
        return Err(ApiError::TenantNotFound);
    }
    if body.emails.len() > MAX_IMPORT {
        return Err(ApiError::BadRequest(format!("Add at most {MAX_IMPORT} addresses at a time.")));
    }
    let mut valid = Vec::new();
    let mut invalid = Vec::new();
    for raw in body.emails.iter().map(|e| e.trim()).filter(|e| !e.is_empty()) {
        match SubscriberAddress::parse(raw) {
            Ok(email) if !valid.contains(&email) => valid.push(email),
            Ok(_) => {}
            Err(_) => invalid.push(raw.chars().take(254).collect::<String>()),
        }
    }
    let mut added = 0;
    for email in &valid {
        if add_subscriber(&pool, &tenant, email).await? {
            added += 1;
        }
    }
    tracing::info!(added, invalid = invalid.len(), "Subscribers added from the dashboard");
    Ok(HttpResponse::Ok().json(json!({ "added": added, "alreadySubscribed": valid.len() - added, "invalid": invalid })))
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RemoveRequest {
    email: String,
}

/// POST /sites/{site}/mailing-list/remove { email } → 204
/// (A body rather than the address in the URL, so addresses don't end up in access logs.)
#[tracing::instrument(name = "Dashboard removes subscriber", skip(user, site, body, pool), fields(user = %user.username, site = %site))]
pub async fn remove(
    SignedIn(user): SignedIn,
    site: web::Path<String>,
    body: web::Json<RemoveRequest>,
    pool: web::Data<PgPool>,
) -> Result<HttpResponse, ApiError> {
    let tenant = site_for(&user, &site)?;
    let email = SubscriberAddress::parse(&body.email).map_err(ApiError::BadRequest)?;
    if remove_subscriber(&pool, &tenant, &email).await? {
        Ok(HttpResponse::NoContent().finish())
    } else {
        Err(ApiError::NotFound("subscriber", email.as_ref().to_string()))
    }
}

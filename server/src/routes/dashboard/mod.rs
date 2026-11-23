//! Dashboard API, used only by the dashboard web app this server serves at
//! `/dashboard` (same origin, so no CORS is configured for it).
//!
//!   POST   /api/v1/dashboard/auth/login                 { username, password }
//!   POST   /api/v1/dashboard/auth/logout
//!   POST   /api/v1/dashboard/auth/password              { currentPassword, newPassword }
//!   GET    /api/v1/dashboard/me
//!   GET    /api/v1/dashboard/sites/{siteId}/documents?type=page
//!   GET    /api/v1/dashboard/sites/{siteId}/documents/{type}/{key}
//!   PUT    /api/v1/dashboard/sites/{siteId}/documents/{type}/{key}   { data, baseVersion }  (text-only changes)
//!   GET    /api/v1/dashboard/sites/{siteId}/artworks
//!   POST   /api/v1/dashboard/sites/{siteId}/artworks                 { slug, artwork, collections }
//!   PUT    /api/v1/dashboard/sites/{siteId}/artworks/{slug}          { artwork, collections }
//!   DELETE /api/v1/dashboard/sites/{siteId}/artworks/{slug}
//!   GET    /api/v1/dashboard/sites/{siteId}/media                    images already uploaded or in use
//!   POST   /api/v1/dashboard/sites/{siteId}/media?name=photo.jpg     body = image bytes
//!   GET    /api/v1/dashboard/sites/{siteId}/mailing-list
//!   POST   /api/v1/dashboard/sites/{siteId}/mailing-list/add         { emails } (import an existing list)
//!   POST   /api/v1/dashboard/sites/{siteId}/mailing-list/remove      { email }
//!   GET    /api/v1/dashboard/sites/{siteId}/store                    print sizes + whether Stripe is set up
//!   PUT    /api/v1/dashboard/sites/{siteId}/store                    { printSizes }
//!   GET    /api/v1/dashboard/sites/{siteId}/prints
//!   POST   /api/v1/dashboard/sites/{siteId}/prints                   { slug, print }
//!   PUT    /api/v1/dashboard/sites/{siteId}/prints/{slug}            { print }
//!   DELETE /api/v1/dashboard/sites/{siteId}/prints/{slug}
//!   PUT    /api/v1/dashboard/sites/{siteId}/artworks/{slug}/store    { originalAvailable } (original by inquiry)
//!   DELETE /api/v1/dashboard/sites/{siteId}/artworks/{slug}/store    (Remove from store)
//!   GET    /api/v1/dashboard/admin/accounts                          (superadmin)
//!   POST   /api/v1/dashboard/admin/users                             { username, password, siteId, email? } (superadmin)
//!   PUT    /api/v1/dashboard/admin/users/{id}/password               { password } (superadmin)
//!   DELETE /api/v1/dashboard/admin/users/{id}                        (superadmin)
//!
//! Security:
//! - Signed-in state is an httpOnly, SameSite=Strict session cookie (`Secure` and
//!   `__Host-` prefixed in production), so page scripts can't read it and other
//!   sites can't send it.
//! - Every non-GET request must carry `X-Dashboard-Request: 1`, which a cross-site
//!   form or script can't add without CORS approval (never granted here), and is
//!   refused if the browser reports it as cross-site (`Sec-Fetch-Site`).
//! - Editors can only reach their own site; superadmins can reach every site.

pub mod account_admin;
mod artworks;
mod auth;
mod documents;
mod mailing_list;
mod media;
mod prints;
pub(crate) mod store;
mod superadmin;

use std::future::Future;
use std::pin::Pin;

use actix_web::body::MessageBody;
use actix_web::cookie::{time, Cookie, SameSite};
use actix_web::dev::{Payload, ServiceRequest, ServiceResponse};
use actix_web::http::Method;
use actix_web::middleware::Next;
use actix_web::{web, FromRequest, HttpRequest};
use sqlx::PgPool;

use crate::config::DashboardSettings;
use crate::content::TenantId;
use crate::dashboard::accounts::{self, User, SESSION_DAYS};
use crate::routes::error::ApiError;

/// Largest JSON body (a full site document).
const MAX_JSON_BYTES: usize = 1024 * 1024;

/// Dashboard settings plus this server's public URL, shared with handlers.
#[derive(Clone)]
pub struct DashboardConfig {
    pub settings: DashboardSettings,
    /// e.g. `https://server-xyz.ondigitalocean.app` (no trailing slash).
    pub api_base_url: String,
}

impl DashboardConfig {
    pub fn new(settings: DashboardSettings, api_base_url: &str) -> Self {
        Self { settings, api_base_url: api_base_url.trim_end_matches('/').to_string() }
    }

    pub fn cookie_name(&self) -> &'static str {
        if self.settings.secure_cookies { "__Host-dashboard_session" } else { "dashboard_session" }
    }

    fn session_cookie(&self, token: String) -> Cookie<'static> {
        Cookie::build(self.cookie_name(), token)
            .path("/")
            .http_only(true)
            .secure(self.settings.secure_cookies)
            .same_site(SameSite::Strict)
            .max_age(time::Duration::days(SESSION_DAYS))
            .finish()
    }

    fn removal_cookie(&self) -> Cookie<'static> {
        let mut cookie = Cookie::build(self.cookie_name(), "")
            .path("/")
            .http_only(true)
            .secure(self.settings.secure_cookies)
            .same_site(SameSite::Strict)
            .finish();
        cookie.make_removal();
        cookie
    }
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.app_data(crate::routes::error::json_config(MAX_JSON_BYTES))
        .app_data(crate::routes::error::query_config())
        .route("/auth/login", web::post().to(auth::login))
        .route("/auth/logout", web::post().to(auth::logout))
        .route("/auth/password", web::post().to(auth::change_password))
        .route("/me", web::get().to(auth::me))
        .route("/sites/{site}/documents", web::get().to(documents::list))
        .service(
            web::resource("/sites/{site}/documents/{doc_type}/{key}")
                .route(web::get().to(documents::get))
                .route(web::put().to(documents::put)),
        )
        .service(
            web::resource("/sites/{site}/artworks")
                .route(web::get().to(artworks::list))
                .route(web::post().to(artworks::create)),
        )
        .service(
            web::resource("/sites/{site}/artworks/{slug}")
                .route(web::put().to(artworks::update))
                .route(web::delete().to(artworks::delete)),
        )
        .service(
            web::resource("/sites/{site}/media")
                .app_data(web::PayloadConfig::new(crate::dashboard::media::MAX_UPLOAD_BYTES))
                .route(web::get().to(media::list))
                .route(web::post().to(media::upload)),
        )
        .route("/sites/{site}/mailing-list", web::get().to(mailing_list::list))
        .route("/sites/{site}/mailing-list/add", web::post().to(mailing_list::add))
        .route("/sites/{site}/mailing-list/remove", web::post().to(mailing_list::remove))
        .service(
            web::resource("/sites/{site}/store")
                .route(web::get().to(store::settings))
                .route(web::put().to(store::save_settings)),
        )
        .service(
            web::resource("/sites/{site}/prints")
                .route(web::get().to(prints::list))
                .route(web::post().to(prints::create)),
        )
        .service(
            web::resource("/sites/{site}/prints/{slug}")
                .route(web::put().to(prints::update))
                .route(web::delete().to(prints::delete)),
        )
        .service(
            web::resource("/sites/{site}/artworks/{slug}/store")
                .route(web::put().to(store::list))
                .route(web::delete().to(store::unlist)),
        )
        .route("/admin/accounts", web::get().to(superadmin::accounts))
        .route("/admin/users", web::post().to(superadmin::create_user))
        .route("/admin/users/{id}", web::delete().to(superadmin::remove_user))
        .route("/admin/users/{id}/password", web::put().to(superadmin::reset_password));
}

/// Refuse state-changing requests that didn't come from the dashboard itself.
pub async fn require_same_origin(
    req: ServiceRequest,
    next: Next<impl MessageBody>,
) -> Result<ServiceResponse<impl MessageBody>, actix_web::Error> {
    let safe_method = matches!(*req.method(), Method::GET | Method::HEAD | Method::OPTIONS);
    if !safe_method {
        let marked = req.headers().get("x-dashboard-request").is_some_and(|v| v == "1");
        let same_site = req.headers().get("sec-fetch-site").is_none_or(|v| v == "same-origin");
        if !marked || !same_site {
            tracing::warn!(path = %req.path(), "Refused a cross-site dashboard request");
            return Err(ApiError::Forbidden("This request must come from the dashboard.".into()).into());
        }
    }
    next.call(req).await
}

/// The signed-in dashboard user. Handlers taking this answer 401 without a valid session.
pub struct SignedIn(pub User);

impl FromRequest for SignedIn {
    type Error = ApiError;
    type Future = Pin<Box<dyn Future<Output = Result<Self, ApiError>>>>;

    fn from_request(req: &HttpRequest, _: &mut Payload) -> Self::Future {
        let pool = req.app_data::<web::Data<PgPool>>().cloned();
        let token = req
            .app_data::<web::Data<DashboardConfig>>()
            .and_then(|config| req.cookie(config.cookie_name()))
            .map(|cookie| cookie.value().to_string());
        Box::pin(async move {
            let (Some(pool), Some(token)) = (pool, token) else { return Err(ApiError::NotSignedIn) };
            if token.len() != 64 {
                return Err(ApiError::NotSignedIn);
            }
            accounts::session_user(&pool, &token).await?.map(SignedIn).ok_or(ApiError::NotSignedIn)
        })
    }
}

/// A signed-in superadmin; anyone else gets 403.
pub struct Superadmin(pub User);

impl FromRequest for Superadmin {
    type Error = ApiError;
    type Future = Pin<Box<dyn Future<Output = Result<Self, ApiError>>>>;

    fn from_request(req: &HttpRequest, payload: &mut Payload) -> Self::Future {
        let signed_in = SignedIn::from_request(req, payload);
        Box::pin(async move {
            let SignedIn(user) = signed_in.await?;
            if user.is_superadmin() {
                Ok(Superadmin(user))
            } else {
                Err(ApiError::Forbidden("Only a superadmin can do this.".into()))
            }
        })
    }
}

/// The site in the URL, if this user may work on it.
fn site_for(user: &User, raw: &str) -> Result<TenantId, ApiError> {
    let tenant = TenantId::parse(raw).map_err(ApiError::BadRequest)?;
    if user.can_access(&tenant) {
        Ok(tenant)
    } else {
        tracing::warn!(user = %user.username, site = %raw, "Refused access to another site");
        Err(ApiError::Forbidden("You don't have access to this site.".into()))
    }
}

/// Best-effort client address for throttling. DigitalOcean's edge sets
/// `do-connecting-ip`; locally there's only the socket address.
fn client_key(req: &HttpRequest) -> String {
    let header = |name: &str| req.headers().get(name).and_then(|v| v.to_str().ok()).map(str::trim).map(str::to_string);
    header("do-connecting-ip")
        .or_else(|| header("cf-connecting-ip"))
        .or_else(|| req.peer_addr().map(|a| a.ip().to_string()))
        .unwrap_or_else(|| "unknown".into())
}

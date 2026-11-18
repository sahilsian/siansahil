//! Admin API: tenant and document CRUD. Every route requires
//! `Authorization: Bearer <admin key>` (see `auth::require_admin_key`).
//!
//!   GET    /api/v1/admin/tenants
//!   POST   /api/v1/admin/tenants                                   { id, domains? }
//!   GET    /api/v1/admin/tenants/{tenantId}
//!   PUT    /api/v1/admin/tenants/{tenantId}                        { domains }
//!   DELETE /api/v1/admin/tenants/{tenantId}                        (deletes its documents too)
//!   GET    /api/v1/admin/tenants/{tenantId}/documents?type=page
//!   GET    /api/v1/admin/tenants/{tenantId}/documents/{type}/{key}
//!   PUT    /api/v1/admin/tenants/{tenantId}/documents/{type}/{key} body = the document
//!   DELETE /api/v1/admin/tenants/{tenantId}/documents/{type}/{key}
//!   GET    /api/v1/admin/tenants/{tenantId}/mailing-list
//!   DELETE /api/v1/admin/tenants/{tenantId}/mailing-list/{email}

mod auth;
mod documents;
mod mailing_list;
mod tenants;

use actix_web::web;

pub use auth::{require_admin_key, AdminKey, MIN_ADMIN_KEY_LEN};

/// Largest accepted document body.
const MAX_BODY_BYTES: usize = 1024 * 1024;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.app_data(crate::routes::error::json_config(MAX_BODY_BYTES))
        .app_data(crate::routes::error::query_config())
        .service(
            web::resource("/tenants")
                .route(web::get().to(tenants::list))
                .route(web::post().to(tenants::create)),
        )
        .service(
            web::resource("/tenants/{tenant_id}")
                .route(web::get().to(tenants::get))
                .route(web::put().to(tenants::update))
                .route(web::delete().to(tenants::delete)),
        )
        .route("/tenants/{tenant_id}/documents", web::get().to(documents::list))
        .service(
            web::resource("/tenants/{tenant_id}/documents/{doc_type}/{key}")
                .route(web::get().to(documents::get))
                .route(web::put().to(documents::put))
                .route(web::delete().to(documents::delete)),
        )
        .route("/tenants/{tenant_id}/mailing-list", web::get().to(mailing_list::list))
        .route("/tenants/{tenant_id}/mailing-list/{email}", web::delete().to(mailing_list::remove));
}

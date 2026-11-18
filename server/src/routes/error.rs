use actix_web::http::{header, StatusCode};
use actix_web::{HttpResponse, ResponseError};
use serde_json::json;

/// Errors from the content and admin APIs, rendered as
/// `{ "error": "<code>", "message": "<text>" }`.
#[derive(Debug)]
pub enum ApiError {
    /// Invalid id/key/body → 400 `bad_request`.
    BadRequest(String),
    /// Missing/wrong admin key → 401 `unauthorized`.
    Unauthorized,
    TenantNotFound,
    /// e.g. NotFound("page", "about") → 404 `not_found`.
    NotFound(&'static str, String),
    /// e.g. creating a tenant that exists → 409 `conflict`.
    Conflict(String),
    Database(sqlx::Error),
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ApiError::BadRequest(msg) | ApiError::Conflict(msg) => write!(f, "{msg}"),
            ApiError::Unauthorized => write!(f, "A valid admin API key is required."),
            ApiError::TenantNotFound => write!(f, "Tenant not found."),
            ApiError::NotFound(kind, key) => write!(f, "No {kind} named '{key}'."),
            ApiError::Database(_) => write!(f, "Something went wrong."),
        }
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(e: sqlx::Error) -> Self {
        tracing::error!("Database query failed: {e:?}");
        ApiError::Database(e)
    }
}

impl ResponseError for ApiError {
    fn status_code(&self) -> StatusCode {
        match self {
            ApiError::BadRequest(_) => StatusCode::BAD_REQUEST,
            ApiError::Unauthorized => StatusCode::UNAUTHORIZED,
            ApiError::TenantNotFound | ApiError::NotFound(..) => StatusCode::NOT_FOUND,
            ApiError::Conflict(_) => StatusCode::CONFLICT,
            ApiError::Database(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn error_response(&self) -> HttpResponse {
        let code = match self {
            ApiError::BadRequest(_) => "bad_request",
            ApiError::Unauthorized => "unauthorized",
            ApiError::TenantNotFound => "tenant_not_found",
            ApiError::NotFound(..) => "not_found",
            ApiError::Conflict(_) => "conflict",
            ApiError::Database(_) => "internal_error",
        };
        let mut response = HttpResponse::build(self.status_code());
        if matches!(self, ApiError::Unauthorized) {
            response.insert_header((header::WWW_AUTHENTICATE, "Bearer"));
        }
        // Errors must never be cached by browsers/CDNs.
        response.insert_header((header::CACHE_CONTROL, "no-store"));
        response.json(json!({ "error": code, "message": self.to_string() }))
    }
}

/// Turn malformed JSON bodies / query strings into the same JSON 400.
pub fn json_config(limit_bytes: usize) -> actix_web::web::JsonConfig {
    actix_web::web::JsonConfig::default()
        .limit(limit_bytes)
        .error_handler(|err, _req| ApiError::BadRequest(format!("Invalid request body: {err}")).into())
}

pub fn query_config() -> actix_web::web::QueryConfig {
    actix_web::web::QueryConfig::default()
        .error_handler(|err, _req| ApiError::BadRequest(format!("Invalid query string: {err}")).into())
}

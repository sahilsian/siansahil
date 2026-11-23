use actix_web::http::{header, StatusCode};
use actix_web::{HttpResponse, ResponseError};
use serde_json::json;

/// Errors from the APIs, rendered as `{ "error": "<code>", "message": "<text>" }`.
#[derive(Debug)]
pub enum ApiError {
    /// Invalid id/key/body → 400 `bad_request`.
    BadRequest(String),
    /// Missing/wrong admin key → 401 `unauthorized`.
    Unauthorized,
    /// Dashboard request without a valid session → 401 `not_signed_in`.
    NotSignedIn,
    /// Wrong username/password → 401 `invalid_credentials`.
    InvalidCredentials,
    /// Signed in, but not allowed to do this → 403 `forbidden`.
    Forbidden(String),
    TenantNotFound,
    /// e.g. NotFound("page", "about") → 404 `not_found`.
    NotFound(&'static str, String),
    /// e.g. creating a tenant that exists → 409 `conflict`.
    Conflict(String),
    /// Too many failed attempts → 429 `too_many_requests`.
    TooManyRequests,
    /// A service we depend on (e.g. Stripe) refused or failed → 502 `upstream_error`.
    /// The message is shown to the user, so keep secrets out of it.
    Upstream(String),
    Database(sqlx::Error),
    /// Any other server-side failure (details are logged, not returned) → 500.
    Internal(String),
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ApiError::BadRequest(msg) | ApiError::Conflict(msg) | ApiError::Forbidden(msg) | ApiError::Upstream(msg) => {
                write!(f, "{msg}")
            }
            ApiError::Unauthorized => write!(f, "A valid admin API key is required."),
            ApiError::NotSignedIn => write!(f, "Please sign in."),
            ApiError::InvalidCredentials => write!(f, "Incorrect username or password."),
            ApiError::TenantNotFound => write!(f, "Tenant not found."),
            ApiError::NotFound(kind, key) => write!(f, "No {kind} named '{key}'."),
            ApiError::TooManyRequests => write!(f, "Too many attempts. Please wait 15 minutes and try again."),
            ApiError::Database(_) | ApiError::Internal(_) => write!(f, "Something went wrong."),
        }
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(e: sqlx::Error) -> Self {
        tracing::error!("Database query failed: {e:?}");
        ApiError::Database(e)
    }
}

impl ApiError {
    pub fn internal(e: impl std::fmt::Display) -> Self {
        tracing::error!("Internal error: {e}");
        ApiError::Internal(e.to_string())
    }
}

impl ResponseError for ApiError {
    fn status_code(&self) -> StatusCode {
        match self {
            ApiError::BadRequest(_) => StatusCode::BAD_REQUEST,
            ApiError::Unauthorized | ApiError::NotSignedIn | ApiError::InvalidCredentials => StatusCode::UNAUTHORIZED,
            ApiError::Forbidden(_) => StatusCode::FORBIDDEN,
            ApiError::TenantNotFound | ApiError::NotFound(..) => StatusCode::NOT_FOUND,
            ApiError::Conflict(_) => StatusCode::CONFLICT,
            ApiError::TooManyRequests => StatusCode::TOO_MANY_REQUESTS,
            ApiError::Upstream(_) => StatusCode::BAD_GATEWAY,
            ApiError::Database(_) | ApiError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn error_response(&self) -> HttpResponse {
        let code = match self {
            ApiError::BadRequest(_) => "bad_request",
            ApiError::Unauthorized => "unauthorized",
            ApiError::NotSignedIn => "not_signed_in",
            ApiError::InvalidCredentials => "invalid_credentials",
            ApiError::Forbidden(_) => "forbidden",
            ApiError::TenantNotFound => "tenant_not_found",
            ApiError::NotFound(..) => "not_found",
            ApiError::Conflict(_) => "conflict",
            ApiError::TooManyRequests => "too_many_requests",
            ApiError::Upstream(_) => "upstream_error",
            ApiError::Database(_) | ApiError::Internal(_) => "internal_error",
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

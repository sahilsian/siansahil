use actix_web::{web, HttpResponse};

use crate::migration_runner::{MigrationState, MigrationStatus};

/// Readiness: 200 once the schema is up to date, 503 while migrations are
/// pending or failing. Unlike `health_check` (liveness: "the process is up",
/// used by DigitalOcean to decide a deployment succeeded), this says whether
/// the database is actually usable. The body never includes error details.
pub async fn ready(status: web::Data<MigrationStatus>) -> HttpResponse {
    let state = status.get();
    let mut response = if state == MigrationState::Applied { HttpResponse::Ok() } else { HttpResponse::ServiceUnavailable() };
    response.insert_header(("Cache-Control", "no-store")).json(state)
}

mod common;

use common::{spawn_app, spawn_app_with_migrations};
use server::migration_runner::MigrationStatus;

#[actix_web::test]
async fn health_check_returns_ok() {
    let app = spawn_app().await;

    let client = reqwest::Client::new();

    let response = client
        .get(&format!("{}/api/v1/diagnostics/health_check", &app.address))
        .send()
        .await
        .expect("Failed to execute request.");

    assert!(response.status().is_success());
    assert_eq!(Some(0), response.content_length());
}

#[actix_web::test]
async fn ready_is_200_once_migrations_are_applied() {
    let app = spawn_app().await;
    let response = reqwest::get(format!("{}/api/v1/diagnostics/ready", &app.address)).await.unwrap();

    assert_eq!(response.status().as_u16(), 200);
    assert_eq!(response.json::<serde_json::Value>().await.unwrap(), serde_json::json!({ "state": "applied" }));
}

#[actix_web::test]
async fn ready_is_503_while_migrations_are_pending_but_health_check_still_passes() {
    let app = spawn_app_with_migrations(MigrationStatus::pending()).await;

    let ready = reqwest::get(format!("{}/api/v1/diagnostics/ready", &app.address)).await.unwrap();
    assert_eq!(ready.status().as_u16(), 503);
    assert_eq!(ready.json::<serde_json::Value>().await.unwrap(), serde_json::json!({ "state": "pending" }));

    // Liveness is unaffected: this is what lets a deployment succeed while migrations retry.
    let health = reqwest::get(format!("{}/api/v1/diagnostics/health_check", &app.address)).await.unwrap();
    assert!(health.status().is_success());
}

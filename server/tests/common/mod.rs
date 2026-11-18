//! Shared integration-test setup: each test gets its own server on a random
//! port and its own freshly migrated, randomly named Postgres database.
#![allow(dead_code)]

use std::net::TcpListener;
use std::sync::LazyLock;

use secrecy::{ExposeSecret, Secret};
use server::config::{get_config, DatabaseSettings};
use server::email_client::EmailClient;
use server::routes::admin::AdminKey;
use server::startup::run;
use server::telemetry::{get_subscriber, init_subscriber};
use sqlx::postgres::PgPoolOptions;
use sqlx::{Executor, PgPool};
use uuid::Uuid;
use wiremock::MockServer;

pub struct TestApp {
    pub address: String,
    pub db_pool: PgPool,
    /// The admin key the app was started with (from config/local.yaml).
    pub admin_key: String,
    /// Stands in for Resend: mount expectations on it to assert on outgoing email.
    pub email_server: MockServer,
}

static TRACING: LazyLock<()> = LazyLock::new(|| {
    if std::env::var("TEST_LOG").is_ok() {
        init_subscriber(get_subscriber("test".into(), "info".into(), std::io::stdout));
    } else {
        init_subscriber(get_subscriber("test".into(), "info".into(), std::io::sink));
    }
});

pub async fn spawn_app() -> TestApp {
    LazyLock::force(&TRACING);

    let listener = TcpListener::bind("127.0.0.1:0").expect("Failed to bind to address");
    let port = listener.local_addr().unwrap().port();
    let address = format!("http://127.0.0.1:{port}");

    let mut config = get_config().expect("Failed to read configuration.");
    config.database.database_name = Uuid::new_v4().to_string();
    let db_pool = configure_database(&config.database).await;

    let email_server = MockServer::start().await;
    config.email.base_url = email_server.uri();
    config.email.resend_api_key = Some(Secret::new("test-resend-key".to_string()));

    let admin_key = config.admin.api_key.expose_secret().clone();
    let server = run(
        listener,
        db_pool.clone(),
        AdminKey::new(&config.admin.api_key).expect("valid admin key"),
        EmailClient::new(&config.email),
    )
    .expect("Failed to bind to address");
    let _ = tokio::spawn(server);

    TestApp { address, db_pool, admin_key, email_server }
}

pub async fn configure_database(config: &DatabaseSettings) -> PgPool {
    let maintenance_settings = DatabaseSettings {
        database_name: "postgres".to_string(),
        username: "postgres".to_string(),
        password: Secret::new("password".to_string()),
        ..config.clone()
    };

    let maintenance = PgPoolOptions::new().connect_lazy_with(maintenance_settings.connect_options());
    maintenance
        .execute(format!(r#"CREATE DATABASE "{}";"#, config.database_name).as_str())
        .await
        .expect("Failed to create the database");

    let pool = PgPool::connect_with(config.connect_options()).await.expect("Failed to connect to Postgres");
    sqlx::migrate!("./migrations").run(&pool).await.expect("Failed to migrate the database");
    pool
}

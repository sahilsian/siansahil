//! Shared integration-test setup: each test gets its own server on a random
//! port and its own freshly migrated, randomly named Postgres database.
#![allow(dead_code)]

use std::net::TcpListener;
use std::sync::LazyLock;

use secrecy::{ExposeSecret, Secret};
use server::config::{get_config, DatabaseSettings, R2Settings};
use server::email_client::EmailClient;
use server::migration_runner::MigrationStatus;
use server::routes::admin::AdminKey;
use server::dashboard::media::MediaStore;
use server::dashboard::stripe::Stripe;
use server::routes::dashboard::DashboardConfig;
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
    /// Stands in for Cloudflare R2 when the app was spawned with `spawn_app_with_r2`.
    pub r2_server: MockServer,
    /// Stands in for Stripe. The `acme` site has a Stripe key; other sites do not.
    pub stripe_server: MockServer,
}

static TRACING: LazyLock<()> = LazyLock::new(|| {
    if std::env::var("TEST_LOG").is_ok() {
        init_subscriber(get_subscriber("test".into(), "info".into(), std::io::stdout));
    } else {
        init_subscriber(get_subscriber("test".into(), "info".into(), std::io::sink));
    }
});

pub async fn spawn_app() -> TestApp {
    spawn_app_with_migrations(MigrationStatus::applied()).await
}

/// Like `spawn_app`, but uploads go to a fake R2 (`r2_server`) served from `https://images.test`.
pub async fn spawn_app_with_r2() -> TestApp {
    spawn(MigrationStatus::applied(), true).await
}

/// Like `spawn_app`, but with a chosen migration status (the test DB is always migrated).
pub async fn spawn_app_with_migrations(migrations: MigrationStatus) -> TestApp {
    spawn(migrations, false).await
}

async fn spawn(migrations: MigrationStatus, use_r2: bool) -> TestApp {
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

    let r2_server = MockServer::start().await;
    if use_r2 {
        config.media.r2 = Some(R2Settings {
            account_id: "test-account".into(),
            bucket: "test-bucket".into(),
            access_key_id: "test-access-key".into(),
            secret_access_key: Secret::new("test-secret".into()),
            public_base_url: "https://images.test".into(),
            endpoint: Some(r2_server.uri()),
        });
    }
    let media = MediaStore::from_settings(&config.media, &address).expect("valid media settings");

    let stripe_server = MockServer::start().await;
    config.stripe.api_base = stripe_server.uri();
    // Tests exercise the real Stripe calls, so test mode is off even though local.yaml turns it on.
    config.stripe.offline = false;
    config.stripe.secret_keys.insert("acme".into(), Secret::new("sk_test_acme".into()));

    let admin_key = config.admin.api_key.expose_secret().clone();
    let server = run(
        listener,
        db_pool.clone(),
        AdminKey::new(&config.admin.api_key).expect("valid admin key"),
        EmailClient::new(&config.email),
        migrations,
        DashboardConfig::new(config.dashboard.clone(), &address),
        media,
        Stripe::new(&config.stripe),
    )
    .expect("Failed to bind to address");
    let _ = tokio::spawn(server);

    TestApp { address, db_pool, admin_key, email_server, r2_server, stripe_server }
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

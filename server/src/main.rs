use std::net::TcpListener;

use server::config::get_config;
use server::email_client::EmailClient;
use server::migration_runner::{run_until_applied, MigrationStatus};
use server::routes::admin::AdminKey;
use server::dashboard::media::MediaStore;
use server::dashboard::stripe::Stripe;
use server::routes::dashboard::DashboardConfig;
use server::startup::run;
use server::telemetry::{get_subscriber, init_subscriber};
use sqlx::postgres::PgPoolOptions;

#[actix_web::main]
async fn main() -> Result<(), std::io::Error> {
    let subscriber = get_subscriber("server".into(), "info".into(), std::io::stdout);
    init_subscriber(subscriber);

    let config = get_config().expect("Failed to read configuration.");
    let connection_pool = PgPoolOptions::new()
        .connect_lazy_with(config.database.connect_options());

    // Migrate in the background, retrying until it works, so a database that isn't
    // ready (or doesn't have its permissions yet) can't stop the server from starting
    // and passing its health check. sqlx takes a Postgres advisory lock while
    // migrating, so concurrent instances can't race each other.
    let migrations = MigrationStatus::pending();
    actix_web::rt::spawn(run_until_applied(connection_pool.clone(), migrations.clone()));

    // Refuse to start without a strong admin key rather than run an unprotected admin API.
    let admin_key = AdminKey::new(&config.admin.api_key).expect("Invalid admin key configuration");

    let email_client = EmailClient::new(&config.email);
    if config.email.resend_api_key.is_none() {
        tracing::warn!("No email.resend_api_key configured: notification emails are disabled");
    }

    let addr = format!("{}:{}", config.application.host, config.application.port);
    let listener = TcpListener::bind(addr).expect("Failed to bind the address");

    let dashboard = DashboardConfig::new(config.dashboard.clone(), &config.application.base_url);

    // Fail at startup, not on the first upload, if R2 is half-configured.
    let media = MediaStore::from_settings(&config.media, &config.application.base_url)
        .expect("Invalid media (R2) configuration");
    tracing::info!(storage = media.describe(), "Uploaded images will be stored in {}", media.describe());

    let stripe = Stripe::new(&config.stripe);
    tracing::info!(sites = ?stripe.configured_sites(), "Stripe keys loaded");
    if config.stripe.offline {
        tracing::warn!("Stripe test mode is ON: sites without a key can add to the store, but nothing is sent to Stripe");
    }

    run(listener, connection_pool, admin_key, email_client, migrations, dashboard, media, stripe)?.await
}

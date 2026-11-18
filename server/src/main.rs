use std::net::TcpListener;

use server::config::get_config;
use server::email_client::EmailClient;
use server::routes::admin::AdminKey;
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

    // Bring the schema up to date before serving. sqlx takes a Postgres advisory
    // lock while migrating, so concurrent instances can't race each other.
    sqlx::migrate!("./migrations")
        .run(&connection_pool)
        .await
        .expect("Failed to run database migrations");

    // Refuse to start without a strong admin key rather than run an unprotected admin API.
    let admin_key = AdminKey::new(&config.admin.api_key).expect("Invalid admin key configuration");

    let email_client = EmailClient::new(&config.email);
    if config.email.resend_api_key.is_none() {
        tracing::warn!("No email.resend_api_key configured: notification emails are disabled");
    }

    let addr = format!("{}:{}", config.application.host, config.application.port);
    let listener = TcpListener::bind(addr).expect("Failed to bind the address");

    run(listener, connection_pool, admin_key, email_client)?.await
}

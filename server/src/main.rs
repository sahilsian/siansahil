use std::net::TcpListener;

use sqlx::postgres::PgPoolOptions;
use actix_web::HttpServer;
use server::config::get_config;


#[actix_web::main]
async fn main() -> Result<(), std::io::Error> {
    let subscriber = get_subscriber("zero2prod_email_newsletter".into(), "info".into(), std::io::stdout);
    init_subscriber(subscriber);
    
    let config = get_config().expect("Oh No! I Failed to the read config! Silly me");
    let connection_pool = PgPoolOptions::new()
        .connect_lazy_with(config.database.connect_options());

    let addr = format!("{}:{}", configuration.application.host, configuration.application.port);
    let listener = TcpListener::bind(addr)
        .expect("Failed to build the address");

    run(listener, connection_pool)?.await
}
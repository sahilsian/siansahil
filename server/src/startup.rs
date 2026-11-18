use std::net::TcpListener;

use actix_cors::Cors;
use actix_web::dev::Server;
use actix_web::middleware::from_fn;
use actix_web::{web, App, HttpServer};
use sqlx::PgPool;
use tracing_actix_web::TracingLogger;

use crate::email_client::EmailClient;
use crate::migration_runner::MigrationStatus;
use crate::routes::admin::{self, require_admin_key, AdminKey};
use crate::routes::content;
use crate::routes::diagnostics::{health_check, ready};
use crate::routes::error::{json_config, query_config};
use crate::routes::mailing_list;

pub fn run(
    listener: TcpListener,
    db_pool: PgPool,
    admin_key: AdminKey,
    email_client: EmailClient,
    migrations: MigrationStatus,
) -> Result<Server, std::io::Error> {
    let db_pool = web::Data::new(db_pool);
    let admin_key = web::Data::new(admin_key);
    let email_client = web::Data::new(email_client);
    let migrations = web::Data::new(migrations);

    let server = HttpServer::new(move || {
        App::new()
            .wrap(TracingLogger::default())
            .service(
                web::scope("/api").service(
                    // API VERSION 1
                    web::scope("/v1")
                        .service(web::scope("/diagnostics")
                                // Liveness: the process is up (deployment health check).
                                .route("/health_check", web::get().to(health_check))
                                // Readiness: the database schema is up to date.
                                .route("/ready", web::get().to(ready)))
                        .service(
                            // Public mailing-list signup, called from heads in the browser.
                            web::scope("/mailing-list")
                                .wrap(
                                    Cors::default()
                                        .allow_any_origin()
                                        .allowed_methods(["POST"])
                                        .allowed_header("content-type")
                                        .max_age(86_400),
                                )
                                .app_data(json_config(1024))
                                .route("/{tenant_id}/subscribers", web::post().to(mailing_list::subscribe)),
                        )
                        .service(
                            // Public, read-only website content. Any origin may read it
                            // (heads fetch from the browser during client navigation).
                            web::scope("/content")
                                .wrap(Cors::default().allow_any_origin().allowed_methods(["GET"]).max_age(86_400))
                                .app_data(query_config())
                                .configure(content::configure),
                        )
                        .service(
                            // Admin: tenant + document CRUD. Every route needs the admin key.
                            // No CORS: meant for tools/servers, not browsers.
                            web::scope("/admin").wrap(from_fn(require_admin_key)).configure(admin::configure),
                        ),
                ),
            )
            .app_data(db_pool.clone())
            .app_data(admin_key.clone())
            .app_data(email_client.clone())
            .app_data(migrations.clone())
    })
    .listen(listener)?
    .run();
    Ok(server)
}

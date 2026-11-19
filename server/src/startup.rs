use std::net::TcpListener;
use std::path::PathBuf;

use actix_cors::Cors;
use actix_files::{Files, NamedFile};
use actix_web::dev::{fn_service, Server, ServiceRequest, ServiceResponse};
use actix_web::http::header;
use actix_web::middleware::{from_fn, DefaultHeaders};
use actix_web::{web, App, HttpResponse, HttpServer};
use sqlx::PgPool;
use tracing_actix_web::TracingLogger;

use crate::dashboard::media::MediaStore;
use crate::dashboard::throttle::AuthThrottles;
use crate::email_client::EmailClient;
use crate::migration_runner::MigrationStatus;
use crate::routes::admin::{self, require_admin_key, AdminKey};
use crate::routes::content;
use crate::routes::dashboard::{self, require_same_origin, DashboardConfig};
use crate::routes::diagnostics::{health_check, ready};
use crate::routes::error::{json_config, query_config};
use crate::routes::{mailing_list, media};

/// Locks the dashboard page down: only its own scripts run, it can only talk to
/// this server, and no other site can frame it.
const DASHBOARD_CSP: &str = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; \
     img-src 'self' https: data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; \
     base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

pub fn run(
    listener: TcpListener,
    db_pool: PgPool,
    admin_key: AdminKey,
    email_client: EmailClient,
    migrations: MigrationStatus,
    dashboard_config: DashboardConfig,
    media_store: MediaStore,
) -> Result<Server, std::io::Error> {
    let db_pool = web::Data::new(db_pool);
    let admin_key = web::Data::new(admin_key);
    let email_client = web::Data::new(email_client);
    let migrations = web::Data::new(migrations);
    let throttles = web::Data::new(AuthThrottles::default());

    let static_dir = PathBuf::from(&dashboard_config.settings.static_dir);
    let serve_dashboard = static_dir.join("index.html").is_file();
    if !serve_dashboard {
        tracing::warn!(dir = %static_dir.display(), "No built dashboard found; /dashboard won't be served");
    }
    let secure = dashboard_config.settings.secure_cookies;
    let dashboard_config = web::Data::new(dashboard_config);
    let media_store = web::Data::new(media_store);

    let server = HttpServer::new(move || {
        let mut app = App::new()
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
                            // Public images uploaded from the dashboard.
                            web::scope("/media")
                                .wrap(Cors::default().allow_any_origin().allowed_methods(["GET"]).max_age(86_400))
                                .route("/{tenant_id}/{file}", web::get().to(media::get)),
                        )
                        .service(
                            // Dashboard API: session cookie auth, same-origin only (no CORS).
                            web::scope("/dashboard")
                                .wrap(from_fn(require_same_origin))
                                .wrap(
                                    DefaultHeaders::new()
                                        .add((header::CACHE_CONTROL, "no-store"))
                                        .add((header::X_CONTENT_TYPE_OPTIONS, "nosniff")),
                                )
                                .configure(dashboard::configure),
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
            .app_data(dashboard_config.clone())
            .app_data(throttles.clone())
            .app_data(media_store.clone());

        if serve_dashboard {
            app = app.service(dashboard_site(static_dir.clone(), secure));
        }
        app
    })
    .listen(listener)?
    .run();
    Ok(server)
}

/// The built dashboard app at `/dashboard`. Unknown paths fall back to
/// `index.html` so the app's own routes (e.g. /dashboard/gallery) load directly.
fn dashboard_site(static_dir: PathBuf, secure: bool) -> actix_web::Scope<
    impl actix_web::dev::ServiceFactory<
        ServiceRequest,
        Config = (),
        Response = ServiceResponse<impl actix_web::body::MessageBody>,
        Error = actix_web::Error,
        InitError = (),
    >,
> {
    let index = static_dir.join("index.html");
    let mut headers = DefaultHeaders::new()
        .add((header::CONTENT_SECURITY_POLICY, DASHBOARD_CSP))
        .add((header::X_FRAME_OPTIONS, "DENY"))
        .add((header::X_CONTENT_TYPE_OPTIONS, "nosniff"))
        .add((header::REFERRER_POLICY, "no-referrer"))
        .add(("Permissions-Policy", "camera=(), microphone=(), geolocation=()"))
        .add((header::CACHE_CONTROL, "no-cache"));
    if secure {
        headers = headers.add((header::STRICT_TRANSPORT_SECURITY, "max-age=31536000"));
    }

    web::scope("/dashboard")
        .wrap(headers)
        // "/dashboard" → "/dashboard/" so relative asset paths resolve.
        .route(
            "",
            web::get().to(|| async {
                HttpResponse::PermanentRedirect().insert_header((header::LOCATION, "/dashboard/")).finish()
            }),
        )
        .service(
            Files::new("/", &static_dir)
                .index_file("index.html")
                .default_handler(fn_service(move |req: ServiceRequest| {
                    let index = index.clone();
                    async move {
                        let (req, _) = req.into_parts();
                        let file = NamedFile::open_async(index).await?;
                        let res = file.into_response(&req);
                        Ok(ServiceResponse::new(req, res))
                    }
                })),
        )
}

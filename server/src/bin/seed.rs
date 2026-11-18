//! Load tenant content folders into the database.
//!
//!   cargo run --bin seed                         # every tenant in ./content/tenants
//!   cargo run --bin seed -- content/tenants/foo  # one tenant folder
//!
//! Upserts: creates missing tenants/documents, updates changed ones (bumping
//! `version`), leaves unchanged ones alone. It never deletes documents.

use std::path::PathBuf;

use server::config::get_config;
use server::content::{import_tenant_dir, tenant_dirs};
use sqlx::PgPool;

#[actix_web::main]
async fn main() {
    let arg = std::env::args().nth(1).unwrap_or_else(|| "content/tenants".into());
    let root = PathBuf::from(arg);

    let dirs = tenant_dirs(&root);
    if dirs.is_empty() {
        eprintln!("No tenant folders (with tenant.json) found in {}", root.display());
        std::process::exit(1);
    }

    let config = get_config().expect("Failed to read configuration.");
    let pool = PgPool::connect_with(config.database.connect_options())
        .await
        .expect("Failed to connect to Postgres");
    sqlx::migrate!("./migrations").run(&pool).await.expect("Failed to run migrations");

    let mut failed = false;
    for dir in dirs {
        match import_tenant_dir(&pool, &dir).await {
            Ok(s) => println!("✓ {} — {} documents ({})", s.tenant_id, s.documents, dir.display()),
            Err(e) => {
                eprintln!("✗ {}: {e}", dir.display());
                failed = true;
            }
        }
    }
    if failed {
        std::process::exit(1);
    }
}


//! Upload tenant content folders to a running server through the admin API
//! (for production, where the database isn't reachable from your machine).
//!
//!   ADMIN_API_KEY=... cargo run --bin push_content -- https://your-app.ondigitalocean.app
//!   ADMIN_API_KEY=... cargo run --bin push_content -- https://your-app.ondigitalocean.app content/tenants/siansahil
//!
//! For each tenant folder: creates the tenant (or updates its domains), then
//! PUTs every document. Unchanged documents keep their version. It never
//! deletes anything on the server. Folders are validated exactly like `seed`.

use std::path::PathBuf;

use reqwest::{Client, StatusCode};
use serde_json::{json, Value};
use server::content::{read_tenant_dir, tenant_dirs, TenantContent};

#[actix_web::main]
async fn main() {
    let mut args = std::env::args().skip(1);
    let Some(server_url) = args.next() else {
        eprintln!("usage: push_content <server-url> [tenant-folder-or-root]   (admin key in ADMIN_API_KEY)");
        std::process::exit(2);
    };
    let server_url = server_url.trim_end_matches('/').to_string();
    let root = PathBuf::from(args.next().unwrap_or_else(|| "content/tenants".into()));
    let Ok(admin_key) = std::env::var("ADMIN_API_KEY") else {
        eprintln!("Set ADMIN_API_KEY to the server's admin key (APP_ADMIN__API_KEY).");
        std::process::exit(2);
    };

    let dirs = tenant_dirs(&root);
    if dirs.is_empty() {
        eprintln!("No tenant folders (with tenant.json) found in {}", root.display());
        std::process::exit(1);
    }

    // Validate every folder before uploading anything.
    let mut tenants = Vec::new();
    for dir in &dirs {
        match read_tenant_dir(dir) {
            Ok(content) => tenants.push(content),
            Err(e) => {
                eprintln!("✗ {e}");
                std::process::exit(1);
            }
        }
    }

    let api = Api { http: Client::new(), base: format!("{server_url}/api/v1/admin"), key: admin_key };
    let mut failed = false;
    for tenant in &tenants {
        match push_tenant(&api, tenant).await {
            Ok(counts) => println!(
                "✓ {} — {} created, {} updated, {} unchanged",
                tenant.id.as_ref(),
                counts.created,
                counts.updated,
                counts.unchanged
            ),
            Err(e) => {
                eprintln!("✗ {}: {e}", tenant.id.as_ref());
                failed = true;
            }
        }
    }
    if failed {
        std::process::exit(1);
    }
}

struct Api {
    http: Client,
    base: String,
    key: String,
}

#[derive(Default)]
struct Counts {
    created: usize,
    updated: usize,
    unchanged: usize,
}

async fn push_tenant(api: &Api, tenant: &TenantContent) -> Result<Counts, String> {
    let id = tenant.id.as_ref();

    // Create the tenant, or bring its domains up to date.
    let existing = api.http.get(format!("{}/tenants/{id}", api.base)).bearer_auth(&api.key).send().await;
    let existing = existing.map_err(|e| format!("couldn't reach the server: {e}"))?;
    let response = match existing.status() {
        StatusCode::OK => api
            .http
            .put(format!("{}/tenants/{id}", api.base))
            .bearer_auth(&api.key)
            .json(&json!({ "domains": tenant.domains }))
            .send()
            .await,
        StatusCode::NOT_FOUND => api
            .http
            .post(format!("{}/tenants", api.base))
            .bearer_auth(&api.key)
            .json(&json!({ "id": id, "domains": tenant.domains }))
            .send()
            .await,
        status => return Err(describe(status, existing).await),
    }
    .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(describe(response.status(), response).await);
    }

    let mut counts = Counts::default();
    for (doc_type, key, data) in &tenant.documents {
        let response = api
            .http
            .put(format!("{}/tenants/{id}/documents/{}/{key}", api.base, doc_type.as_str()))
            .bearer_auth(&api.key)
            .json(data)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            let status = response.status();
            return Err(format!("{}/{key}: {}", doc_type.as_str(), describe(status, response).await));
        }
        let body: Value = response.json().await.unwrap_or(Value::Null);
        match body["status"].as_str() {
            Some("created") => counts.created += 1,
            Some("updated") => counts.updated += 1,
            _ => counts.unchanged += 1,
        }
    }
    Ok(counts)
}

async fn describe(status: StatusCode, response: reqwest::Response) -> String {
    let body: Value = response.json().await.unwrap_or(Value::Null);
    match body["message"].as_str() {
        Some(message) => format!("{status}: {message}"),
        None => status.to_string(),
    }
}

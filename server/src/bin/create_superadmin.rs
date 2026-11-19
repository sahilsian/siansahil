//! Create a superadmin dashboard account, using the admin API key. This is how the
//! first account is made; after that, create accounts from the dashboard's
//! Superadmin screen.
//!
//!   ADMIN_API_KEY=... cargo run --bin create_superadmin -- https://your-app.ondigitalocean.app yourname
//!
//! A strong password is generated and printed once. Sign in with it, then change it
//! under "Account" in the dashboard.

use serde_json::{json, Value};

#[actix_web::main]
async fn main() {
    let mut args = std::env::args().skip(1);
    let (Some(server_url), Some(username)) = (args.next(), args.next()) else {
        eprintln!("usage: create_superadmin <server-url> <username>   (admin key in ADMIN_API_KEY)");
        std::process::exit(2);
    };
    let server_url = server_url.trim_end_matches('/');
    let Ok(admin_key) = std::env::var("ADMIN_API_KEY") else {
        eprintln!("Set ADMIN_API_KEY to the server's admin key (APP_ADMIN__API_KEY).");
        std::process::exit(2);
    };

    let response = reqwest::Client::new()
        .post(format!("{server_url}/api/v1/admin/dashboard-users"))
        .bearer_auth(admin_key.trim())
        .json(&json!({ "username": username, "role": "superadmin" }))
        .send()
        .await;
    let response = match response {
        Ok(r) => r,
        Err(e) => {
            eprintln!("✗ Couldn't reach {server_url}: {e}");
            std::process::exit(1);
        }
    };
    let status = response.status();
    let body: Value = response.json().await.unwrap_or(Value::Null);
    if !status.is_success() {
        eprintln!("✗ {status}: {}", body["message"].as_str().unwrap_or("request failed"));
        std::process::exit(1);
    }

    println!("✓ Superadmin account created");
    println!("  Sign in at: {server_url}/dashboard/");
    println!("  Username:   {}", body["user"]["username"].as_str().unwrap_or(&username));
    println!("  Password:   {}", body["password"].as_str().unwrap_or("(missing)"));
    println!("  This password isn't stored anywhere you can see again. Change it after signing in (Account).");
}

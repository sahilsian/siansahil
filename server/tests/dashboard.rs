mod common;

use common::{spawn_app, spawn_app_with_r2, TestApp};
use wiremock::matchers::{header, header_exists, method, path_regex};
use wiremock::{Mock, ResponseTemplate};
use reqwest::{Method, StatusCode};
use serde_json::{json, Value};

const PASSWORD: &str = "a long and memorable passphrase";

// Smallest valid 1x1 PNG.
const PNG_1X1: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
];

/// A browser-like client: keeps cookies, marks requests as coming from the dashboard.
struct Browser<'a> {
    app: &'a TestApp,
    http: reqwest::Client,
}

impl<'a> Browser<'a> {
    fn new(app: &'a TestApp) -> Self {
        Self { app, http: reqwest::Client::builder().cookie_store(true).build().unwrap() }
    }

    async fn send(&self, method: Method, path: &str, body: Option<Value>) -> (StatusCode, Value) {
        let mut request = self
            .http
            .request(method, format!("{}/api/v1/dashboard{path}", self.app.address))
            .header("X-Dashboard-Request", "1");
        if let Some(body) = body {
            request = request.json(&body);
        }
        let response = request.send().await.unwrap();
        let status = response.status();
        (status, response.json::<Value>().await.unwrap_or(Value::Null))
    }

    async fn get(&self, path: &str) -> (StatusCode, Value) {
        self.send(Method::GET, path, None).await
    }

    async fn post(&self, path: &str, body: Value) -> (StatusCode, Value) {
        self.send(Method::POST, path, Some(body)).await
    }

    async fn put(&self, path: &str, body: Value) -> (StatusCode, Value) {
        self.send(Method::PUT, path, Some(body)).await
    }

    async fn delete(&self, path: &str) -> (StatusCode, Value) {
        self.send(Method::DELETE, path, None).await
    }

    async fn upload(&self, site: &str, bytes: &'static [u8]) -> (StatusCode, Value) {
        let response = self
            .http
            .post(format!("{}/api/v1/dashboard/sites/{site}/media?name=photo.png", self.app.address))
            .header("X-Dashboard-Request", "1")
            .header("Content-Type", "application/octet-stream")
            .body(bytes)
            .send()
            .await
            .unwrap();
        let status = response.status();
        (status, response.json::<Value>().await.unwrap_or(Value::Null))
    }
}

async fn admin_put(app: &TestApp, path: &str, body: Value) -> (StatusCode, Value) {
    let response = reqwest::Client::new()
        .request(Method::PUT, format!("{}/api/v1/admin{path}", app.address))
        .bearer_auth(&app.admin_key)
        .json(&body)
        .send()
        .await
        .unwrap();
    let status = response.status();
    (status, response.json::<Value>().await.unwrap_or(Value::Null))
}

async fn admin_post(app: &TestApp, path: &str, body: Value) -> (StatusCode, Value) {
    let response = reqwest::Client::new()
        .post(format!("{}/api/v1/admin{path}", app.address))
        .bearer_auth(&app.admin_key)
        .json(&body)
        .send()
        .await
        .unwrap();
    let status = response.status();
    (status, response.json::<Value>().await.unwrap_or(Value::Null))
}

/// Two sites with a site document, a home page, a curated gallery and one artwork each.
async fn seed_sites(app: &TestApp) {
    for site in ["acme", "other"] {
        admin_post(app, "/tenants", json!({ "id": site })).await;
        admin_put(app, &format!("/tenants/{site}/documents/site/main"), json!({ "$type": "site", "name": format!("{site} art") })).await;
        admin_put(
            app,
            &format!("/tenants/{site}/documents/page/home"),
            json!({
                "$type": "page", "slug": "home",
                "blocks": [{ "type": "hero", "title": "Hello", "primary": { "label": "Gallery", "to": "/products" } }]
            }),
        )
        .await;
        admin_put(
            app,
            &format!("/tenants/{site}/documents/collection/gallery"),
            json!({ "$type": "collection", "id": "gallery", "title": "Gallery", "filter": { "type": "curated", "productSlugs": ["old"] } }),
        )
        .await;
        admin_put(
            app,
            &format!("/tenants/{site}/documents/product/old"),
            json!({ "$type": "product", "slug": "old", "title": "Old", "category": "paint", "images": [], "tabs": [] }),
        )
        .await;
    }
}

async fn sign_in<'a>(app: &'a TestApp, username: &str, password: &str) -> Browser<'a> {
    let browser = Browser::new(app);
    let (status, body) = browser.post("/auth/login", json!({ "username": username, "password": password })).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    browser
}

/// Superadmin account (created with the admin API key), signed in.
async fn superadmin(app: &TestApp) -> Browser<'_> {
    let (status, body) =
        admin_post(app, "/dashboard-users", json!({ "username": "boss", "role": "superadmin", "password": PASSWORD })).await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    assert!(body["password"].is_null(), "a chosen password is never echoed back");
    sign_in(app, "boss", PASSWORD).await
}

/// Editor for `acme`, created by the superadmin, signed in.
async fn editor<'a>(app: &'a TestApp, boss: &Browser<'a>) -> Browser<'a> {
    let (status, body) = boss
        .post("/admin/users", json!({ "username": "Artist", "password": PASSWORD, "siteId": "acme", "email": " Artist@Example.com" }))
        .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    assert_eq!(body["user"]["username"], "artist");
    assert_eq!(body["user"]["email"], "artist@example.com");
    sign_in(app, "artist", PASSWORD).await
}

// ---------------------------------------------------------------- accounts

#[actix_web::test]
async fn superadmins_create_accounts_that_can_sign_in_and_out() {
    let app = spawn_app().await;
    seed_sites(&app).await;
    let boss = superadmin(&app).await;
    let (status, me) = boss.get("/me").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(me["user"]["role"], "superadmin");
    assert_eq!(me["sites"].as_array().unwrap().len(), 2);

    let artist = editor(&app, &boss).await;
    let (_, me) = artist.get("/me").await;
    assert_eq!(me["user"]["role"], "editor");
    assert_eq!(me["sites"], json!([{ "id": "acme", "name": "acme art", "url": null }]));

    // Sign out, then back in with the username (case-insensitive).
    let (status, _) = artist.post("/auth/logout", json!({})).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(artist.get("/me").await.0, StatusCode::UNAUTHORIZED);
    let (status, _) = artist.post("/auth/login", json!({ "username": "ARTIST", "password": PASSWORD })).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(artist.get("/me").await.0, StatusCode::OK);
}

#[actix_web::test]
async fn the_admin_api_can_generate_a_strong_password() {
    let app = spawn_app().await;
    let (status, body) = admin_post(&app, "/dashboard-users", json!({ "username": "boss", "role": "superadmin" })).await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let password = body["password"].as_str().unwrap();
    assert_eq!(password.len(), 24);
    sign_in(&app, "boss", password).await;
}

#[actix_web::test]
async fn passwords_and_session_tokens_are_never_stored_in_plain_text() {
    let app = spawn_app().await;
    let _boss = superadmin(&app).await;
    let (hash,): (String,) = sqlx::query_as("SELECT password_hash FROM dashboard_users").fetch_one(&app.db_pool).await.unwrap();
    assert!(hash.starts_with("$argon2id$"));
    assert!(!hash.contains(PASSWORD));
    let (len,): (i32,) =
        sqlx::query_as("SELECT length(token_hash) FROM dashboard_sessions").fetch_one(&app.db_pool).await.unwrap();
    assert_eq!(len, 32, "only a SHA-256 of the session token is stored");
}

#[actix_web::test]
async fn weak_passwords_bad_usernames_and_duplicates_are_refused() {
    let app = spawn_app().await;
    seed_sites(&app).await;
    let boss = superadmin(&app).await;
    for (username, password) in [("artist", "too short"), ("artist", "artist-artist-artist"), ("a", PASSWORD), ("bad name", PASSWORD)] {
        let (status, _) = boss.post("/admin/users", json!({ "username": username, "password": password, "siteId": "acme" })).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{username} / {password}");
    }
    let (status, _) = boss.post("/admin/users", json!({ "username": "BOSS", "password": PASSWORD, "siteId": "acme" })).await;
    assert_eq!(status, StatusCode::CONFLICT);
    let (status, _) = boss.post("/admin/users", json!({ "username": "artist", "password": PASSWORD, "siteId": "nope" })).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[actix_web::test]
async fn changing_your_password_signs_out_your_other_devices() {
    let app = spawn_app().await;
    seed_sites(&app).await;
    let boss = superadmin(&app).await;
    let laptop = editor(&app, &boss).await;
    let phone = sign_in(&app, "artist", PASSWORD).await;
    const NEW: &str = "an even longer and newer passphrase";

    let (status, _) = laptop.post("/auth/password", json!({ "currentPassword": "wrong wrong wrong!", "newPassword": NEW })).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let (status, _) = laptop.post("/auth/password", json!({ "currentPassword": PASSWORD, "newPassword": "short" })).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let (status, body) = laptop.post("/auth/password", json!({ "currentPassword": PASSWORD, "newPassword": NEW })).await;
    assert_eq!(status, StatusCode::OK, "{body}");

    assert_eq!(laptop.get("/me").await.0, StatusCode::OK, "the device that changed it stays signed in");
    assert_eq!(phone.get("/me").await.0, StatusCode::UNAUTHORIZED, "other devices are signed out");
    let (status, _) = Browser::new(&app).post("/auth/login", json!({ "username": "artist", "password": PASSWORD })).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    sign_in(&app, "artist", NEW).await;
}

#[actix_web::test]
async fn a_superadmin_reset_signs_the_user_out_everywhere() {
    let app = spawn_app().await;
    seed_sites(&app).await;
    let boss = superadmin(&app).await;
    let artist = editor(&app, &boss).await;
    let (_, accounts) = boss.get("/admin/accounts").await;
    let id = accounts["users"].as_array().unwrap().iter().find(|u| u["username"] == "artist").unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();

    let (status, _) = boss.put(&format!("/admin/users/{id}/password"), json!({ "password": "x" })).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let (status, _) = boss.put(&format!("/admin/users/{id}/password"), json!({ "password": "a brand new reset passphrase" })).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(artist.get("/me").await.0, StatusCode::UNAUTHORIZED);

    // Editors can't reset anyone's password.
    let artist = sign_in(&app, "artist", "a brand new reset passphrase").await;
    let (status, _) = artist.put(&format!("/admin/users/{id}/password"), json!({ "password": "another long passphrase" })).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[actix_web::test]
async fn repeated_wrong_passwords_lock_the_username() {
    let app = spawn_app().await;
    let _boss = superadmin(&app).await;
    let guesser = Browser::new(&app);
    for _ in 0..5 {
        let (status, body) = guesser.post("/auth/login", json!({ "username": "boss", "password": "not the password at all" })).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(body["error"], "invalid_credentials");
    }
    // Even the right password is refused while locked.
    let (status, _) = guesser.post("/auth/login", json!({ "username": "boss", "password": PASSWORD })).await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
}

#[actix_web::test]
async fn unknown_users_get_the_same_answer_as_wrong_passwords() {
    let app = spawn_app().await;
    let browser = Browser::new(&app);
    let (status, body) = browser.post("/auth/login", json!({ "username": "nobody", "password": PASSWORD })).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["error"], "invalid_credentials");
}

// ---------------------------------------------------------------- access control

#[actix_web::test]
async fn signed_out_requests_are_refused() {
    let app = spawn_app().await;
    seed_sites(&app).await;
    let browser = Browser::new(&app);
    for path in ["/me", "/sites/acme/documents", "/sites/acme/artworks", "/admin/accounts"] {
        assert_eq!(browser.get(path).await.0, StatusCode::UNAUTHORIZED, "{path}");
    }
}

#[actix_web::test]
async fn requests_without_the_dashboard_header_are_refused() {
    let app = spawn_app().await;
    let boss = superadmin(&app).await;
    // Same cookies, but no X-Dashboard-Request header: what a cross-site form post looks like.
    let response = boss
        .http
        .post(format!("{}/api/v1/dashboard/admin/users", app.address))
        .json(&json!({ "username": "sneaky", "password": "a long and memorable passphrase", "siteId": "acme" }))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    let cross_site = boss
        .http
        .post(format!("{}/api/v1/dashboard/auth/logout", app.address))
        .header("X-Dashboard-Request", "1")
        .header("Sec-Fetch-Site", "cross-site")
        .send()
        .await
        .unwrap();
    assert_eq!(cross_site.status(), StatusCode::FORBIDDEN);
}

#[actix_web::test]
async fn editors_only_reach_their_own_site_and_not_superadmin_tools() {
    let app = spawn_app().await;
    seed_sites(&app).await;
    let boss = superadmin(&app).await;
    let artist = editor(&app, &boss).await;

    assert_eq!(artist.get("/sites/acme/documents/page/home").await.0, StatusCode::OK);
    for path in ["/sites/other/documents", "/sites/other/documents/page/home", "/sites/other/artworks", "/admin/accounts"] {
        assert_eq!(artist.get(path).await.0, StatusCode::FORBIDDEN, "{path}");
    }
    let (status, _) = artist.post("/admin/users", json!({ "username": "friend", "password": PASSWORD, "siteId": "acme" })).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) = artist.delete("/sites/other/artworks/old").await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    // The superadmin can reach both.
    assert_eq!(boss.get("/sites/other/documents/page/home").await.0, StatusCode::OK);
}

#[actix_web::test]
async fn removing_a_user_signs_them_out() {
    let app = spawn_app().await;
    seed_sites(&app).await;
    let boss = superadmin(&app).await;
    let artist = editor(&app, &boss).await;
    let (_, accounts) = boss.get("/admin/accounts").await;
    let artist_id = accounts["users"].as_array().unwrap().iter().find(|u| u["username"] == "artist").unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    assert_eq!(boss.delete(&format!("/admin/users/{artist_id}")).await.0, StatusCode::NO_CONTENT);
    assert_eq!(artist.get("/me").await.0, StatusCode::UNAUTHORIZED);
}

// ---------------------------------------------------------------- text editing

#[actix_web::test]
async fn text_can_change_but_structure_and_links_cannot() {
    let app = spawn_app().await;
    seed_sites(&app).await;
    let boss = superadmin(&app).await;
    let artist = editor(&app, &boss).await;

    let (_, doc) = artist.get("/sites/acme/documents/page/home").await;
    let version = doc["version"].as_i64().unwrap();
    let mut data = doc["data"].clone();
    data["blocks"][0]["title"] = json!("Welcome!");
    data["blocks"][0]["primary"]["label"] = json!("See the work");
    let (status, saved) = artist.put("/sites/acme/documents/page/home", json!({ "data": data, "baseVersion": version })).await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    let public = reqwest::get(format!("{}/api/v1/content/acme/pages/home", app.address)).await.unwrap().json::<Value>().await.unwrap();
    assert_eq!(public["blocks"][0]["title"], "Welcome!");

    let new_version = saved["version"].as_i64().unwrap();
    let mut link = saved["data"].clone();
    link["blocks"][0]["primary"]["to"] = json!("https://evil.example");
    let mut extra_block = saved["data"].clone();
    extra_block["blocks"].as_array_mut().unwrap().push(json!({ "type": "richText", "body": "x" }));
    for bad in [link, extra_block] {
        let (status, _) = artist.put("/sites/acme/documents/page/home", json!({ "data": bad, "baseVersion": new_version })).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }

    // Saving on top of an old version is refused rather than overwriting.
    let (status, _) = artist.put("/sites/acme/documents/page/home", json!({ "data": data, "baseVersion": version })).await;
    assert_eq!(status, StatusCode::CONFLICT);
}

// ---------------------------------------------------------------- artworks & images

#[actix_web::test]
async fn artworks_can_be_created_updated_and_deleted() {
    let app = spawn_app().await;
    seed_sites(&app).await;
    let boss = superadmin(&app).await;
    let artist = editor(&app, &boss).await;

    let (status, image) = artist.upload("acme", PNG_1X1).await;
    assert_eq!(status, StatusCode::CREATED, "{image}");
    let served = reqwest::get(image["url"].as_str().unwrap()).await.unwrap();
    assert_eq!(served.status(), StatusCode::OK);
    assert_eq!(served.headers()["content-type"], "image/png");
    assert_eq!(served.bytes().await.unwrap().as_ref(), PNG_1X1);

    let artwork = json!({
        "title": "Sunflowers",
        "description": "Oil on canvas",
        "category": "paint",
        "images": [image],
        "tabs": [{ "title": "Details", "body": "**Oil** on canvas" }],
        "availability": { "status": "available", "price": "$500" }
    });
    let (status, created) =
        artist.post("/sites/acme/artworks", json!({ "slug": "sunflowers", "artwork": artwork, "collections": ["gallery"] })).await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    let (status, _) =
        artist.post("/sites/acme/artworks", json!({ "slug": "sunflowers", "artwork": artwork, "collections": [] })).await;
    assert_eq!(status, StatusCode::CONFLICT);

    let gallery = |v: Value| v["products"].as_array().unwrap().iter().map(|p| p["slug"].as_str().unwrap().to_string()).collect::<Vec<_>>();
    let public = reqwest::get(format!("{}/api/v1/content/acme/collections/gallery", app.address)).await.unwrap().json::<Value>().await.unwrap();
    assert_eq!(gallery(public), ["sunflowers", "old"], "new artworks go to the top of the gallery");

    let mut changed = artwork.clone();
    changed["title"] = json!("Sunflowers II");
    let (status, updated) =
        artist.put("/sites/acme/artworks/sunflowers", json!({ "artwork": changed, "collections": [] })).await;
    assert_eq!(status, StatusCode::OK, "{updated}");
    assert_eq!(updated["artwork"]["title"], "Sunflowers II");
    let public = reqwest::get(format!("{}/api/v1/content/acme/collections/gallery", app.address)).await.unwrap().json::<Value>().await.unwrap();
    assert_eq!(gallery(public), ["old"]);

    assert_eq!(artist.delete("/sites/acme/artworks/sunflowers").await.0, StatusCode::NO_CONTENT);
    let gone = reqwest::get(format!("{}/api/v1/content/acme/products/sunflowers", app.address)).await.unwrap();
    assert_eq!(gone.status(), StatusCode::NOT_FOUND);
}

#[actix_web::test]
async fn only_real_images_can_be_uploaded() {
    let app = spawn_app().await;
    seed_sites(&app).await;
    let boss = superadmin(&app).await;
    for bad in [&b"<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>"[..], b"<html></html>"] {
        let (status, _) = boss.upload("acme", bad).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }
}

#[actix_web::test]
async fn uploads_go_to_r2_when_it_is_configured() {
    let app = spawn_app_with_r2().await;
    seed_sites(&app).await;
    let boss = superadmin(&app).await;

    Mock::given(method("PUT"))
        .and(path_regex(r"^/test-bucket/acme/[0-9a-f]{64}\.png$"))
        .and(header("content-type", "image/png"))
        .and(header_exists("cache-control"))
        .and(header_exists("x-amz-date"))
        .and(header_exists("x-amz-content-sha256"))
        .and(header_exists("authorization"))
        .respond_with(ResponseTemplate::new(200))
        .expect(1)
        .mount(&app.r2_server)
        .await;

    let (status, image) = boss.upload("acme", PNG_1X1).await;
    assert_eq!(status, StatusCode::CREATED, "{image}");
    let url = image["url"].as_str().unwrap();
    assert!(url.starts_with("https://images.test/acme/") && url.ends_with(".png"), "{url}");

    // Only a record is kept in the database, not the bytes.
    let (storage, has_bytes, size): (String, bool, i32) =
        sqlx::query_as("SELECT storage, bytes IS NOT NULL, size_bytes FROM media").fetch_one(&app.db_pool).await.unwrap();
    assert_eq!((storage.as_str(), has_bytes, size), ("r2", false, PNG_1X1.len() as i32));

    // The upload is signed for this bucket and access key.
    let requests = app.r2_server.received_requests().await.unwrap();
    let cache = requests[0].headers.get("cache-control").unwrap().to_str().unwrap();
    assert_eq!(cache, "public, max-age=31536000, immutable", "Cloudflare and browsers may cache it forever");
    let auth = requests[0].headers.get("authorization").unwrap().to_str().unwrap();
    assert!(auth.starts_with("AWS4-HMAC-SHA256 Credential=test-access-key/"), "{auth}");
    assert!(auth.contains("/auto/s3/aws4_request"), "{auth}");

    // R2 images can be used in artworks.
    let artwork = json!({ "title": "Sunflowers", "category": "paint", "images": [image], "tabs": [] });
    let (status, body) = boss.post("/sites/acme/artworks", json!({ "slug": "sunflowers", "artwork": artwork })).await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
}

#[actix_web::test]
async fn a_failed_r2_upload_is_reported_and_not_recorded() {
    let app = spawn_app_with_r2().await;
    seed_sites(&app).await;
    let boss = superadmin(&app).await;
    Mock::given(method("PUT")).respond_with(ResponseTemplate::new(403)).mount(&app.r2_server).await;

    let (status, body) = boss.upload("acme", PNG_1X1).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(body["error"], "internal_error");
    let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM media").fetch_one(&app.db_pool).await.unwrap();
    assert_eq!(count, 0);
}

#[actix_web::test]
async fn admin_api_bootstrap_requires_the_admin_key() {
    let app = spawn_app().await;
    let response = reqwest::Client::new()
        .post(format!("{}/api/v1/admin/dashboard-users", app.address))
        .json(&json!({ "username": "boss", "role": "superadmin" }))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

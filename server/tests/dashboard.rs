mod common;

use common::{spawn_app, spawn_app_with_r2, TestApp};
use wiremock::matchers::{header, header_exists, method, path, path_regex};
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
async fn uploaded_and_used_images_can_be_picked_again() {
    let app = spawn_app().await;
    seed_sites(&app).await;
    let boss = superadmin(&app).await;
    let artist = editor(&app, &boss).await;

    // An upload used on an artwork, and a static image another artwork already had.
    let (_, uploaded) = artist.upload("acme", PNG_1X1).await;
    let artwork = json!({
        "title": "Old", "category": "paint", "tabs": [],
        "images": [uploaded.clone(), { "url": "/static/old.jpg", "width": 4, "height": 3, "name": "old.jpg" }]
    });
    let (status, _) = artist.put("/sites/acme/artworks/old", json!({ "artwork": artwork, "collections": [] })).await;
    assert_eq!(status, StatusCode::OK);

    let (status, list) = artist.get("/sites/acme/media").await;
    assert_eq!(status, StatusCode::OK, "{list}");
    let images = list["images"].as_array().unwrap();
    assert_eq!(images.len(), 2, "the upload is listed once, not again as an unused upload: {list}");
    assert_eq!(images[0]["url"], uploaded["url"]);
    assert_eq!(images[0]["usedIn"], json!(["Old"]));
    assert_eq!(images[1]["name"], "old.jpg");

    // Another site's uploads stay private.
    assert_eq!(artist.get("/sites/other/media").await.0, StatusCode::FORBIDDEN);
    let (_, other) = boss.get("/sites/other/media").await;
    assert_eq!(other["images"], json!([]));
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

// ---------------------------------------------------------------- store (Stripe)

/// A fake Stripe that hands out fresh ids and records every call.
async fn mount_fake_stripe(app: &TestApp) {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let counter = std::sync::Arc::new(AtomicUsize::new(0));
    let products = counter.clone();
    Mock::given(method("POST"))
        .and(path_regex(r"^/v1/products$"))
        .respond_with(move |_: &wiremock::Request| {
            let n = products.fetch_add(1, Ordering::SeqCst);
            ResponseTemplate::new(200).set_body_json(json!({ "id": format!("prod_{n}"), "default_price": format!("price_{n}") }))
        })
        .mount(&app.stripe_server)
        .await;
    let prices = counter.clone();
    Mock::given(method("POST"))
        .and(path_regex(r"^/v1/prices$"))
        .respond_with(move |_: &wiremock::Request| {
            let n = prices.fetch_add(1, Ordering::SeqCst);
            ResponseTemplate::new(200).set_body_json(json!({ "id": format!("price_new_{n}") }))
        })
        .mount(&app.stripe_server)
        .await;
    let links = counter.clone();
    Mock::given(method("POST"))
        .and(path_regex(r"^/v1/payment_links$"))
        .respond_with(move |_: &wiremock::Request| {
            let n = links.fetch_add(1, Ordering::SeqCst);
            ResponseTemplate::new(200)
                .set_body_json(json!({ "id": format!("plink_{n}"), "url": format!("https://buy.stripe.com/test_{n}") }))
        })
        .mount(&app.stripe_server)
        .await;
    let rates = counter.clone();
    Mock::given(method("POST"))
        .and(path_regex(r"^/v1/shipping_rates$"))
        .respond_with(move |_: &wiremock::Request| {
            let n = rates.fetch_add(1, Ordering::SeqCst);
            ResponseTemplate::new(200).set_body_json(json!({ "id": format!("shr_{n}") }))
        })
        .mount(&app.stripe_server)
        .await;
    Mock::given(method("POST"))
        .and(path_regex(r"^/v1/(products|prices|payment_links|shipping_rates)/[a-z_0-9]+$"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "id": "ok" })))
        .mount(&app.stripe_server)
        .await;
}

async fn stripe_calls(app: &TestApp) -> Vec<(String, String)> {
    app.stripe_server
        .received_requests()
        .await
        .unwrap()
        .iter()
        .map(|r| (r.url.path().to_string(), String::from_utf8_lossy(&r.body).to_string()))
        .collect()
}

#[actix_web::test]
async fn artworks_can_be_added_to_updated_in_and_removed_from_the_store() {
    let app = spawn_app().await;
    seed_sites(&app).await;
    mount_fake_stripe(&app).await;
    let boss = superadmin(&app).await;
    let artist = editor(&app, &boss).await;

    let (status, settings) = artist
        .put(
            "/sites/acme/store",
            json!({ "printSizes": [{ "label": "8 x 10", "priceCents": 4000 }, { "label": "12 x 16", "priceCents": 8000 }] }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{settings}");
    assert_eq!(settings["stripeConfigured"], true);
    assert_eq!(settings["printSizes"][0]["id"], "8-x-10");

    // Add to store: both print sizes become Stripe products; the original is
    // inquiry-only (available, no price, nothing in Stripe).
    let (status, listed) = artist
        .put("/sites/acme/artworks/old/store", json!({ "originalAvailable": true, "printSizeIds": ["8-x-10", "12-x-16"] }))
        .await;
    assert_eq!(status, StatusCode::OK, "{listed}");
    assert_eq!(listed["store"]["originalAvailable"], true);
    assert!(listed["store"]["original"].is_null(), "the original has no Stripe product");
    assert_eq!(listed["store"]["prints"].as_array().unwrap().len(), 2);
    let calls = stripe_calls(&app).await;
    assert_eq!(calls.iter().filter(|(p, _)| p == "/v1/products").count(), 2);
    assert!(calls[0].1.contains("default_price_data%5Bunit_amount%5D=4000"), "{}", calls[0].1);
    assert!(calls[0].1.contains("default_price_data%5Bcurrency%5D=cad"));
    let requests = app.stripe_server.received_requests().await.unwrap();
    let auth = requests[0].headers.get("authorization").unwrap().to_str().unwrap();
    assert_eq!(auth, "Bearer sk_test_acme", "each site uses its own Stripe key");

    // The website sees what's for sale (on the artwork and on gallery cards).
    let public = reqwest::get(format!("{}/api/v1/content/acme/products/old", app.address))
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    assert_eq!(public["store"]["originalAvailable"], true);
    let gallery = reqwest::get(format!("{}/api/v1/content/acme/collections/gallery", app.address))
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    assert_eq!(gallery["products"][0]["store"]["prints"][0]["priceCents"], 4000);

    // A new site price + drop a size + original sold: new price, the size archived.
    artist
        .put("/sites/acme/store", json!({ "printSizes": [{ "id": "8-x-10", "label": "8 x 10", "priceCents": 4500 }, { "id": "12-x-16", "label": "12 x 16", "priceCents": 8000 }] }))
        .await;
    let before = stripe_calls(&app).await.len();
    let (status, updated) =
        artist.put("/sites/acme/artworks/old/store", json!({ "originalAvailable": false, "printSizeIds": ["8-x-10"] })).await;
    assert_eq!(status, StatusCode::OK, "{updated}");
    let calls = stripe_calls(&app).await[before..].to_vec();
    assert!(calls.iter().any(|(p, b)| p == "/v1/prices" && b.contains("unit_amount=4500")), "{calls:?}");
    assert!(calls.iter().any(|(p, b)| p.starts_with("/v1/prices/price_") && b == "active=false"), "old price archived");
    assert!(calls.iter().any(|(p, b)| p.starts_with("/v1/products/prod_") && b == "active=false"), "dropped size archived");
    assert_eq!(updated["store"]["originalAvailable"], false);
    let prints = updated["store"]["prints"].as_array().unwrap();
    assert_eq!(prints.iter().filter(|p| p["active"] == true).count(), 1);

    // Remove from store: everything archived, nothing deleted.
    let (status, removed) = artist.delete("/sites/acme/artworks/old/store").await;
    assert_eq!(status, StatusCode::OK, "{removed}");
    assert_eq!(removed["store"]["originalAvailable"], false);
    assert!(removed["store"]["prints"].as_array().unwrap().iter().all(|p| p["active"] == false));

    // Store settings can't be changed through the text editor.
    let (_, site) = artist.get("/sites/acme/documents/site/main").await;
    let mut data = site["data"].clone();
    data["store"]["printSizes"][0]["label"] = json!("Huge");
    let (status, _) = artist.put("/sites/acme/documents/site/main", json!({ "data": data, "baseVersion": site["version"] })).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[actix_web::test]
async fn sites_without_a_stripe_key_can_offer_the_original_but_not_prints() {
    let app = spawn_app().await;
    seed_sites(&app).await;
    let boss = superadmin(&app).await;
    let (_, settings) = boss.get("/sites/other/store").await;
    assert_eq!(settings["stripeConfigured"], false);
    // The original is inquiry-only, so it needs no Stripe.
    let (status, body) = boss.put("/sites/other/artworks/old/store", json!({ "originalAvailable": true })).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["store"]["originalAvailable"], true);
    // Prints do.
    boss.put("/sites/other/store", json!({ "printSizes": [{ "label": "8 x 10", "priceCents": 4000 }] })).await;
    let (status, body) =
        boss.put("/sites/other/artworks/old/store", json!({ "originalAvailable": true, "printSizeIds": ["8-x-10"] })).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["message"].as_str().unwrap().contains("Stripe isn't set up"));
    assert!(app.stripe_server.received_requests().await.unwrap().is_empty());
}

#[actix_web::test]
async fn bad_requests_are_refused_before_stripe_is_called() {
    let app = spawn_app().await;
    seed_sites(&app).await;
    mount_fake_stripe(&app).await;
    let boss = superadmin(&app).await;
    for body in [
        json!({ "originalPriceCents": 10 }),
        json!({ "originalAvailable": true, "printSizeIds": ["nope"] }),
    ] {
        let (status, _) = boss.put("/sites/acme/artworks/old/store", body.clone()).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    }
    assert!(app.stripe_server.received_requests().await.unwrap().is_empty());
}

#[actix_web::test]
async fn a_stripe_failure_is_reported_clearly() {
    let app = spawn_app().await;
    seed_sites(&app).await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(401).set_body_json(json!({ "error": { "message": "Invalid API Key provided" } })))
        .mount(&app.stripe_server)
        .await;
    let boss = superadmin(&app).await;
    boss.put("/sites/acme/store", json!({ "printSizes": [{ "label": "8 x 10", "priceCents": 4000 }] })).await;
    let (status, body) = boss.put("/sites/acme/artworks/old/store", json!({ "printSizeIds": ["8-x-10"] })).await;
    assert_eq!(status, StatusCode::BAD_GATEWAY);
    assert!(body["message"].as_str().unwrap().contains("Invalid API Key provided"), "{body}");
}

// ---------------------------------------------------------------- mailing list

#[actix_web::test]
async fn editors_see_and_manage_their_own_mailing_list() {
    let app = spawn_app().await;
    seed_sites(&app).await;
    for (site, email) in [("acme", "fan@example.com"), ("acme", "second@example.com"), ("other", "elsewhere@example.com")] {
        let response = reqwest::Client::new()
            .post(format!("{}/api/v1/mailing-list/{site}/subscribers", app.address))
            .json(&json!({ "email": email }))
            .send()
            .await
            .unwrap();
        assert!(response.status().is_success());
    }
    let boss = superadmin(&app).await;
    let artist = editor(&app, &boss).await;

    let (status, list) = artist.get("/sites/acme/mailing-list").await;
    assert_eq!(status, StatusCode::OK);
    let emails: Vec<&str> = list["subscribers"].as_array().unwrap().iter().map(|s| s["email"].as_str().unwrap()).collect();
    assert_eq!(emails.len(), 2);
    assert!(emails.contains(&"fan@example.com") && !emails.contains(&"elsewhere@example.com"));
    assert_eq!(artist.get("/sites/other/mailing-list").await.0, StatusCode::FORBIDDEN);

    let (status, _) = artist.post("/sites/acme/mailing-list/remove", json!({ "email": "FAN@example.com" })).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, list) = artist.get("/sites/acme/mailing-list").await;
    assert_eq!(list["subscribers"].as_array().unwrap().len(), 1);
}

#[actix_web::test]
async fn an_existing_list_can_be_added_from_the_dashboard() {
    let app = spawn_app().await;
    seed_sites(&app).await;
    let boss = superadmin(&app).await;
    let artist = editor(&app, &boss).await;
    artist.post("/sites/acme/mailing-list/add", json!({ "emails": ["old@example.com"] })).await;

    let (status, body) = artist
        .post(
            "/sites/acme/mailing-list/add",
            json!({ "emails": [" New@Example.com ", "new@example.com", "old@example.com", "not-an-email", ""] }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body, json!({ "added": 1, "alreadySubscribed": 1, "invalid": ["not-an-email"] }));
    let (_, list) = artist.get("/sites/acme/mailing-list").await;
    let emails: Vec<&str> = list["subscribers"].as_array().unwrap().iter().map(|s| s["email"].as_str().unwrap()).collect();
    assert_eq!(emails.len(), 2);
    assert!(emails.contains(&"new@example.com"));

    // Only into your own site.
    let (status, _) = artist.post("/sites/other/mailing-list/add", json!({ "emails": ["x@example.com"] })).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

// ---------------------------------------------------------------- prints

#[actix_web::test]
async fn prints_are_their_own_listings_linked_to_a_painting() {
    let app = spawn_app().await;
    seed_sites(&app).await;
    mount_fake_stripe(&app).await;
    let boss = superadmin(&app).await;
    let artist = editor(&app, &boss).await;
    let print = json!({
        "painting": "old", "title": "Archival Limited Edition",
        "size": { "width": 24, "height": 36 }, "editionSize": 15, "priceCents": 18000
    });

    // It must be of one of the site's paintings.
    let mut orphan = print.clone();
    orphan["painting"] = json!("nope");
    let (status, _) = artist.post("/sites/acme/prints", json!({ "slug": "x", "print": orphan })).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(app.stripe_server.received_requests().await.unwrap().is_empty());

    // Creating it makes a Stripe product and a payment link limited to the edition.
    let (status, created) = artist.post("/sites/acme/prints", json!({ "slug": "old-archival", "print": print })).await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    assert_eq!(created["print"]["stripe"]["active"], true);
    let calls = stripe_calls(&app).await;
    let product = calls.iter().find(|(p, _)| p == "/v1/products").unwrap();
    assert!(product.1.contains("name=Old+%7C+Archival+Limited+Edition+24+x+36"), "{}", product.1);
    assert!(product.1.contains("unit_amount%5D=18000"), "{}", product.1);
    let link = calls.iter().find(|(p, _)| p == "/v1/payment_links").unwrap();
    assert!(link.1.contains("restrictions%5Bcompleted_sessions%5D%5Blimit%5D=15"), "{}", link.1);
    assert!(link.1.contains("shipping_address_collection"), "{}", link.1);
    let (status, _) = artist.post("/sites/acme/prints", json!({ "slug": "old-archival", "print": print })).await;
    assert_eq!(status, StatusCode::CONFLICT);

    // The website lists it (with its painting and Buy link, no Stripe ids) and the painting links to it.
    let get = |path: String| async move { reqwest::get(path).await.unwrap().json::<Value>().await.unwrap() };
    let listed = get(format!("{}/api/v1/content/acme/prints", app.address)).await;
    assert_eq!(listed[0]["name"], "Old | Archival Limited Edition 24 x 36");
    assert_eq!(listed[0]["buyUrl"], "https://buy.stripe.com/test_1");
    assert_eq!(listed[0]["artwork"]["slug"], "old");
    assert!(listed[0].get("stripe").is_none());
    let painting = get(format!("{}/api/v1/content/acme/products/old", app.address)).await;
    assert_eq!(painting["prints"], json!([{ "slug": "old-archival", "title": "Archival Limited Edition", "size": { "width": 24.0, "height": 36.0, "unit": "in" }, "sizeLabel": "24 x 36", "editionSize": 15 }]));

    // A new price needs a new payment link; the old one is switched off.
    let mut dearer = print.clone();
    dearer["priceCents"] = json!(20000);
    let before = stripe_calls(&app).await.len();
    let (status, updated) = artist.put("/sites/acme/prints/old-archival", json!({ "print": dearer })).await;
    assert_eq!(status, StatusCode::OK, "{updated}");
    let calls = stripe_calls(&app).await[before..].to_vec();
    assert!(calls.iter().any(|(p, b)| p == "/v1/prices" && b.contains("unit_amount=20000")), "{calls:?}");
    assert!(calls.iter().any(|(p, b)| p == "/v1/payment_links/plink_1" && b == "active=false"), "{calls:?}");
    assert_ne!(updated["print"]["stripe"]["paymentLinkUrl"], "https://buy.stripe.com/test_1");

    // Off sale: gone from the website, link and product switched off.
    let mut off = dearer.clone();
    off["forSale"] = json!(false);
    let (status, _) = artist.put("/sites/acme/prints/old-archival", json!({ "print": off })).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(get(format!("{}/api/v1/content/acme/prints", app.address)).await, json!([]));
    assert_eq!(get(format!("{}/api/v1/content/acme/products/old", app.address)).await["prints"], json!([]));

    // Other sites' prints are off limits, and prints aren't editable as raw documents.
    assert_eq!(artist.get("/sites/other/prints").await.0, StatusCode::FORBIDDEN);
    let (_, doc) = artist.get("/sites/acme/documents/print/old-archival").await;
    let (status, _) = artist.put("/sites/acme/documents/print/old-archival", json!({ "data": doc["data"], "baseVersion": doc["version"] })).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let (status, _) = artist.delete("/sites/acme/prints/old-archival").await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, list) = artist.get("/sites/acme/prints").await;
    assert_eq!(list["prints"], json!([]));
}

#[actix_web::test]
async fn prints_can_be_saved_without_stripe_and_offer_inquiry() {
    let app = spawn_app().await;
    seed_sites(&app).await;
    let boss = superadmin(&app).await;
    let print = json!({ "painting": "old", "title": "Open Edition", "size": { "width": 8, "height": 10 }, "priceCents": 3000 });
    let (status, created) = boss.post("/sites/other/prints", json!({ "slug": "old-open", "print": print })).await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    assert!(created["note"].as_str().unwrap().contains("Stripe isn't connected"));
    let listed = reqwest::get(format!("{}/api/v1/content/other/prints", app.address)).await.unwrap().json::<Value>().await.unwrap();
    assert_eq!(listed[0]["name"], "Old | Open Edition 8 x 10");
    assert!(listed[0].get("buyUrl").is_none(), "no checkout without Stripe");
    assert!(app.stripe_server.received_requests().await.unwrap().is_empty());
}

#[actix_web::test]
async fn print_size_names_and_rates_are_checked() {
    let app = spawn_app().await;
    seed_sites(&app).await;
    let boss = superadmin(&app).await;
    let (status, _) = boss.put("/sites/acme/store", json!({ "printSizes": [{ "label": "Original", "priceCents": 4000 }] })).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "that name is reserved for the original-size print");
    for rate in [json!(0), json!(-1), json!(500)] {
        let (status, _) = boss.put("/sites/acme/store", json!({ "printSizes": [], "originalSizeRate": rate })).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{rate}");
    }
    let (_, settings) = boss.get("/sites/acme/store").await;
    assert_eq!(settings["originalSizeRate"], 0.2, "defaults when the site hasn't set one");
}

// ---------------------------------------------------------------- shipping + orders

/// The acme site with a web address and an email recipient for order notifications.
async fn seed_shop(app: &TestApp) {
    seed_sites(app).await;
    admin_put(
        app,
        "/tenants/acme/documents/site/main",
        json!({ "$type": "site", "name": "acme art", "url": "https://acme.test", "currency": "CAD",
                "integrations": { "email": { "recipient": "artist@acme.test", "fromName": "Acme website" } } }),
    )
    .await;
}

/// POST a webhook event the way Stripe does (signed with the site's secret unless `secret` overrides it).
async fn deliver(app: &TestApp, site: &str, event: &Value, secret: &str) -> StatusCode {
    let body = event.to_string();
    reqwest::Client::new()
        .post(format!("{}/api/v1/stripe/{site}/webhook", app.address))
        .header("Stripe-Signature", common::stripe_signature(&body, secret))
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
        .unwrap()
        .status()
}

fn paid_checkout(session_id: &str, payment_link: &str) -> Value {
    json!({
        "type": "checkout.session.completed",
        "data": { "object": {
            "id": session_id, "payment_status": "paid", "payment_link": payment_link,
            "amount_total": 19500, "currency": "cad", "total_details": { "amount_shipping": 1500 },
            "customer_details": { "name": "Ana Buyer", "email": "ana@example.com" },
            "collected_information": { "shipping_details": { "name": "Ana Buyer", "address": {
                "line1": "1 Main St", "city": "Vancouver", "state": "BC", "postal_code": "V5V 1A1", "country": "CA" } } }
        } }
    })
}

#[actix_web::test]
async fn shipping_and_the_thank_you_page_are_on_every_payment_link() {
    let app = spawn_app().await;
    seed_shop(&app).await;
    mount_fake_stripe(&app).await;
    let boss = superadmin(&app).await;
    let artist = editor(&app, &boss).await;
    let print = json!({ "painting": "old", "title": "Open Edition", "size": { "width": 8, "height": 10 }, "priceCents": 3000 });
    let (status, created) = artist.post("/sites/acme/prints", json!({ "slug": "old-open", "print": print })).await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    let first_link = created["print"]["stripe"]["paymentLinkId"].clone();
    let link = stripe_calls(&app).await.into_iter().find(|(p, _)| p == "/v1/payment_links").unwrap();
    assert!(link.1.contains("after_completion%5Btype%5D=redirect"), "{}", link.1);
    assert!(link.1.contains("https%3A%2F%2Facme.test%2Forder-complete%3Fsession_id%3D%7BCHECKOUT_SESSION_ID%7D"), "{}", link.1);
    assert!(!link.1.contains("shipping_options"), "no shipping charge yet: {}", link.1);

    // Setting shipping makes a Stripe rate and remakes the print's link with it.
    let (status, saved) = artist.put("/sites/acme/shipping", json!({ "shipping": { "label": "Shipping", "amountCents": 1500 } })).await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    assert_eq!(saved["updated"], 1);
    let calls = stripe_calls(&app).await;
    let rate = calls.iter().find(|(p, _)| p == "/v1/shipping_rates").unwrap();
    assert!(rate.1.contains("fixed_amount%5Bamount%5D=1500") && rate.1.contains("display_name=Shipping"), "{}", rate.1);
    let newest_link = calls.iter().filter(|(p, _)| p == "/v1/payment_links").last().unwrap();
    assert!(newest_link.1.contains("shipping_options%5B0%5D%5Bshipping_rate%5D=shr_"), "{}", newest_link.1);
    let (_, list) = artist.get("/sites/acme/prints").await;
    assert_eq!(list["shipping"], json!({ "label": "Shipping", "amountCents": 1500 }));
    assert_ne!(list["prints"][0]["stripe"]["paymentLinkId"], first_link);

    // Saving the same shipping again changes nothing in Stripe.
    let before = stripe_calls(&app).await.len();
    artist.put("/sites/acme/shipping", json!({ "shipping": { "label": "Shipping", "amountCents": 1500 } })).await;
    let calls = stripe_calls(&app).await[before..].to_vec();
    assert!(!calls.iter().any(|(p, _)| p == "/v1/shipping_rates" || p == "/v1/payment_links"), "{calls:?}");

    // Bad amounts are refused.
    let (status, _) = artist.put("/sites/acme/shipping", json!({ "shipping": { "label": "Shipping", "amountCents": -1 } })).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    // Another site's shipping is off limits.
    let (status, _) = artist.put("/sites/other/shipping", json!({ "shipping": null })).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[actix_web::test]
async fn a_paid_checkout_is_recorded_once_emailed_and_sells_out_the_edition() {
    let app = spawn_app().await;
    seed_shop(&app).await;
    mount_fake_stripe(&app).await;
    Mock::given(method("POST"))
        .and(path("/emails"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "id": "email-1" })))
        .expect(1)
        .mount(&app.email_server)
        .await;
    let boss = superadmin(&app).await;
    let artist = editor(&app, &boss).await;
    let print = json!({ "painting": "old", "title": "Archival", "size": { "width": 24, "height": 36 }, "editionSize": 1, "priceCents": 18000 });
    let (_, created) = artist.post("/sites/acme/prints", json!({ "slug": "old-archival", "print": print })).await;
    let link = created["print"]["stripe"]["paymentLinkId"].as_str().unwrap().to_string();

    // Unsigned or wrongly signed deliveries are refused and change nothing.
    let event = paid_checkout("cs_test_1", &link);
    assert_eq!(deliver(&app, "acme", &event, "whsec_wrong").await, StatusCode::BAD_REQUEST);
    // A site without a webhook secret can't receive them at all.
    assert_eq!(deliver(&app, "other", &event, common::STRIPE_WEBHOOK_SECRET).await, StatusCode::BAD_REQUEST);
    let (_, orders) = artist.get("/sites/acme/orders").await;
    assert_eq!(orders["orders"], json!([]));
    assert_eq!(orders["connected"], true);

    // The real delivery is recorded; Stripe retrying it doesn't make a second order or email.
    assert_eq!(deliver(&app, "acme", &event, common::STRIPE_WEBHOOK_SECRET).await, StatusCode::OK);
    assert_eq!(deliver(&app, "acme", &event, common::STRIPE_WEBHOOK_SECRET).await, StatusCode::OK);
    let (_, orders) = artist.get("/sites/acme/orders").await;
    let list = orders["orders"].as_array().unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0]["printName"], "Old | Archival 24 x 36");
    assert_eq!(list[0]["printSlug"], "old-archival");
    assert_eq!(list[0]["amountTotalCents"], 19500);
    assert_eq!(list[0]["shippingCents"], 1500);
    assert_eq!(list[0]["customerEmail"], "ana@example.com");
    assert_eq!(list[0]["shippingAddress"]["city"], "Vancouver");
    assert_eq!(list[0]["shippedAt"], Value::Null);

    // The artist was emailed the buyer and address, with replies going to the buyer.
    let emails = app.email_server.received_requests().await.unwrap();
    let email: Value = serde_json::from_slice(&emails[0].body).unwrap();
    assert!(email["to"].to_string().contains("artist@acme.test"), "{email}");
    assert!(email["reply_to"].to_string().contains("ana@example.com"), "{email}");
    let text = email["text"].as_str().unwrap_or_default();
    assert!(text.contains("Old | Archival 24 x 36") && text.contains("1 Main St") && text.contains("$195.00 CAD"), "{text}");

    // That was the only copy: sold out on the website, with no Buy link.
    let print = reqwest::get(format!("{}/api/v1/content/acme/prints/old-archival", app.address)).await.unwrap().json::<Value>().await.unwrap();
    assert_eq!(print["soldOut"], true);
    assert!(print.get("buyUrl").is_none());
    let painting = reqwest::get(format!("{}/api/v1/content/acme/products/old", app.address)).await.unwrap().json::<Value>().await.unwrap();
    assert_eq!(painting["prints"][0]["soldOut"], true);

    // Ticked off as shipped (and back).
    let id = list[0]["id"].as_str().unwrap();
    assert_eq!(artist.put(&format!("/sites/acme/orders/{id}"), json!({ "shipped": true })).await.0, StatusCode::NO_CONTENT);
    let (_, orders) = artist.get("/sites/acme/orders").await;
    assert!(orders["orders"][0]["shippedAt"].is_string());
    assert_eq!(artist.put(&format!("/sites/acme/orders/{id}"), json!({ "shipped": false })).await.0, StatusCode::NO_CONTENT);
    // Another site's orders are off limits.
    assert_eq!(artist.get("/sites/other/orders").await.0, StatusCode::FORBIDDEN);

    // Unpaid checkouts (e.g. a bank transfer still pending) are acknowledged but not recorded.
    let mut pending = paid_checkout("cs_test_2", &link);
    pending["data"]["object"]["payment_status"] = json!("unpaid");
    assert_eq!(deliver(&app, "acme", &pending, common::STRIPE_WEBHOOK_SECRET).await, StatusCode::OK);
    let (_, orders) = artist.get("/sites/acme/orders").await;
    assert_eq!(orders["orders"].as_array().unwrap().len(), 1);

    // Growing the edition puts it back on sale.
    let mut bigger = print_input_from(&created["print"]);
    bigger["editionSize"] = json!(5);
    let (status, updated) = artist.put("/sites/acme/prints/old-archival", json!({ "print": bigger })).await;
    assert_eq!(status, StatusCode::OK, "{updated}");
    assert_eq!(updated["print"]["soldOut"], false);
}

/// The dashboard's print input for an existing print document.
fn print_input_from(doc: &Value) -> Value {
    json!({
        "painting": doc["painting"], "title": doc["title"],
        "size": { "width": doc["size"]["width"], "height": doc["size"]["height"] },
        "editionSize": doc["editionSize"], "priceCents": doc["priceCents"], "forSale": doc["forSale"],
    })
}

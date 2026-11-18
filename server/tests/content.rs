mod common;

use std::path::Path;

use common::{spawn_app, TestApp};
use serde_json::{json, Value};
use server::content::import_tenant_dir;

const TENANT: &str = "siansahil";

/// App with the real `content/tenants/siansahil` folder imported, plus a
/// second minimal tenant ("other") to prove tenants don't see each other.
async fn seeded_app() -> TestApp {
    let app = spawn_app().await;
    import_tenant_dir(&app.db_pool, Path::new("content/tenants/siansahil"))
        .await
        .expect("Failed to import siansahil content");

    sqlx::query("INSERT INTO tenants (id) VALUES ('other')").execute(&app.db_pool).await.unwrap();
    sqlx::query(
        "INSERT INTO documents (tenant_id, doc_type, key, data) VALUES
         ('other', 'site', 'main', '{\"$type\":\"site\",\"name\":\"Other Artist\"}'),
         ('other', 'page', 'about', '{\"$type\":\"page\",\"slug\":\"about\",\"blocks\":[]}')",
    )
    .execute(&app.db_pool)
    .await
    .unwrap();
    app
}

/// GET /api/v1/content/{tenant}{path}
async fn get(app: &TestApp, tenant: &str, path: &str) -> (u16, Value) {
    let response = reqwest::Client::new()
        .get(format!("{}/api/v1/content/{tenant}{path}", app.address))
        .send()
        .await
        .expect("Failed to execute request.");
    let status = response.status().as_u16();
    let json = response.json::<Value>().await.unwrap_or(Value::Null);
    (status, json)
}

#[actix_web::test]
async fn site_returns_the_tenants_site_document() {
    let app = seeded_app().await;
    let (status, site) = get(&app, TENANT, "/site").await;

    assert_eq!(status, 200);
    assert_eq!(site["$type"], "site");
    assert_eq!(site["name"], "Sahil Sian");
    assert_eq!(site["labels"]["back"], "Back");
}

#[actix_web::test]
async fn same_endpoint_returns_different_data_per_tenant() {
    let app = seeded_app().await;
    let (_, ours) = get(&app, TENANT, "/site").await;
    let (_, theirs) = get(&app, "other", "/site").await;

    assert_eq!(ours["name"], "Sahil Sian");
    assert_eq!(theirs["name"], "Other Artist");

    // A document only one tenant has is invisible to the other.
    let (status, _) = get(&app, "other", "/pages/faq").await;
    assert_eq!(status, 404);
}

#[actix_web::test]
async fn page_includes_the_forms_its_blocks_reference() {
    let app = seeded_app().await;
    let (status, page) = get(&app, TENANT, "/pages/contact").await;

    assert_eq!(status, 200);
    assert_eq!(page["blocks"][0]["formId"], "contact");
    assert_eq!(page["included"]["forms"]["contact"]["$type"], "form");
    let field_ids: Vec<&str> = page["included"]["forms"]["contact"]["fields"]
        .as_array()
        .unwrap()
        .iter()
        .map(|f| f["id"].as_str().unwrap())
        .collect();
    assert_eq!(field_ids, ["name", "email", "message", "submit"]);
}

#[actix_web::test]
async fn page_without_references_has_empty_included() {
    let app = seeded_app().await;
    let (status, page) = get(&app, TENANT, "/pages/about").await;

    assert_eq!(status, 200);
    assert_eq!(page["layout"]["title"], "About");
    assert_eq!(page["included"], json!({ "forms": {}, "collections": {} }));
}

#[actix_web::test]
async fn product_returns_full_document() {
    let app = seeded_app().await;
    let (status, product) = get(&app, TENANT, "/products/science-world").await;

    assert_eq!(status, 200);
    assert_eq!(product["title"], "Science World");
    assert_eq!(product["images"].as_array().unwrap().len(), 2);
    assert_eq!(product["tabs"][0]["title"], "Story");
}

#[actix_web::test]
async fn curated_collection_returns_its_products_as_summaries() {
    let app = seeded_app().await;
    let (status, gallery) = get(&app, TENANT, "/collections/gallery").await;

    assert_eq!(status, 200);
    assert_eq!(gallery["title"], "Gallery");
    let slugs: Vec<&str> = gallery["products"].as_array().unwrap().iter().map(|p| p["slug"].as_str().unwrap()).collect();
    assert_eq!(slugs, ["mount-pleasant", "robson-granville", "science-world"]);
    assert!(gallery["products"][0].get("tabs").is_none());
}

#[actix_web::test]
async fn collection_search_narrows_by_title() {
    let app = seeded_app().await;
    let (status, all) = get(&app, TENANT, "/collections/all?search=dog").await;

    assert_eq!(status, 200);
    let slugs: Vec<&str> = all["products"].as_array().unwrap().iter().map(|p| p["slug"].as_str().unwrap()).collect();
    assert_eq!(slugs, ["two-headed-dog"]);
}

#[actix_web::test]
async fn form_returns_schema() {
    let app = seeded_app().await;
    let (status, form) = get(&app, TENANT, "/forms/mailing-list").await;

    assert_eq!(status, 200);
    assert_eq!(form["successMessage"], "Thanks for subscribing!");
}

#[actix_web::test]
async fn unknown_tenant_is_404_tenant_not_found() {
    let app = seeded_app().await;
    let (status, body) = get(&app, "nobody", "/site").await;

    assert_eq!(status, 404);
    assert_eq!(body["error"], "tenant_not_found");
}

#[actix_web::test]
async fn missing_document_is_404_not_found() {
    let app = seeded_app().await;
    for path in ["/pages/nope", "/products/nope", "/collections/nope", "/forms/nope"] {
        let (status, body) = get(&app, TENANT, path).await;
        assert_eq!(status, 404, "{path}");
        assert_eq!(body["error"], "not_found", "{path}");
    }
}

#[actix_web::test]
async fn invalid_tenant_id_or_key_is_400() {
    let app = seeded_app().await;
    for (tenant, path, case) in [
        ("Bad%20Id", "/site", "tenant with space"),
        ("UPPER", "/site", "uppercase tenant"),
        ("-x", "/site", "leading dash"),
        (TENANT, "/pages/Not_A_Slug", "invalid page key"),
    ] {
        let (status, response) = get(&app, tenant, path).await;
        assert_eq!(status, 400, "{case}");
        assert_eq!(response["error"], "bad_request", "{case}");
    }
}

#[actix_web::test]
async fn success_is_cacheable_and_errors_are_not() {
    let app = seeded_app().await;
    let client = reqwest::Client::new();

    let ok = client.get(format!("{}/api/v1/content/{TENANT}/site", app.address)).send().await.unwrap();
    assert_eq!(ok.headers()["cache-control"], "public, max-age=60, stale-while-revalidate=300");

    let missing = client.get(format!("{}/api/v1/content/{TENANT}/pages/nope", app.address)).send().await.unwrap();
    assert_eq!(missing.headers()["cache-control"], "no-store");
}

#[actix_web::test]
async fn content_allows_cross_origin_requests() {
    let app = seeded_app().await;
    let response = reqwest::Client::new()
        .get(format!("{}/api/v1/content/{TENANT}/site", app.address))
        .header("Origin", "https://siansahil.com")
        .send()
        .await
        .unwrap();

    assert!(response.status().is_success());
    assert_eq!(response.headers()["access-control-allow-origin"], "https://siansahil.com");
}

#[actix_web::test]
async fn content_endpoints_do_not_accept_writes() {
    let app = seeded_app().await;
    let response = reqwest::Client::new()
        .post(format!("{}/api/v1/content/{TENANT}/site", app.address))
        .json(&json!({ "name": "hacked" }))
        .send()
        .await
        .unwrap();
    assert!(response.status().is_client_error(), "got {}", response.status());

    let (_, site) = get(&app, TENANT, "/site").await;
    assert_eq!(site["name"], "Sahil Sian");
}

#[actix_web::test]
async fn reimporting_unchanged_content_does_not_bump_versions() {
    let app = seeded_app().await;
    import_tenant_dir(&app.db_pool, Path::new("content/tenants/siansahil")).await.unwrap();

    let (max_version,): (i32,) = sqlx::query_as("SELECT MAX(version) FROM documents WHERE tenant_id = 'siansahil'")
        .fetch_one(&app.db_pool)
        .await
        .unwrap();
    assert_eq!(max_version, 1);
}

#[actix_web::test]
async fn collections_list_returns_summaries() {
    let app = seeded_app().await;
    let (status, list) = get(&app, TENANT, "/collections").await;

    assert_eq!(status, 200);
    let ids: Vec<&str> = list.as_array().unwrap().iter().map(|c| c["id"].as_str().unwrap()).collect();
    assert_eq!(ids, ["all", "drawings", "gallery", "photography", "plein-air"]);
    assert_eq!(list[2]["title"], "Gallery");
    assert!(list[2].get("filter").is_none(), "summaries only");

    let (status, body) = get(&app, "nobody", "/collections").await;
    assert_eq!(status, 404);
    assert_eq!(body["error"], "tenant_not_found");
}

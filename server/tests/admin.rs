mod common;

use common::{spawn_app, TestApp};
use reqwest::{Method, StatusCode};
use serde_json::{json, Value};

/// Admin request with the app's real key.
async fn admin(app: &TestApp, method: Method, path: &str, body: Option<Value>) -> (StatusCode, Value) {
    send(app, method, path, body, Some(&app.admin_key)).await
}

async fn send(app: &TestApp, method: Method, path: &str, body: Option<Value>, key: Option<&str>) -> (StatusCode, Value) {
    let mut request = reqwest::Client::new().request(method, format!("{}/api/v1/admin{path}", app.address));
    if let Some(key) = key {
        request = request.bearer_auth(key);
    }
    if let Some(body) = body {
        request = request.json(&body);
    }
    let response = request.send().await.expect("Failed to execute request.");
    let status = response.status();
    (status, response.json::<Value>().await.unwrap_or(Value::Null))
}

async fn public(app: &TestApp, path: &str) -> (StatusCode, Value) {
    let response = reqwest::Client::new()
        .get(format!("{}/api/v1/content{path}", app.address))
        .send()
        .await
        .unwrap();
    let status = response.status();
    (status, response.json::<Value>().await.unwrap_or(Value::Null))
}

// ---------------------------------------------------------------- auth

#[actix_web::test]
async fn every_admin_route_rejects_missing_or_wrong_keys() {
    let app = spawn_app().await;
    let routes = [
        (Method::GET, "/tenants"),
        (Method::POST, "/tenants"),
        (Method::GET, "/tenants/acme"),
        (Method::PUT, "/tenants/acme"),
        (Method::DELETE, "/tenants/acme"),
        (Method::GET, "/tenants/acme/documents"),
        (Method::GET, "/tenants/acme/documents/site/main"),
        (Method::PUT, "/tenants/acme/documents/site/main"),
        (Method::DELETE, "/tenants/acme/documents/site/main"),
    ];
    let wrong_key = format!("{}x", app.admin_key);
    for (method, path) in routes {
        for key in [None, Some(""), Some("short"), Some(wrong_key.as_str())] {
            let (status, body) = send(&app, method.clone(), path, Some(json!({ "id": "acme" })), key).await;
            assert_eq!(status, StatusCode::UNAUTHORIZED, "{method} {path} with {key:?}");
            assert_eq!(body["error"], "unauthorized");
        }
    }
    // Nothing was created by the rejected requests.
    let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM tenants").fetch_one(&app.db_pool).await.unwrap();
    assert_eq!(count, 0);
}

#[actix_web::test]
async fn non_bearer_schemes_are_rejected() {
    let app = spawn_app().await;
    let response = reqwest::Client::new()
        .get(format!("{}/api/v1/admin/tenants", app.address))
        .header("Authorization", format!("Basic {}", app.admin_key))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(response.headers()["www-authenticate"], "Bearer");
}

// ---------------------------------------------------------------- tenants

#[actix_web::test]
async fn tenant_crud_round_trip() {
    let app = spawn_app().await;

    // Create
    let (status, created) =
        admin(&app, Method::POST, "/tenants", Some(json!({ "id": "acme", "domains": ["Acme.com", "acme.com"] }))).await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(created["id"], "acme");
    assert_eq!(created["domains"], json!(["acme.com"]));
    assert_eq!(created["documentCount"], 0);

    // Read one + list
    let (status, fetched) = admin(&app, Method::GET, "/tenants/acme", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(fetched["id"], "acme");
    let (_, list) = admin(&app, Method::GET, "/tenants", None).await;
    assert_eq!(list.as_array().unwrap().len(), 1);

    // Update domains
    let (status, updated) =
        admin(&app, Method::PUT, "/tenants/acme", Some(json!({ "domains": ["acme.ca", "www.acme.ca"] }))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(updated["domains"], json!(["acme.ca", "www.acme.ca"]));

    // Delete
    let (status, _) = admin(&app, Method::DELETE, "/tenants/acme", None).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, body) = admin(&app, Method::GET, "/tenants/acme", None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["error"], "tenant_not_found");
}

#[actix_web::test]
async fn creating_an_existing_tenant_is_409() {
    let app = spawn_app().await;
    admin(&app, Method::POST, "/tenants", Some(json!({ "id": "acme" }))).await;
    let (status, body) = admin(&app, Method::POST, "/tenants", Some(json!({ "id": "acme" }))).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["error"], "conflict");
}

#[actix_web::test]
async fn invalid_tenant_bodies_are_400() {
    let app = spawn_app().await;
    for (body, case) in [
        (json!({}), "missing id"),
        (json!({ "id": "Bad Id" }), "invalid id"),
        (json!({ "id": "acme", "domains": ["https://acme.com"] }), "url instead of domain"),
        (json!({ "id": "acme", "extra": true }), "unknown field"),
    ] {
        let (status, response) = admin(&app, Method::POST, "/tenants", Some(body)).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{case}");
        assert_eq!(response["error"], "bad_request", "{case}");
    }
}

#[actix_web::test]
async fn updating_or_deleting_a_missing_tenant_is_404() {
    let app = spawn_app().await;
    let (status, _) = admin(&app, Method::PUT, "/tenants/ghost", Some(json!({ "domains": [] }))).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = admin(&app, Method::DELETE, "/tenants/ghost", None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

// ---------------------------------------------------------------- documents

#[actix_web::test]
async fn admin_created_tenant_is_served_by_the_public_endpoints() {
    let app = spawn_app().await;
    admin(&app, Method::POST, "/tenants", Some(json!({ "id": "acme" }))).await;

    // Unknown to the public API until it has a site document.
    let (status, _) = public(&app, "/acme/site").await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (status, put) = admin(
        &app,
        Method::PUT,
        "/tenants/acme/documents/site/main",
        Some(json!({ "$type": "site", "name": "Acme Art" })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(put["status"], "created");
    assert_eq!(put["version"], 1);

    let (status, site) = public(&app, "/acme/site").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(site["name"], "Acme Art");
}

#[actix_web::test]
async fn putting_a_document_bumps_version_only_on_change() {
    let app = spawn_app().await;
    admin(&app, Method::POST, "/tenants", Some(json!({ "id": "acme" }))).await;
    let path = "/tenants/acme/documents/page/about";
    let v1 = json!({ "$type": "page", "slug": "about", "blocks": [] });
    let v2 = json!({ "$type": "page", "slug": "about", "blocks": [{ "type": "richText", "body": "Hi" }] });

    let (status, first) = admin(&app, Method::PUT, path, Some(v1.clone())).await;
    assert_eq!((status, first["version"].clone()), (StatusCode::CREATED, json!(1)));

    let (status, same) = admin(&app, Method::PUT, path, Some(v1)).await;
    assert_eq!((status, same["status"].clone(), same["version"].clone()), (StatusCode::OK, json!("unchanged"), json!(1)));

    let (status, changed) = admin(&app, Method::PUT, path, Some(v2)).await;
    assert_eq!((status, changed["status"].clone(), changed["version"].clone()), (StatusCode::OK, json!("updated"), json!(2)));

    let (status, doc) = admin(&app, Method::GET, path, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(doc["type"], "page");
    assert_eq!(doc["key"], "about");
    assert_eq!(doc["version"], 2);
    assert_eq!(doc["data"]["blocks"][0]["body"], "Hi");
}

#[actix_web::test]
async fn invalid_documents_are_400() {
    let app = spawn_app().await;
    admin(&app, Method::POST, "/tenants", Some(json!({ "id": "acme" }))).await;
    for (path, body, case) in [
        ("/tenants/acme/documents/page/about", json!({ "$type": "product" }), "$type mismatch"),
        ("/tenants/acme/documents/page/about", json!({ "slug": "about" }), "missing $type"),
        ("/tenants/acme/documents/page/about", json!(["not", "an", "object"]), "not an object"),
        ("/tenants/acme/documents/widget/x", json!({ "$type": "widget" }), "unknown type"),
        ("/tenants/acme/documents/page/Bad_Key", json!({ "$type": "page" }), "invalid key"),
        ("/tenants/acme/documents/site/other", json!({ "$type": "site" }), "site key must be main"),
    ] {
        let (status, response) = admin(&app, Method::PUT, path, Some(body)).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{case}");
        assert_eq!(response["error"], "bad_request", "{case}");
    }
}

#[actix_web::test]
async fn putting_a_document_for_a_missing_tenant_is_404() {
    let app = spawn_app().await;
    let (status, body) =
        admin(&app, Method::PUT, "/tenants/ghost/documents/site/main", Some(json!({ "$type": "site" }))).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["error"], "tenant_not_found");
}

#[actix_web::test]
async fn listing_and_deleting_documents() {
    let app = spawn_app().await;
    admin(&app, Method::POST, "/tenants", Some(json!({ "id": "acme" }))).await;
    for (doc_type, key) in [("page", "home"), ("page", "about"), ("form", "contact")] {
        admin(
            &app,
            Method::PUT,
            &format!("/tenants/acme/documents/{doc_type}/{key}"),
            Some(json!({ "$type": doc_type })),
        )
        .await;
    }

    let (_, all) = admin(&app, Method::GET, "/tenants/acme/documents", None).await;
    let ids: Vec<String> = all.as_array().unwrap().iter().map(|d| format!("{}/{}", d["type"].as_str().unwrap(), d["key"].as_str().unwrap())).collect();
    assert_eq!(ids, ["form/contact", "page/about", "page/home"]);

    let (_, pages) = admin(&app, Method::GET, "/tenants/acme/documents?type=page", None).await;
    assert_eq!(pages.as_array().unwrap().len(), 2);

    let (status, _) = admin(&app, Method::GET, "/tenants/acme/documents?type=widget", None).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let (status, _) = admin(&app, Method::DELETE, "/tenants/acme/documents/page/about", None).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _) = admin(&app, Method::DELETE, "/tenants/acme/documents/page/about", None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = public(&app, "/acme/pages/about").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[actix_web::test]
async fn deleting_a_tenant_removes_its_documents() {
    let app = spawn_app().await;
    admin(&app, Method::POST, "/tenants", Some(json!({ "id": "acme" }))).await;
    admin(&app, Method::PUT, "/tenants/acme/documents/site/main", Some(json!({ "$type": "site" }))).await;
    admin(&app, Method::DELETE, "/tenants/acme", None).await;

    let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM documents WHERE tenant_id = 'acme'")
        .fetch_one(&app.db_pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
    let (status, body) = public(&app, "/acme/site").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["error"], "tenant_not_found");
}

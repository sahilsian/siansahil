mod common;

use common::{spawn_app, TestApp};
use reqwest::StatusCode;
use serde_json::{json, Value};
use wiremock::matchers::{header, method, path};
use wiremock::{Mock, ResponseTemplate};

const TENANT: &str = "acme";
const RECIPIENT: &str = "owner@acme.test";

/// App with tenant "acme" whose site document routes notifications to RECIPIENT.
async fn app_with_tenant() -> TestApp {
    let app = spawn_app().await;
    sqlx::query("INSERT INTO tenants (id) VALUES ($1)").bind(TENANT).execute(&app.db_pool).await.unwrap();
    let site = json!({
        "$type": "site",
        "name": "Acme Art",
        "integrations": { "email": { "recipient": RECIPIENT, "fromName": "Acme Website" } }
    });
    sqlx::query("INSERT INTO documents (tenant_id, doc_type, key, data) VALUES ($1, 'site', 'main', $2)")
        .bind(TENANT)
        .bind(site)
        .execute(&app.db_pool)
        .await
        .unwrap();
    app
}

async fn subscribe(app: &TestApp, tenant: &str, body: Value) -> (StatusCode, Value) {
    let response = reqwest::Client::new()
        .post(format!("{}/api/v1/mailing-list/{tenant}/subscribers", app.address))
        .json(&body)
        .send()
        .await
        .expect("Failed to execute request.");
    let status = response.status();
    (status, response.json().await.unwrap_or(Value::Null))
}

async fn stored(app: &TestApp, tenant: &str) -> Vec<String> {
    sqlx::query_scalar("SELECT email FROM mailing_list_subscribers WHERE tenant_id = $1 ORDER BY email")
        .bind(tenant)
        .fetch_all(&app.db_pool)
        .await
        .unwrap()
}

/// The JSON bodies Resend received.
async fn sent_emails(app: &TestApp) -> Vec<Value> {
    app.email_server
        .received_requests()
        .await
        .unwrap_or_default()
        .iter()
        .map(|r| serde_json::from_slice(&r.body).unwrap())
        .collect()
}

fn resend_accepts() -> Mock {
    Mock::given(method("POST"))
        .and(path("/emails"))
        .and(header("Authorization", "Bearer test-resend-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "id": "email-1" })))
}

#[actix_web::test]
async fn new_signup_is_stored_and_the_tenant_is_notified() {
    let app = app_with_tenant().await;
    resend_accepts().expect(1).mount(&app.email_server).await;

    let (status, body) = subscribe(&app, TENANT, json!({ "email": "fan@example.com" })).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["status"], "subscribed");
    assert_eq!(stored(&app, TENANT).await, ["fan@example.com"]);

    let emails = sent_emails(&app).await;
    assert_eq!(emails.len(), 1);
    let email = &emails[0];
    assert_eq!(email["to"], json!([RECIPIENT]));
    assert_eq!(email["from"], "Acme Website <onboarding@resend.dev>");
    assert_eq!(email["reply_to"], "fan@example.com");
    assert!(email["subject"].as_str().unwrap().contains("fan@example.com"));
    assert!(email["text"].as_str().unwrap().contains("Acme Art mailing list"));
}

#[actix_web::test]
async fn address_is_normalised_before_storing() {
    let app = app_with_tenant().await;
    resend_accepts().mount(&app.email_server).await;

    subscribe(&app, TENANT, json!({ "email": "  Fan@Example.COM " })).await;
    assert_eq!(stored(&app, TENANT).await, ["fan@example.com"]);
}

#[actix_web::test]
async fn repeat_signup_is_ok_but_stores_and_notifies_only_once() {
    let app = app_with_tenant().await;
    resend_accepts().expect(1).mount(&app.email_server).await;

    let (first, _) = subscribe(&app, TENANT, json!({ "email": "fan@example.com" })).await;
    let (second, body) = subscribe(&app, TENANT, json!({ "email": "FAN@example.com" })).await;

    // Same response either way: the endpoint doesn't reveal who's subscribed.
    assert_eq!((first, second), (StatusCode::OK, StatusCode::OK));
    assert_eq!(body["status"], "subscribed");
    assert_eq!(stored(&app, TENANT).await, ["fan@example.com"]);
    assert_eq!(sent_emails(&app).await.len(), 1);
}

#[actix_web::test]
async fn notification_failure_does_not_fail_the_signup() {
    let app = app_with_tenant().await;
    Mock::given(method("POST"))
        .and(path("/emails"))
        .respond_with(ResponseTemplate::new(500))
        .expect(1)
        .mount(&app.email_server)
        .await;

    let (status, _) = subscribe(&app, TENANT, json!({ "email": "fan@example.com" })).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(stored(&app, TENANT).await, ["fan@example.com"]);
}

#[actix_web::test]
async fn invalid_emails_are_rejected_and_nothing_is_sent() {
    let app = app_with_tenant().await;
    resend_accepts().expect(0).mount(&app.email_server).await;

    for (body, case) in [
        (json!({ "email": "not-an-email" }), "invalid address"),
        (json!({ "email": "" }), "empty"),
        (json!({}), "missing field"),
        (json!({ "email": "fan@example.com", "name": "x" }), "unknown field"),
        (json!({ "email": format!("{}@example.com", "a".repeat(300)) }), "too long"),
    ] {
        let (status, response) = subscribe(&app, TENANT, body).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{case}");
        assert_eq!(response["error"], "bad_request", "{case}");
    }
    assert!(stored(&app, TENANT).await.is_empty());
}

#[actix_web::test]
async fn unknown_tenant_is_404_and_nothing_is_stored() {
    let app = app_with_tenant().await;
    resend_accepts().expect(0).mount(&app.email_server).await;

    let (status, body) = subscribe(&app, "nobody", json!({ "email": "fan@example.com" })).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["error"], "tenant_not_found");
}

#[actix_web::test]
async fn subscribers_are_kept_per_tenant() {
    let app = app_with_tenant().await;
    resend_accepts().mount(&app.email_server).await;
    sqlx::query("INSERT INTO tenants (id) VALUES ('other')").execute(&app.db_pool).await.unwrap();

    subscribe(&app, TENANT, json!({ "email": "fan@example.com" })).await;
    subscribe(&app, "other", json!({ "email": "fan@example.com" })).await;

    assert_eq!(stored(&app, TENANT).await, ["fan@example.com"]);
    assert_eq!(stored(&app, "other").await, ["fan@example.com"]);
}

#[actix_web::test]
async fn signup_allows_cross_origin_posts() {
    let app = app_with_tenant().await;
    let response = reqwest::Client::new()
        .request(reqwest::Method::OPTIONS, format!("{}/api/v1/mailing-list/{TENANT}/subscribers", app.address))
        .header("Origin", "https://acme.test")
        .header("Access-Control-Request-Method", "POST")
        .header("Access-Control-Request-Headers", "content-type")
        .send()
        .await
        .unwrap();
    assert!(response.status().is_success());
    assert_eq!(response.headers()["access-control-allow-origin"], "https://acme.test");
}

#[actix_web::test]
async fn admin_can_list_and_remove_subscribers() {
    let app = app_with_tenant().await;
    resend_accepts().mount(&app.email_server).await;
    subscribe(&app, TENANT, json!({ "email": "one@example.com" })).await;
    subscribe(&app, TENANT, json!({ "email": "two@example.com" })).await;

    let client = reqwest::Client::new();
    let admin = |method: reqwest::Method, path: &str| {
        client
            .request(method, format!("{}/api/v1/admin/tenants/{TENANT}/mailing-list{path}", app.address))
            .bearer_auth(&app.admin_key)
    };

    let list: Value = admin(reqwest::Method::GET, "").send().await.unwrap().json().await.unwrap();
    let emails: Vec<&str> = list.as_array().unwrap().iter().map(|s| s["email"].as_str().unwrap()).collect();
    assert_eq!(emails.len(), 2);
    assert!(emails.contains(&"one@example.com") && emails.contains(&"two@example.com"));
    assert!(list[0]["subscribedAt"].is_string());

    let removed = admin(reqwest::Method::DELETE, "/one@example.com").send().await.unwrap();
    assert_eq!(removed.status(), StatusCode::NO_CONTENT);
    let again = admin(reqwest::Method::DELETE, "/one@example.com").send().await.unwrap();
    assert_eq!(again.status(), StatusCode::NOT_FOUND);
    assert_eq!(stored(&app, TENANT).await, ["two@example.com"]);

    // Without the key: rejected.
    let anonymous = client
        .get(format!("{}/api/v1/admin/tenants/{TENANT}/mailing-list", app.address))
        .send()
        .await
        .unwrap();
    assert_eq!(anonymous.status(), StatusCode::UNAUTHORIZED);
}

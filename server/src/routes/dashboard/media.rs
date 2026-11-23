use actix_web::{web, HttpResponse};
use serde_json::{json, Value};
use sqlx::PgPool;

use super::{site_for, SignedIn};
use crate::content::tenant_exists;
use crate::dashboard::media::{self, MediaStore, StoreError};
use crate::routes::error::ApiError;

/// GET /sites/{site}/media → { images: [{ url, width, height, name?, alternativeText?, usedIn: [title] }] }
///
/// Every image the site can reuse: photos already on artworks and prints (with
/// their names and descriptions), then uploads not used anywhere yet, newest first.
pub async fn list(
    SignedIn(user): SignedIn,
    site: web::Path<String>,
    pool: web::Data<PgPool>,
    store: web::Data<MediaStore>,
) -> Result<HttpResponse, ApiError> {
    let tenant = site_for(&user, &site)?;
    if !tenant_exists(&pool, &tenant).await? {
        return Err(ApiError::TenantNotFound);
    }
    let docs: Vec<(String, Value)> = sqlx::query_as(
        "SELECT doc_type, data FROM documents WHERE tenant_id = $1 AND doc_type IN ('product', 'print') ORDER BY updated_at DESC",
    )
    .bind(tenant.as_ref())
    .fetch_all(pool.get_ref())
    .await?;
    let titles: std::collections::HashMap<String, String> = docs
        .iter()
        .filter(|(t, _)| t == "product")
        .filter_map(|(_, d)| Some((d["slug"].as_str()?.to_string(), d["title"].as_str()?.to_string())))
        .collect();

    let mut images: Vec<Value> = Vec::new();
    let mut seen: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for (doc_type, doc) in &docs {
        let label = if doc_type == "print" {
            let painting = doc["painting"].as_str().and_then(|p| titles.get(p)).map(String::as_str).unwrap_or("Print");
            format!("{painting} – {}", doc["title"].as_str().unwrap_or("print"))
        } else {
            doc["title"].as_str().unwrap_or_default().to_string()
        };
        for image in doc["images"].as_array().into_iter().flatten() {
            let Some(url) = image["url"].as_str() else { continue };
            match seen.get(url) {
                Some(&i) => {
                    if let Some(used) = images[i]["usedIn"].as_array_mut() {
                        if !used.iter().any(|u| u == &label) {
                            used.push(json!(label));
                        }
                    }
                }
                None => {
                    let mut entry = image.clone();
                    entry["usedIn"] = json!([label]);
                    seen.insert(url.to_string(), images.len());
                    images.push(entry);
                }
            }
        }
    }

    let uploads: Vec<(String, String, i32, i32)> = sqlx::query_as(
        "SELECT id, content_type, width, height FROM media WHERE tenant_id = $1 ORDER BY created_at DESC",
    )
    .bind(tenant.as_ref())
    .fetch_all(pool.get_ref())
    .await?;
    for (id, content_type, width, height) in uploads {
        let url = media::url_for(&store, &tenant, &id, &content_type);
        // An upload may be stored under the database or R2 address; match on the file id.
        if images.iter().any(|i| i["url"].as_str().is_some_and(|u| u.contains(&id))) {
            continue;
        }
        images.push(json!({ "url": url, "width": width, "height": height, "usedIn": [] }));
    }
    Ok(HttpResponse::Ok().json(json!({ "images": images })))
}

#[derive(serde::Deserialize)]
pub struct UploadParams {
    /// Original file name, kept for the image's `name` field.
    name: Option<String>,
}

/// POST /sites/{site}/media?name=photo.jpg  body = image bytes
/// → { url, width, height, name } (the shape of an Image in content documents).
#[tracing::instrument(name = "Upload image", skip(user, site, params, body, pool, store), fields(user = %user.username, site = %site, bytes = body.len(), storage = store.describe()))]
pub async fn upload(
    SignedIn(user): SignedIn,
    site: web::Path<String>,
    params: web::Query<UploadParams>,
    body: web::Bytes,
    pool: web::Data<PgPool>,
    store: web::Data<MediaStore>,
) -> Result<HttpResponse, ApiError> {
    let tenant = site_for(&user, &site)?;
    if !tenant_exists(&pool, &tenant).await? {
        return Err(ApiError::TenantNotFound);
    }
    let (kind, width, height) = media::inspect(&body).map_err(ApiError::BadRequest)?;
    let stored = media::store(&store, &pool, &tenant, body.to_vec(), kind, width, height).await.map_err(|e| match e {
        StoreError::QuotaExceeded => ApiError::BadRequest("This site's image storage is full.".into()),
        StoreError::Database(e) => e.into(),
        StoreError::Upload(e) => {
            tracing::error!(error = %e, "Image upload to storage failed");
            ApiError::Internal("The image couldn't be saved. Please try again.".into())
        }
    })?;

    let name: String = params
        .name
        .as_deref()
        .map(|n| n.chars().filter(|c| !c.is_control() && !matches!(c, '/' | '\\' | '<' | '>' | '"')).take(200).collect())
        .filter(|n: &String| !n.trim().is_empty())
        .unwrap_or_else(|| format!("{}.{}", &stored.id[..12], stored.kind_ext));
    tracing::info!(width, height, "Image stored");
    Ok(HttpResponse::Created().json(json!({ "url": stored.url, "width": width, "height": height, "name": name })))
}

//! Artwork (product) documents as edited from the dashboard.
//!
//! The dashboard sends only the fields an artist manages. They're validated here
//! and merged onto the stored document, so fields the dashboard doesn't show
//! (`ogImage`, `shopifyHandle`, ...) are kept as they were.

use serde_json::{json, Map, Value};

pub const MAX_IMAGES: usize = 20;
pub const MAX_TABS: usize = 20;

/// What the dashboard sends for one artwork.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProductInput {
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub category: String,
    #[serde(default)]
    pub material: Option<String>,
    #[serde(default)]
    pub date_created: Option<String>,
    pub images: Vec<ImageInput>,
    #[serde(default)]
    pub tabs: Vec<TabInput>,
    #[serde(default)]
    pub availability: Option<AvailabilityInput>,
    /// The painting's size in inches; used for the original-size print.
    #[serde(default)]
    pub size: Option<SizeInput>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SizeInput {
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImageInput {
    pub url: String,
    pub width: u64,
    pub height: u64,
    #[serde(default)]
    pub alternative_text: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TabInput {
    pub title: String,
    pub body: String,
}

#[derive(Debug, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AvailabilityInput {
    pub status: String,
    #[serde(default)]
    pub price: Option<String>,
    #[serde(default)]
    pub label: Option<String>,
}

/// Validate `input` and merge it onto `existing` (or a new document).
/// `media_base` is this server's public URL; uploaded images live under it.
pub fn build_product(
    slug: &str,
    input: &ProductInput,
    existing: Option<&Value>,
    media_base: &str,
) -> Result<Value, String> {
    let mut doc: Map<String, Value> = existing.and_then(Value::as_object).cloned().unwrap_or_default();

    doc.insert("$type".into(), json!("product"));
    doc.insert("slug".into(), json!(slug));
    doc.insert("title".into(), json!(text("Title", &input.title, 1, 200)?));
    doc.insert("description".into(), json!(text("Description", &input.description, 0, 5_000)?));
    doc.insert("category".into(), json!(category(&input.category)?));
    set_optional(&mut doc, "material", input.material.as_deref().map(|m| text("Material", m, 0, 200)).transpose()?);
    set_optional(
        &mut doc,
        "dateCreated",
        input.date_created.as_deref().map(|d| text("Year", d, 0, 32)).transpose()?,
    );

    match &input.size {
        None => {
            doc.remove("size");
        }
        Some(s) => {
            let ok = |v: f64| v.is_finite() && (1.0..=1000.0).contains(&v);
            if !ok(s.width) || !ok(s.height) {
                return Err("The size must be between 1 and 1000 inches each way.".into());
            }
            let round = |v: f64| (v * 100.0).round() / 100.0;
            doc.insert("size".into(), json!({ "width": round(s.width), "height": round(s.height), "unit": "in" }));
        }
    }

    if input.images.is_empty() {
        return Err("Add at least one image.".into());
    }
    if input.images.len() > MAX_IMAGES {
        return Err(format!("An artwork can have at most {MAX_IMAGES} images."));
    }
    let images = input.images.iter().map(|i| image(i, media_base)).collect::<Result<Vec<_>, _>>()?;
    doc.insert("images".into(), Value::Array(images));

    if input.tabs.len() > MAX_TABS {
        return Err(format!("An artwork can have at most {MAX_TABS} sections."));
    }
    let tabs = input
        .tabs
        .iter()
        .map(|t| Ok(json!({ "title": text("Section title", &t.title, 1, 120)?, "body": text("Section text", &t.body, 0, 50_000)? })))
        .collect::<Result<Vec<_>, String>>()?;
    doc.insert("tabs".into(), Value::Array(tabs));

    match &input.availability {
        None => {
            doc.remove("availability");
        }
        Some(a) => {
            if !matches!(a.status.as_str(), "available" | "sold" | "unavailable") {
                return Err("Availability must be available, sold or unavailable.".into());
            }
            let mut out = Map::new();
            out.insert("status".into(), json!(a.status));
            set_optional(&mut out, "price", a.price.as_deref().map(|p| text("Price", p, 0, 100)).transpose()?);
            set_optional(&mut out, "label", a.label.as_deref().map(|l| text("Label", l, 0, 200)).transpose()?);
            doc.insert("availability".into(), Value::Object(out));
        }
    }

    Ok(Value::Object(doc))
}

/// Trimmed text with a length range (in characters).
pub(crate) fn text(field: &str, value: &str, min: usize, max: usize) -> Result<String, String> {
    let value = value.trim();
    let len = value.chars().count();
    if len < min {
        return Err(format!("{field} is required."));
    }
    if len > max {
        return Err(format!("{field} can be at most {max} characters."));
    }
    Ok(value.to_string())
}

/// Empty optional text removes the field.
fn set_optional(doc: &mut Map<String, Value>, key: &str, value: Option<String>) {
    match value.filter(|v| !v.is_empty()) {
        Some(v) => doc.insert(key.into(), json!(v)),
        None => doc.remove(key),
    };
}

/// Categories drive category collections, so keep them slug-shaped.
fn category(raw: &str) -> Result<String, String> {
    let c = raw.trim().to_lowercase();
    let ok = (1..=64).contains(&c.len())
        && c.chars().next().is_some_and(|ch| ch.is_ascii_alphanumeric())
        && c.chars().all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-');
    if ok { Ok(c) } else { Err("Category must be lowercase letters, numbers and dashes.".into()) }
}

pub(crate) fn image(input: &ImageInput, media_base: &str) -> Result<Value, String> {
    let url = input.url.trim();
    let uploaded = format!("{}/api/v1/media/", media_base.trim_end_matches('/'));
    let allowed_place = (url.starts_with('/') && !url.starts_with("//")) || url.starts_with("https://") || url.starts_with(&uploaded);
    let safe_chars = !url.chars().any(|c| c.is_whitespace() || c.is_control() || matches!(c, '"' | '<' | '>' | '\\'));
    if url.len() > 2048 || !allowed_place || !safe_chars {
        return Err("One of the images has an invalid address.".into());
    }
    if !(1..=100_000).contains(&input.width) || !(1..=100_000).contains(&input.height) {
        return Err("One of the images has invalid dimensions.".into());
    }
    let name = match input.name.as_deref().map(str::trim).filter(|n| !n.is_empty()) {
        Some(n) => text("Image name", n, 1, 200)?,
        None => url.rsplit('/').next().unwrap_or("image").chars().take(200).collect(),
    };
    let mut out = json!({ "url": url, "width": input.width, "height": input.height, "name": name });
    if let Some(alt) = input.alternative_text.as_deref() {
        let alt = text("Image description", alt, 0, 500)?;
        if !alt.is_empty() {
            out["alternativeText"] = json!(alt);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const BASE: &str = "https://api.example.com";

    fn input() -> ProductInput {
        serde_json::from_value(json!({
            "title": "  Girl ",
            "description": "Oil on canvas",
            "category": "oil-on-canvas",
            "material": "",
            "images": [{ "url": "https://api.example.com/api/v1/media/t/abc.jpg", "width": 10, "height": 20, "alternativeText": "Girl" }],
            "tabs": [{ "title": "Details", "body": "**Oil**" }],
            "availability": { "status": "sold" }
        }))
        .unwrap()
    }

    #[test]
    fn builds_a_clean_document() {
        let doc = build_product("girl", &input(), None, BASE).unwrap();
        assert_eq!(doc["$type"], "product");
        assert_eq!(doc["slug"], "girl");
        assert_eq!(doc["title"], "Girl");
        assert!(doc.get("material").is_none(), "empty optional text is dropped");
        assert_eq!(doc["images"][0]["name"], "abc.jpg");
        assert_eq!(doc["availability"], json!({ "status": "sold" }));
    }

    #[test]
    fn keeps_fields_the_dashboard_does_not_manage() {
        let existing = json!({ "$type": "product", "slug": "girl", "shopifyHandle": "girl-print", "ogImage": { "url": "/og.jpg" } });
        let doc = build_product("girl", &input(), Some(&existing), BASE).unwrap();
        assert_eq!(doc["shopifyHandle"], "girl-print");
        assert_eq!(doc["ogImage"]["url"], "/og.jpg");
    }

    #[test]
    fn rejects_bad_input() {
        let mut no_title = input();
        no_title.title = "   ".into();
        let mut no_images = input();
        no_images.images.clear();
        let mut bad_category = input();
        bad_category.category = "Oil Paint!".into();
        let mut bad_status = input();
        bad_status.availability = Some(AvailabilityInput { status: "gone".into(), price: None, label: None });
        for bad in [no_title, no_images, bad_category, bad_status] {
            assert!(build_product("girl", &bad, None, BASE).is_err());
        }
    }

    #[test]
    fn only_accepts_safe_image_addresses() {
        for url in ["javascript:alert(1)", "//evil.example/x.jpg", "http://evil.example/x.jpg", "/a b.jpg", "/x\".jpg"] {
            let mut i = input();
            i.images[0].url = url.into();
            assert!(build_product("girl", &i, None, BASE).is_err(), "{url}");
        }
        for url in ["/art/girl.jpg", "https://cdn.example.com/x.jpg"] {
            let mut i = input();
            i.images[0].url = url.into();
            assert!(build_product("girl", &i, None, BASE).is_ok(), "{url}");
        }
    }
}

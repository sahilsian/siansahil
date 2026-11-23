use serde_json::{json, Value};

/// Optional narrowing applied on top of a collection's own filter.
#[derive(Debug, Default)]
pub struct CollectionQuery<'a> {
    /// Case-insensitive substring match on product title.
    pub search: Option<&'a str>,
}

/// Resolve a collection document against all of a tenant's products and
/// return the matching product summaries (what a listing card needs).
///
/// Collection `filter` shapes:
///   { "type": "all" }
///   { "type": "category", "category": "plein-air" }
///   { "type": "curated", "productSlugs": ["a", "b"] }
/// `sort: "dateCreated:desc"` sorts newest first (missing dates last);
/// otherwise curated collections keep their listed order.
pub fn product_summaries(collection: &Value, products: Vec<Value>, query: &CollectionQuery) -> Vec<Value> {
    let filter = &collection["filter"];
    let filter_type = filter["type"].as_str().unwrap_or("all");

    let mut matched: Vec<Value> = match filter_type {
        "curated" => {
            let slugs: Vec<&str> = filter["productSlugs"]
                .as_array()
                .map(|a| a.iter().filter_map(Value::as_str).collect())
                .unwrap_or_default();
            // Keep the curator's order; skip slugs with no product.
            slugs
                .iter()
                .filter_map(|slug| products.iter().find(|p| p["slug"] == *slug).cloned())
                .collect()
        }
        "category" => {
            let category = filter["category"].as_str().unwrap_or_default();
            products.into_iter().filter(|p| p["category"] == category).collect()
        }
        _ => products,
    };

    if let Some(search) = query.search.map(str::trim).filter(|s| !s.is_empty()) {
        let needle = search.to_lowercase();
        matched.retain(|p| p["title"].as_str().unwrap_or_default().to_lowercase().contains(&needle));
    }

    if collection["sort"] == "dateCreated:desc" {
        // Stable sort, so ties keep the previous order.
        matched.sort_by_key(|p| std::cmp::Reverse(date_rank(p)));
    }

    matched.iter().map(summary).collect()
}

/// Year as a number for sorting; unparseable/missing dates rank lowest.
fn date_rank(product: &Value) -> i64 {
    product["dateCreated"]
        .as_str()
        .and_then(|d| d.trim().parse::<i64>().ok())
        .unwrap_or(i64::MIN)
}

fn summary(product: &Value) -> Value {
    let mut out = json!({
        "slug": product["slug"],
        "title": product["title"],
        "category": product["category"],
        "image": product["images"].get(0).cloned().unwrap_or(Value::Null),
    });
    // availability: { status, price?, label? } for works sold off-platform (no Shopify).
    // store: what is for sale (original/print prices), for "Prints from" on cards.
    for optional in ["dateCreated", "shopifyHandle", "availability", "store"] {
        if let Some(v) = product.get(optional) {
            out[optional] = v.clone();
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn product(slug: &str, title: &str, category: &str, date: Option<&str>) -> Value {
        let mut p = json!({
            "slug": slug, "title": title, "category": category,
            "images": [{ "url": format!("/{slug}.jpg") }]
        });
        if let Some(d) = date {
            p["dateCreated"] = json!(d);
        }
        p
    }

    fn products() -> Vec<Value> {
        vec![
            product("old", "Old Drawing", "drawings", Some("2024")),
            product("undated", "Undated Dog", "drawings", None),
            product("new-a", "Science World", "plein-air", Some("2026")),
            product("new-b", "Mount Pleasant", "plein-air", Some("2026")),
        ]
    }

    fn slugs(summaries: &[Value]) -> Vec<&str> {
        summaries.iter().map(|s| s["slug"].as_str().unwrap()).collect()
    }

    #[test]
    fn all_returns_every_product_newest_first_with_undated_last() {
        let c = json!({ "filter": { "type": "all" }, "sort": "dateCreated:desc" });
        let out = product_summaries(&c, products(), &CollectionQuery::default());
        assert_eq!(slugs(&out), ["new-a", "new-b", "old", "undated"]);
    }

    #[test]
    fn category_filter_matches_only_that_category() {
        let c = json!({ "filter": { "type": "category", "category": "drawings" } });
        let out = product_summaries(&c, products(), &CollectionQuery::default());
        assert_eq!(slugs(&out), ["old", "undated"]);
    }

    #[test]
    fn curated_keeps_listed_order_and_skips_missing_slugs() {
        let c = json!({ "filter": { "type": "curated", "productSlugs": ["old", "nope", "new-b"] } });
        let out = product_summaries(&c, products(), &CollectionQuery::default());
        assert_eq!(slugs(&out), ["old", "new-b"]);
    }

    #[test]
    fn search_is_case_insensitive_on_title() {
        let c = json!({ "filter": { "type": "all" } });
        let out = product_summaries(&c, products(), &CollectionQuery { search: Some("  science ") });
        assert_eq!(slugs(&out), ["new-a"]);
    }

    #[test]
    fn summary_keeps_availability_for_non_shopify_works() {
        let mut p = product("x", "X", "oil", None);
        p["availability"] = json!({ "status": "available", "price": "$850" });
        let c = json!({ "filter": { "type": "all" } });
        let out = product_summaries(&c, vec![p], &CollectionQuery::default());
        assert_eq!(out[0]["availability"]["price"], "$850");
    }

    #[test]
    fn summary_uses_first_image_and_keeps_shopify_handle() {
        let mut p = product("x", "X", "drawings", Some("2025"));
        p["shopifyHandle"] = json!("x-handle");
        p["tabs"] = json!([{ "title": "Story", "body": "long" }]);
        let c = json!({ "filter": { "type": "all" } });
        let out = product_summaries(&c, vec![p], &CollectionQuery::default());
        assert_eq!(out[0]["image"]["url"], "/x.jpg");
        assert_eq!(out[0]["shopifyHandle"], "x-handle");
        assert!(out[0].get("tabs").is_none(), "summaries must not carry full content");
    }
}

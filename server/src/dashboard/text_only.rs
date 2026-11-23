//! "Text only" edits: what a dashboard user may change in a site, page, form or
//! collection document.
//!
//! The new document must have exactly the same shape as the stored one: the same
//! fields, the same list lengths and the same numbers/booleans. Only text values
//! may differ, and not the ones that control layout, links or wiring (block types,
//! link targets, image URLs, form ids, theme colours, ...). So the dashboard can
//! reword anything a visitor reads, but can't restructure the site.
//!
//! The dashboard UI hides the locked fields; this check is what actually enforces it.

use serde_json::Value;

/// Text fields that are wiring, not wording. Locked wherever they appear.
pub const LOCKED_KEYS: &[&str] = &[
    "$type",
    "slug",
    "type",
    "id",
    "url",
    "to",
    "href",
    "formId",
    "defaultCollection",
    "fieldType",
    "variant",
    "imagePosition",
    "locale",
    "currency",
    "robots",
    "category",
    "sort",
    "status",
    "shopifyHandle",
    "subscriptionHandle",
    "printClubHandle",
    "titleTemplate",
];

/// Whole sections that are configuration. Everything inside them is locked.
pub const LOCKED_SECTIONS: &[&str] =
    &["theme", "favicons", "integrations", "filter", "search", "fonts", "views", "store"];

/// Longest text value accepted.
pub const MAX_TEXT_CHARS: usize = 50_000;

/// `Ok(())` when `new` differs from `old` only in unlocked text values.
pub fn check_text_only(old: &Value, new: &Value) -> Result<(), String> {
    walk(old, new, "", false)
}

fn walk(old: &Value, new: &Value, path: &str, locked: bool) -> Result<(), String> {
    match (old, new) {
        (Value::Object(a), Value::Object(b)) => {
            if a.len() != b.len() || a.keys().any(|k| !b.contains_key(k)) {
                return Err(format!("{}: fields can't be added or removed here.", label(path)));
            }
            for (key, a_value) in a {
                let child_locked = locked || LOCKED_KEYS.contains(&key.as_str()) || LOCKED_SECTIONS.contains(&key.as_str());
                walk(a_value, &b[key], &join(path, key), child_locked)?;
            }
            Ok(())
        }
        (Value::Array(a), Value::Array(b)) => {
            if a.len() != b.len() {
                return Err(format!("{}: items can't be added or removed here.", label(path)));
            }
            for (i, (a_item, b_item)) in a.iter().zip(b).enumerate() {
                walk(a_item, b_item, &join(path, &i.to_string()), locked)?;
            }
            Ok(())
        }
        (Value::String(a), Value::String(b)) => {
            if a != b && locked {
                return Err(format!("{} can't be changed here.", label(path)));
            }
            if b.chars().count() > MAX_TEXT_CHARS {
                return Err(format!("{} is too long.", label(path)));
            }
            Ok(())
        }
        (a, b) if a == b => Ok(()),
        _ => Err(format!("{} can't be changed here.", label(path))),
    }
}

fn join(path: &str, key: &str) -> String {
    if path.is_empty() { key.to_string() } else { format!("{path}.{key}") }
}

fn label(path: &str) -> String {
    if path.is_empty() { "The document".into() } else { format!("'{path}'") }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn page() -> Value {
        json!({
            "$type": "page",
            "slug": "home",
            "blocks": [{
                "type": "hero",
                "title": "Hello",
                "primary": { "label": "Gallery", "to": "/products", "search": { "collection": "gallery" } },
                "heroImage": { "url": "/a.jpg", "width": 10, "height": 20, "alternativeText": "A" }
            }],
            "theme": { "colors": { "background": "#fff" } }
        })
    }

    fn edit(f: impl FnOnce(&mut Value)) -> Value {
        let mut v = page();
        f(&mut v);
        v
    }

    #[test]
    fn allows_changing_visible_text() {
        let new = edit(|v| {
            v["blocks"][0]["title"] = json!("Welcome");
            v["blocks"][0]["primary"]["label"] = json!("See the gallery");
            v["blocks"][0]["heroImage"]["alternativeText"] = json!("Painting");
        });
        assert!(check_text_only(&page(), &new).is_ok());
        assert!(check_text_only(&page(), &page()).is_ok());
    }

    #[test]
    fn rejects_wiring_layout_and_configuration_changes() {
        let cases: Vec<Box<dyn Fn(&mut Value)>> = vec![
            Box::new(|v| v["blocks"][0]["type"] = json!("faq")),
            Box::new(|v| v["blocks"][0]["primary"]["to"] = json!("https://evil.example")),
            Box::new(|v| v["blocks"][0]["primary"]["search"]["collection"] = json!("other")),
            Box::new(|v| v["blocks"][0]["heroImage"]["url"] = json!("/b.jpg")),
            Box::new(|v| v["blocks"][0]["heroImage"]["width"] = json!(11)),
            Box::new(|v| v["theme"]["colors"]["background"] = json!("#000")),
            Box::new(|v| v["slug"] = json!("other")),
        ];
        for change in cases {
            let new = edit(|v| change(v));
            assert!(check_text_only(&page(), &new).is_err(), "{new}");
        }
    }

    #[test]
    fn rejects_structural_changes() {
        let added_block = edit(|v| v["blocks"].as_array_mut().unwrap().push(json!({ "type": "richText", "body": "x" })));
        let added_field = edit(|v| v["blocks"][0]["subtitle"] = json!("x"));
        let removed_field = edit(|v| {
            v["blocks"][0].as_object_mut().unwrap().remove("title");
        });
        let text_to_number = edit(|v| v["blocks"][0]["title"] = json!(5));
        for new in [added_block, added_field, removed_field, text_to_number] {
            assert!(check_text_only(&page(), &new).is_err(), "{new}");
        }
    }

    #[test]
    fn rejects_huge_text() {
        let new = edit(|v| v["blocks"][0]["title"] = json!("x".repeat(MAX_TEXT_CHARS + 1)));
        assert!(check_text_only(&page(), &new).is_err());
    }
}

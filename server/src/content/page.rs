use serde_json::Value;

use super::DocType;

/// Documents a page's blocks point at, so the page endpoint can return them
/// alongside the page (one request per page instead of a waterfall).
///   { "type": "form", "formId": "contact" }                → form "contact"
///   { "type": "collection", "defaultCollection": "all" }   → collection "all"
pub fn referenced_documents(page: &Value) -> Vec<(DocType, String)> {
    let mut refs: Vec<(DocType, String)> = Vec::new();
    let blocks = page["blocks"].as_array().map(Vec::as_slice).unwrap_or_default();

    for block in blocks {
        let reference = match block["type"].as_str() {
            Some("form") => block["formId"].as_str().map(|id| (DocType::Form, id)),
            Some("collection") => block["defaultCollection"].as_str().map(|id| (DocType::Collection, id)),
            _ => None,
        };
        if let Some((doc_type, key)) = reference {
            if !refs.iter().any(|(t, k)| *t == doc_type && k == key) {
                refs.push((doc_type, key.to_string()));
            }
        }
    }
    refs
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn finds_form_and_collection_references_once_each() {
        let page = json!({ "blocks": [
            { "type": "form", "formId": "contact" },
            { "type": "richText", "body": "hi" },
            { "type": "collection", "defaultCollection": "gallery" },
            { "type": "form", "formId": "contact" }
        ]});
        assert_eq!(
            referenced_documents(&page),
            vec![(DocType::Form, "contact".to_string()), (DocType::Collection, "gallery".to_string())]
        );
    }

    #[test]
    fn page_without_blocks_has_no_references() {
        assert!(referenced_documents(&json!({})).is_empty());
    }
}

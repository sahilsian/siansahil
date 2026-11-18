/// The kinds of document a tenant has (matches the `documents.doc_type` CHECK).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DocType {
    Site,
    Page,
    Product,
    Collection,
    Form,
}

impl DocType {
    /// Parse the singular type name used in URLs and `$type`.
    pub fn parse(raw: &str) -> Result<Self, String> {
        match raw {
            "site" => Ok(DocType::Site),
            "page" => Ok(DocType::Page),
            "product" => Ok(DocType::Product),
            "collection" => Ok(DocType::Collection),
            "form" => Ok(DocType::Form),
            other => Err(format!("'{other}' is not a document type (site, page, product, collection, form)")),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            DocType::Site => "site",
            DocType::Page => "page",
            DocType::Product => "product",
            DocType::Collection => "collection",
            DocType::Form => "form",
        }
    }

    /// Folder name under `content/tenants/<id>/` (site lives in `site.json`).
    pub fn folder(self) -> Option<&'static str> {
        match self {
            DocType::Site => None,
            DocType::Page => Some("pages"),
            DocType::Product => Some("products"),
            DocType::Collection => Some("collections"),
            DocType::Form => Some("forms"),
        }
    }
}

/// The key of the single site document per tenant.
pub const SITE_KEY: &str = "main";

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;
use sqlx::PgPool;

use super::doc_type::SITE_KEY;
use super::{upsert_document, DocType, DocumentKey, TenantId};

#[derive(Debug)]
pub enum ImportError {
    Io(PathBuf, std::io::Error),
    Json(PathBuf, serde_json::Error),
    Invalid(PathBuf, String),
    Db(sqlx::Error),
}

impl std::fmt::Display for ImportError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ImportError::Io(p, e) => write!(f, "{}: {e}", p.display()),
            ImportError::Json(p, e) => write!(f, "{}: invalid JSON: {e}", p.display()),
            ImportError::Invalid(p, msg) => write!(f, "{}: {msg}", p.display()),
            ImportError::Db(e) => write!(f, "database error: {e}"),
        }
    }
}

impl std::error::Error for ImportError {}

impl From<sqlx::Error> for ImportError {
    fn from(e: sqlx::Error) -> Self {
        ImportError::Db(e)
    }
}

#[derive(Debug)]
pub struct ImportSummary {
    pub tenant_id: String,
    pub documents: usize,
}

/// A tenant folder read from disk and validated, ready to load.
#[derive(Debug)]
pub struct TenantContent {
    pub id: TenantId,
    pub domains: Vec<String>,
    /// (type, key, document), site first.
    pub documents: Vec<(DocType, String, Value)>,
}

/// Read and validate one tenant folder (`content/tenants/<id>/`). Layout:
///   tenant.json            { "id": "...", "domains": [...] }
///   site.json              -> ('site', 'main')
///   pages/<slug>.json      -> ('page', slug)   ... likewise products/collections/forms
/// Each document's `$type` must match its folder, and file names must be valid keys.
pub fn read_tenant_dir(dir: &Path) -> Result<TenantContent, ImportError> {
    let tenant_path = dir.join("tenant.json");
    let tenant = read_json(&tenant_path)?;
    let id = tenant["id"]
        .as_str()
        .ok_or_else(|| ImportError::Invalid(tenant_path.clone(), "missing string `id`".into()))
        .and_then(|raw| TenantId::parse(raw).map_err(|e| ImportError::Invalid(tenant_path.clone(), e)))?;
    let domains: Vec<String> = tenant["domains"]
        .as_array()
        .map(|a| a.iter().filter_map(|d| d.as_str().map(String::from)).collect())
        .unwrap_or_default();

    let mut documents: Vec<(DocType, String, Value)> = Vec::new();
    let site_path = dir.join("site.json");
    documents.push((DocType::Site, SITE_KEY.to_string(), read_typed(&site_path, DocType::Site)?));
    for doc_type in [DocType::Page, DocType::Product, DocType::Collection, DocType::Form, DocType::Print] {
        let folder = dir.join(doc_type.folder().expect("non-site types have a folder"));
        for path in json_files(&folder)? {
            let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or_default();
            let key = DocumentKey::parse(stem)
                .map_err(|e| ImportError::Invalid(path.clone(), e))?
                .as_ref()
                .to_string();
            documents.push((doc_type, key, read_typed(&path, doc_type)?));
        }
    }

    Ok(TenantContent { id, domains, documents })
}

/// Load one tenant folder straight into the database (see `read_tenant_dir`),
/// creating the tenant if needed and upserting every document in one transaction.
pub async fn import_tenant_dir(pool: &PgPool, dir: &Path) -> Result<ImportSummary, ImportError> {
    // Read and validate everything before touching the database.
    let TenantContent { id, domains, documents } = read_tenant_dir(dir)?;

    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO tenants (id, domains) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET domains = EXCLUDED.domains",
    )
    .bind(id.as_ref())
    .bind(&domains)
    .execute(&mut *tx)
    .await?;

    for (doc_type, key, data) in &documents {
        upsert_document(&mut *tx, &id, *doc_type, key, data).await?;
    }
    tx.commit().await?;

    Ok(ImportSummary { tenant_id: id.as_ref().to_string(), documents: documents.len() })
}

/// Tenant folders under `root` (each containing a tenant.json), sorted. If `root`
/// itself is a tenant folder, just that one.
pub fn tenant_dirs(root: &Path) -> Vec<PathBuf> {
    if root.join("tenant.json").exists() {
        return vec![root.to_path_buf()];
    }
    let mut dirs: Vec<PathBuf> = fs::read_dir(root)
        .map(|entries| entries.filter_map(Result::ok).map(|e| e.path()).filter(|p| p.join("tenant.json").exists()).collect())
        .unwrap_or_default();
    dirs.sort();
    dirs
}

fn read_json(path: &Path) -> Result<Value, ImportError> {
    let text = fs::read_to_string(path).map_err(|e| ImportError::Io(path.to_path_buf(), e))?;
    serde_json::from_str(&text).map_err(|e| ImportError::Json(path.to_path_buf(), e))
}

fn read_typed(path: &Path, expected: DocType) -> Result<Value, ImportError> {
    let doc = read_json(path)?;
    match doc["$type"].as_str() {
        Some(t) if t == expected.as_str() => Ok(doc),
        other => Err(ImportError::Invalid(
            path.to_path_buf(),
            format!("expected \"$type\": \"{}\", found {:?}", expected.as_str(), other),
        )),
    }
}

/// `*.json` files in a folder, sorted; a missing folder means none.
fn json_files(folder: &Path) -> Result<Vec<PathBuf>, ImportError> {
    if !folder.exists() {
        return Ok(Vec::new());
    }
    let mut files: Vec<PathBuf> = fs::read_dir(folder)
        .map_err(|e| ImportError::Io(folder.to_path_buf(), e))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|p| p.extension().is_some_and(|ext| ext == "json"))
        .collect();
    files.sort();
    Ok(files)
}

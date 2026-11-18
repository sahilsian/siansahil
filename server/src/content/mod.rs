//! Tenant website content: typed access to the JSON documents in `documents`.

mod collection;
mod doc_type;
mod document_key;
mod import;
mod page;
mod store;
mod tenant_id;
mod tenants;

pub use collection::{product_summaries, CollectionQuery};
pub use doc_type::{DocType, SITE_KEY};
pub use document_key::DocumentKey;
pub use import::{import_tenant_dir, read_tenant_dir, tenant_dirs, ImportError, ImportSummary, TenantContent};
pub use page::referenced_documents;
pub use store::{
    delete_document, get_document, get_document_meta, list_document_meta, list_documents, tenant_exists,
    upsert_document, DocumentLookup, DocumentMeta, UpsertOutcome,
};
pub use tenant_id::TenantId;
pub use tenants::{
    create_tenant, delete_tenant, get_tenant, list_tenants, parse_domains, update_tenant_domains, TenantRecord,
};

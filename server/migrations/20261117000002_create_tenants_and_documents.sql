-- One row per website head.
CREATE TABLE tenants (
    id TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
    domains TEXT[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Every piece of website content, as JSON, keyed by (tenant, type, key).
-- e.g. ('siansahil', 'page', 'about'), ('siansahil', 'site', 'main').
CREATE TABLE documents (
    tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    doc_type TEXT NOT NULL CHECK (doc_type IN ('site', 'page', 'product', 'collection', 'form')),
    key TEXT NOT NULL,
    data JSONB NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, doc_type, key)
);

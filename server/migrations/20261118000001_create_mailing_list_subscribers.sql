-- Per-tenant mailing list. Replaces the tenant-less `subscriptions` table
-- from the original newsletter tutorial endpoint (never used by a head).
CREATE TABLE mailing_list_subscribers (
    tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    -- Stored trimmed + lowercased, so one address subscribes once per tenant.
    email TEXT NOT NULL CHECK (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254),
    subscribed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, email)
);

DROP TABLE subscriptions;

-- Print sales, recorded from Stripe's checkout.session.completed webhook.
CREATE TABLE print_orders (
    id UUID PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    -- One row per Stripe checkout, however many times Stripe delivers the event.
    stripe_session_id TEXT NOT NULL UNIQUE,
    -- The print document's key; NULL if the sale couldn't be matched to a print.
    print_slug TEXT,
    -- What was bought, as named at the time (the print may change or be deleted later).
    print_name TEXT NOT NULL,
    amount_total_cents BIGINT NOT NULL,
    shipping_cents BIGINT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL,
    customer_name TEXT,
    customer_email TEXT,
    customer_phone TEXT,
    -- { name, line1, line2, city, state, postal_code, country }
    shipping_address JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    shipped_at TIMESTAMPTZ
);

CREATE INDEX print_orders_by_tenant ON print_orders (tenant_id, created_at DESC);
CREATE INDEX print_orders_by_print ON print_orders (tenant_id, print_slug);

-- Dashboard accounts. A superadmin manages every tenant; an editor belongs to
-- exactly one tenant and can only edit that tenant's text and artwork.
CREATE TABLE dashboard_users (
    id uuid PRIMARY KEY,
    -- Stored lowercased; used to sign in.
    username TEXT NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9][a-z0-9_.-]{2,31}$'),
    email TEXT NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254),
    -- Argon2id PHC string.
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('superadmin', 'editor')),
    tenant_id TEXT REFERENCES tenants (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((role = 'superadmin') = (tenant_id IS NULL))
);

-- Single-use invitations. Only a SHA-256 of the emailed token is stored, so a
-- database leak doesn't hand out working invite links.
CREATE TABLE dashboard_invites (
    id uuid PRIMARY KEY,
    token_hash BYTEA NOT NULL UNIQUE,
    email TEXT NOT NULL CHECK (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254),
    role TEXT NOT NULL CHECK (role IN ('superadmin', 'editor')),
    tenant_id TEXT REFERENCES tenants (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    accepted_at timestamptz,
    CHECK ((role = 'superadmin') = (tenant_id IS NULL))
);

-- Signed-in sessions. Like invites, only a hash of the cookie value is stored.
CREATE TABLE dashboard_sessions (
    token_hash BYTEA PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES dashboard_users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dashboard_sessions_user_id ON dashboard_sessions (user_id);

-- Images uploaded from the dashboard (artwork photos). Content-addressed:
-- `id` is the SHA-256 of the bytes, so the same upload is stored once.
CREATE TABLE media (
    tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    id TEXT NOT NULL CHECK (id ~ '^[0-9a-f]{64}$'),
    content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
    width INTEGER NOT NULL CHECK (width > 0),
    height INTEGER NOT NULL CHECK (height > 0),
    bytes BYTEA NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id)
);

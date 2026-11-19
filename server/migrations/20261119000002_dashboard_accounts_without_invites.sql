-- Accounts are now created directly by a superadmin (username + password),
-- so invites go away and an email address is optional.
DROP TABLE dashboard_invites;
ALTER TABLE dashboard_users ALTER COLUMN email DROP NOT NULL;

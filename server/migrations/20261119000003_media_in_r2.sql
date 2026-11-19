-- Uploads can now live in Cloudflare R2. Every upload keeps a row here (for the
-- per-site storage limit); only uploads kept in the database have `bytes`.
ALTER TABLE media ALTER COLUMN bytes DROP NOT NULL;
ALTER TABLE media ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 0 CHECK (size_bytes >= 0);
UPDATE media SET size_bytes = length(bytes);
ALTER TABLE media ADD COLUMN storage TEXT NOT NULL DEFAULT 'database' CHECK (storage IN ('database', 'r2'));
ALTER TABLE media ADD CHECK (storage <> 'database' OR bytes IS NOT NULL);

-- 003_oauth.sql
-- Allow OAuth (Google/GitHub) users: no local password, track provider.

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider     VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id  VARCHAR(120);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url   TEXT;

CREATE INDEX IF NOT EXISTS idx_users_provider ON users (provider, provider_id);

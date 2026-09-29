-- 002_users.sql
-- Users + email verification for the auth layer.

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    name          VARCHAR(120),
    password_hash TEXT NOT NULL,
    is_verified   BOOLEAN NOT NULL DEFAULT FALSE,
    verify_token  TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_verify_token ON users (verify_token);

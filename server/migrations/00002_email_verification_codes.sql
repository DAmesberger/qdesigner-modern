-- Email verification codes (6-digit code sent to user's email)
CREATE TABLE IF NOT EXISTS email_verification_codes (
    email       TEXT PRIMARY KEY,
    code        TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

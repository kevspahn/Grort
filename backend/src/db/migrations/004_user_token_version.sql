-- Token versioning for JWT revocation.
-- Every issued token carries the user's token_version; bumping it (e.g. on a
-- password change) invalidates all previously issued tokens immediately.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

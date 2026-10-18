-- M3 IMG-01..08 DB-05; M5 deletion outbox.
CREATE TABLE receipt_images (
 id uuid PRIMARY KEY, receipt_id uuid NOT NULL UNIQUE REFERENCES receipts(id) ON DELETE CASCADE,
 owner_user_id uuid NOT NULL REFERENCES users(id), sha256 text NOT NULL CHECK(length(sha256)=64),
 original_key text NOT NULL, display_key text NOT NULL, mime text NOT NULL CHECK(mime IN ('image/png','image/jpeg')),
 byte_count integer NOT NULL CHECK(byte_count BETWEEN 1 AND 10485760), width integer NOT NULL CHECK(width>0), height integer NOT NULL CHECK(height>0),
 UNIQUE(owner_user_id,sha256)
);
CREATE TABLE processing_attempts (
 id uuid PRIMARY KEY,receipt_id uuid NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,input_version integer NOT NULL,
 state text NOT NULL CHECK(state IN ('processing','succeeded','failed')), started_at timestamptz NOT NULL DEFAULT now(),deadline timestamptz NOT NULL, ended_at timestamptz,
 result jsonb, error_code text
);
CREATE UNIQUE INDEX active_receipt_attempt ON processing_attempts(receipt_id) WHERE state='processing';
CREATE INDEX attempt_deadline ON processing_attempts(deadline) WHERE state='processing';
CREATE TABLE storage_deletions (
 id uuid PRIMARY KEY,owner_user_id uuid NOT NULL REFERENCES users(id),state text NOT NULL CHECK(state IN ('pending','complete','failed')),
 keys jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),retry_count integer NOT NULL DEFAULT 0
);
CREATE INDEX pending_deletions ON storage_deletions(updated_at) WHERE state<>'complete';

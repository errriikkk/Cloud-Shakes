-- Add note scope to support team/workspace notes.
ALTER TABLE "Note"
ADD COLUMN IF NOT EXISTS "scope" TEXT NOT NULL DEFAULT 'private';

CREATE INDEX IF NOT EXISTS "Note_scope_updatedAt_idx" ON "Note" ("scope", "updatedAt");


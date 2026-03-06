-- Add documentId and customSlug to Link table
ALTER TABLE "Link" ADD COLUMN IF NOT EXISTS "documentId" TEXT;
ALTER TABLE "Link" ADD COLUMN IF NOT EXISTS "customSlug" TEXT;

-- Update type to support "document"
-- Note: This is a data migration, the constraint will be handled by application logic

-- Add foreign key for documentId
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Link_documentId_fkey') THEN
        ALTER TABLE "Link" ADD CONSTRAINT "Link_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Add unique constraint for customSlug
CREATE UNIQUE INDEX IF NOT EXISTS "Link_customSlug_key" ON "Link"("customSlug") WHERE "customSlug" IS NOT NULL;



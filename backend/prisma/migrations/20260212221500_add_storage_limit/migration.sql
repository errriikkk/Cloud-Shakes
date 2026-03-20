-- AlterTable
ALTER TABLE "User" ADD COLUMN     "displayName" TEXT NOT NULL DEFAULT 'User';
ALTER TABLE "User" ADD COLUMN     "storageLimit" BIGINT NOT NULL DEFAULT 53687091200;

-- AlterTable: Change File.size from integer to bigint
ALTER TABLE "File" ALTER COLUMN "size" SET DATA TYPE BIGINT;

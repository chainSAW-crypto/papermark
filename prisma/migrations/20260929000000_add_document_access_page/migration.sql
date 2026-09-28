-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "accessDescription" TEXT,
ADD COLUMN     "accessImages" TEXT[] DEFAULT ARRAY[]::TEXT[];


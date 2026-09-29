-- CreateTable
CREATE TABLE "DataroomSession" (
    "tokenHash" TEXT NOT NULL,
    "dataroomId" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "viewId" TEXT NOT NULL,
    "viewerId" TEXT,
    "ipAddress" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataroomSession_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE INDEX "DataroomSession_expiresAt_idx" ON "DataroomSession"("expiresAt");

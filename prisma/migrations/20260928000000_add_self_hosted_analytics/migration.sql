-- CreateTable
CREATE TABLE "AnalyticsPageView" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "viewId" TEXT NOT NULL,
    "dataroomId" TEXT,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "pageNumber" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "country" TEXT NOT NULL DEFAULT 'Unknown',
    "city" TEXT NOT NULL DEFAULT 'Unknown',
    "region" TEXT NOT NULL DEFAULT 'Unknown',
    "ua" TEXT NOT NULL DEFAULT 'Unknown',
    "browser" TEXT NOT NULL DEFAULT 'Unknown',
    "browserVersion" TEXT NOT NULL DEFAULT 'Unknown',
    "os" TEXT NOT NULL DEFAULT 'Unknown',
    "osVersion" TEXT NOT NULL DEFAULT 'Unknown',
    "device" TEXT NOT NULL DEFAULT 'Desktop',
    "referer" TEXT NOT NULL DEFAULT '(direct)',
    "refererUrl" TEXT NOT NULL DEFAULT '(direct)',

    CONSTRAINT "AnalyticsPageView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsVideoEvent" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "linkId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "viewId" TEXT NOT NULL,
    "dataroomId" TEXT,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "eventType" TEXT NOT NULL,
    "startTime" INTEGER NOT NULL,
    "endTime" INTEGER NOT NULL,
    "playbackRate" INTEGER NOT NULL,
    "volume" INTEGER NOT NULL,
    "isMuted" INTEGER NOT NULL DEFAULT 0,
    "isFocused" INTEGER NOT NULL DEFAULT 0,
    "isFullscreen" INTEGER NOT NULL DEFAULT 0,
    "country" TEXT NOT NULL DEFAULT 'Unknown',
    "city" TEXT NOT NULL DEFAULT 'Unknown',
    "browser" TEXT NOT NULL DEFAULT 'Unknown',
    "os" TEXT NOT NULL DEFAULT 'Unknown',
    "device" TEXT NOT NULL DEFAULT 'Desktop',
    "referer" TEXT NOT NULL DEFAULT '(direct)',
    "refererUrl" TEXT NOT NULL DEFAULT '(direct)',
    "ipAddress" TEXT,

    CONSTRAINT "AnalyticsVideoEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsClickEvent" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "sessionId" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "viewId" TEXT NOT NULL,
    "dataroomId" TEXT,
    "pageNumber" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "href" TEXT NOT NULL,

    CONSTRAINT "AnalyticsClickEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsLinkView" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "viewId" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "documentId" TEXT,
    "dataroomId" TEXT,
    "continent" TEXT NOT NULL DEFAULT 'Unknown',
    "country" TEXT NOT NULL DEFAULT 'Unknown',
    "region" TEXT NOT NULL DEFAULT 'Unknown',
    "city" TEXT NOT NULL DEFAULT 'Unknown',
    "device" TEXT NOT NULL DEFAULT 'Desktop',
    "browser" TEXT NOT NULL DEFAULT 'Unknown',
    "browserVersion" TEXT NOT NULL DEFAULT 'Unknown',
    "os" TEXT NOT NULL DEFAULT 'Unknown',
    "osVersion" TEXT NOT NULL DEFAULT 'Unknown',
    "ua" TEXT NOT NULL DEFAULT 'Unknown',
    "referer" TEXT NOT NULL DEFAULT '(direct)',
    "refererUrl" TEXT NOT NULL DEFAULT '(direct)',
    "ipAddress" TEXT,

    CONSTRAINT "AnalyticsLinkView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsWebhookEvent" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventId" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "httpStatus" INTEGER NOT NULL,
    "requestBody" TEXT NOT NULL,
    "responseBody" TEXT NOT NULL,

    CONSTRAINT "AnalyticsWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsPageView_documentId_viewId_idx" ON "AnalyticsPageView"("documentId", "viewId");

-- CreateIndex
CREATE INDEX "AnalyticsPageView_viewId_idx" ON "AnalyticsPageView"("viewId");

-- CreateIndex
CREATE INDEX "AnalyticsPageView_linkId_idx" ON "AnalyticsPageView"("linkId");

-- CreateIndex
CREATE INDEX "AnalyticsPageView_dataroomId_idx" ON "AnalyticsPageView"("dataroomId");

-- CreateIndex
CREATE INDEX "AnalyticsVideoEvent_documentId_timestamp_idx" ON "AnalyticsVideoEvent"("documentId", "timestamp");

-- CreateIndex
CREATE INDEX "AnalyticsVideoEvent_viewId_idx" ON "AnalyticsVideoEvent"("viewId");

-- CreateIndex
CREATE INDEX "AnalyticsClickEvent_documentId_viewId_idx" ON "AnalyticsClickEvent"("documentId", "viewId");

-- CreateIndex
CREATE INDEX "AnalyticsLinkView_viewId_idx" ON "AnalyticsLinkView"("viewId");

-- CreateIndex
CREATE INDEX "AnalyticsLinkView_linkId_idx" ON "AnalyticsLinkView"("linkId");

-- CreateIndex
CREATE INDEX "AnalyticsWebhookEvent_webhookId_timestamp_idx" ON "AnalyticsWebhookEvent"("webhookId", "timestamp" DESC);


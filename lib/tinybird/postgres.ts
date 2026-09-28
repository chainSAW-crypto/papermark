// Postgres implementations of the Tinybird pipes (pipes.ts) and ingest
// endpoints (publish.ts), used when TINYBIRD_TOKEN is not set. Each query
// mirrors the SQL of the matching lib/tinybird/endpoints/*.pipe file.
import { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";

import { VIDEO_EVENT_TYPES } from "../constants";
import { WEBHOOK_TRIGGERS } from "../webhook/constants";

type VideoEventType = (typeof VIDEO_EVENT_TYPES)[number];
type WebhookTrigger = (typeof WEBHOOK_TRIGGERS)[number];

const splitIds = (ids: string) => ids.split(",").filter(Boolean);

const timeRange = (since: number, until?: number) => ({
  gte: new Date(since),
  ...(until !== undefined && { lte: new Date(until) }),
});

// For raw SQL: Prisma stores DateTime as UTC in `timestamp` (no tz) columns,
// but binds JS Dates in $queryRaw as timestamptz, which Postgres shifts by the
// session TimeZone before comparing. An ISO string cast to ::timestamp drops
// the "Z" and compares as plain UTC regardless of server settings.
const utcTimestamp = (ms: number) => new Date(ms).toISOString();

// Aggregates without GROUP BY always return a single row in ClickHouse, so
// callers read `data[0]` unconditionally. Keep that contract.
const sumOrZero = (sum: number | null | undefined) => sum ?? 0;

// Numeric page order ("2" before "10"); Tinybird sorts lexicographically but
// every consumer expects page order.
const byPageNumber = (a: { pageNumber: string }, b: { pageNumber: string }) =>
  Number(a.pageNumber) - Number(b.pageNumber) ||
  a.pageNumber.localeCompare(b.pageNumber);

// ---------------------------------------------------------------------------
// Pipes
// ---------------------------------------------------------------------------

export async function getTotalAvgPageDuration(params: {
  documentId: string;
  excludedLinkIds: string;
  excludedViewIds: string;
  since: number;
}) {
  const rows = await prisma.$queryRaw<
    { versionNumber: number; pageNumber: string; avg_duration: number }[]
  >`
    SELECT "versionNumber", "pageNumber", AVG(view_duration)::float8 AS avg_duration
    FROM (
      SELECT "versionNumber", "pageNumber", "viewId", SUM("duration") AS view_duration
      FROM "AnalyticsPageView"
      WHERE "documentId" = ${params.documentId}
        AND "time" >= ${utcTimestamp(params.since)}::timestamp
        AND NOT ("linkId" = ANY(${splitIds(params.excludedLinkIds)}::text[]))
        AND NOT ("viewId" = ANY(${splitIds(params.excludedViewIds)}::text[]))
      GROUP BY "versionNumber", "pageNumber", "viewId"
    ) per_view
    GROUP BY "versionNumber", "pageNumber"
  `;

  return rows.sort(
    (a, b) => a.versionNumber - b.versionNumber || byPageNumber(a, b),
  );
}

export async function getViewPageDuration(params: {
  documentId: string;
  viewId: string;
  since: number;
  until?: number;
}) {
  const rows = await prisma.analyticsPageView.groupBy({
    by: ["pageNumber"],
    where: {
      documentId: params.documentId,
      viewId: params.viewId,
      time: timeRange(params.since, params.until),
    },
    _sum: { duration: true },
  });

  return rows
    .map((row) => ({
      pageNumber: row.pageNumber,
      sum_duration: sumOrZero(row._sum.duration),
    }))
    .sort(byPageNumber);
}

export async function getTotalDocumentDuration(params: {
  documentId: string;
  excludedLinkIds: string;
  excludedViewIds: string;
  since: number;
  until?: number;
}) {
  const result = await prisma.analyticsPageView.aggregate({
    where: {
      documentId: params.documentId,
      time: timeRange(params.since, params.until),
      linkId: { notIn: splitIds(params.excludedLinkIds) },
      viewId: { notIn: splitIds(params.excludedViewIds) },
    },
    _sum: { duration: true },
  });

  return [{ sum_duration: sumOrZero(result._sum.duration) }];
}

export async function getTotalLinkDuration(params: {
  linkId: string;
  documentId: string;
  excludedViewIds: string;
  since: number;
  until?: number;
}) {
  const until =
    params.until !== undefined
      ? Prisma.sql`AND "time" <= ${utcTimestamp(params.until)}::timestamp`
      : Prisma.empty;

  const [row] = await prisma.$queryRaw<
    { sum_duration: number; view_count: number }[]
  >`
    SELECT COALESCE(SUM("duration"), 0)::float8 AS sum_duration,
           COUNT(DISTINCT "viewId")::int AS view_count
    FROM "AnalyticsPageView"
    WHERE "linkId" = ${params.linkId}
      AND "documentId" = ${params.documentId}
      AND "time" >= ${utcTimestamp(params.since)}::timestamp
      ${until}
      AND NOT ("viewId" = ANY(${splitIds(params.excludedViewIds)}::text[]))
  `;

  return [row ?? { sum_duration: 0, view_count: 0 }];
}

export async function getTotalViewerDuration(params: {
  viewIds: string;
  since: number;
  until?: number;
}) {
  const result = await prisma.analyticsPageView.aggregate({
    where: {
      viewId: { in: splitIds(params.viewIds) },
      time: timeRange(params.since, params.until),
    },
    _sum: { duration: true },
  });

  return [{ sum_duration: sumOrZero(result._sum.duration) }];
}

const userAgentSelect = {
  country: true,
  city: true,
  browser: true,
  os: true,
  device: true,
} as const;

export async function getViewUserAgent_v2(params: {
  documentId: string;
  viewId: string;
  since: number;
}) {
  const row = await prisma.analyticsPageView.findFirst({
    where: {
      documentId: params.documentId,
      viewId: params.viewId,
      time: { gte: new Date(params.since) },
    },
    select: userAgentSelect,
  });

  return row ? [row] : [];
}

export async function getViewUserAgent(params: { viewId: string }) {
  const row = await prisma.analyticsLinkView.findFirst({
    where: { viewId: params.viewId },
    select: userAgentSelect,
  });

  return row ? [row] : [];
}

export async function getTotalDataroomDuration(params: {
  dataroomId: string;
  excludedLinkIds: string[];
  excludedViewIds: string[];
  since: number;
}) {
  const rows = await prisma.analyticsPageView.groupBy({
    by: ["viewId"],
    where: {
      dataroomId: params.dataroomId,
      time: { gte: new Date(params.since) },
      linkId: { notIn: params.excludedLinkIds },
      viewId: { notIn: params.excludedViewIds },
    },
    _sum: { duration: true },
  });

  return rows.map((row) => ({
    viewId: row.viewId,
    sum_duration: sumOrZero(row._sum.duration),
  }));
}

export async function getDocumentDurationPerViewer(params: {
  documentId: string;
  viewIds: string;
}) {
  const result = await prisma.analyticsPageView.aggregate({
    where: {
      documentId: params.documentId,
      viewId: { in: splitIds(params.viewIds) },
    },
    _sum: { duration: true },
  });

  return [{ sum_duration: sumOrZero(result._sum.duration) }];
}

export async function getWebhookEvents(params: { webhookId: string }) {
  const rows = await prisma.analyticsWebhookEvent.findMany({
    where: { webhookId: params.webhookId },
    orderBy: { timestamp: "desc" },
    take: 100,
  });

  return rows.map((row) => ({
    event_id: row.eventId,
    webhook_id: row.webhookId,
    message_id: row.messageId,
    event: row.event as WebhookTrigger,
    url: row.url,
    http_status: row.httpStatus,
    request_body: row.requestBody,
    response_body: row.responseBody,
    timestamp: row.timestamp.toISOString(),
  }));
}

export async function getVideoEventsByDocument(params: {
  document_id: string;
}) {
  const rows = await prisma.analyticsVideoEvent.findMany({
    where: { documentId: params.document_id },
    orderBy: { timestamp: "asc" },
  });

  return rows.map((row) => ({
    timestamp: row.timestamp.toISOString(),
    view_id: row.viewId,
    event_type: row.eventType as VideoEventType,
    start_time: row.startTime,
    end_time: row.endTime,
    playback_rate: row.playbackRate,
    volume: row.volume,
    is_muted: row.isMuted,
    is_focused: row.isFocused,
    is_fullscreen: row.isFullscreen,
  }));
}

export async function getVideoEventsByView(params: {
  document_id: string;
  view_id: string;
}) {
  const rows = await prisma.analyticsVideoEvent.findMany({
    where: { documentId: params.document_id, viewId: params.view_id },
    orderBy: { timestamp: "asc" },
    select: {
      timestamp: true,
      eventType: true,
      startTime: true,
      endTime: true,
    },
  });

  return rows.map((row) => ({
    timestamp: row.timestamp.toISOString(),
    event_type: row.eventType,
    start_time: row.startTime,
    end_time: row.endTime,
  }));
}

export async function getClickEventsByView(params: {
  document_id: string;
  view_id: string;
}) {
  const rows = await prisma.analyticsClickEvent.findMany({
    where: { documentId: params.document_id, viewId: params.view_id },
    orderBy: { timestamp: "asc" },
  });

  return rows.map((row) => ({
    timestamp: row.timestamp.toISOString(),
    document_id: row.documentId,
    dataroom_id: row.dataroomId,
    view_id: row.viewId,
    page_number: row.pageNumber,
    version_number: row.versionNumber,
    href: row.href,
  }));
}

// ---------------------------------------------------------------------------
// Ingest endpoints
// ---------------------------------------------------------------------------

type CommonUserAgentFields = {
  country: string;
  city: string;
  ua: string;
  browser: string;
  browser_version: string;
  os: string;
  os_version: string;
  device: string;
  referer: string;
  referer_url: string;
};

export async function insertPageViews(
  events: (CommonUserAgentFields & {
    id: string;
    linkId: string;
    documentId: string;
    viewId: string;
    dataroomId?: string | null;
    versionNumber: number;
    time: number;
    duration: number;
    pageNumber: string;
    region: string;
  })[],
) {
  await prisma.analyticsPageView.createMany({
    data: events.map((event) => ({
      id: event.id,
      linkId: event.linkId,
      documentId: event.documentId,
      viewId: event.viewId,
      dataroomId: event.dataroomId ?? null,
      versionNumber: event.versionNumber,
      pageNumber: event.pageNumber,
      duration: event.duration,
      time: new Date(event.time),
      country: event.country,
      city: event.city,
      region: event.region,
      ua: event.ua,
      browser: event.browser,
      browserVersion: event.browser_version,
      os: event.os,
      osVersion: event.os_version,
      device: event.device,
      referer: event.referer,
      refererUrl: event.referer_url,
    })),
    skipDuplicates: true,
  });
}

export async function insertVideoViews(
  events: (CommonUserAgentFields & {
    timestamp: string;
    id: string;
    link_id: string;
    document_id: string;
    view_id: string;
    dataroom_id: string | null;
    version_number: number;
    event_type: string;
    start_time: number;
    end_time?: number;
    playback_rate: number;
    volume: number;
    is_muted: number;
    is_focused: number;
    is_fullscreen: number;
    ip_address: string | null;
  })[],
) {
  await prisma.analyticsVideoEvent.createMany({
    data: events.map((event) => ({
      id: event.id,
      timestamp: new Date(event.timestamp),
      linkId: event.link_id,
      documentId: event.document_id,
      viewId: event.view_id,
      dataroomId: event.dataroom_id,
      versionNumber: event.version_number,
      eventType: event.event_type,
      startTime: Math.round(event.start_time),
      endTime: Math.round(event.end_time ?? event.start_time),
      playbackRate: Math.round(event.playback_rate),
      volume: Math.round(event.volume),
      isMuted: event.is_muted,
      isFocused: event.is_focused,
      isFullscreen: event.is_fullscreen,
      country: event.country,
      city: event.city,
      browser: event.browser,
      os: event.os,
      device: event.device,
      referer: event.referer,
      refererUrl: event.referer_url,
      ipAddress: event.ip_address,
    })),
    skipDuplicates: true,
  });
}

export async function insertClickEvents(
  events: {
    timestamp: string;
    event_id: string;
    session_id: string;
    link_id: string;
    document_id: string;
    view_id: string;
    page_number: string;
    href: string;
    version_number: number;
    dataroom_id: string | null;
  }[],
) {
  await prisma.analyticsClickEvent.createMany({
    data: events.map((event) => ({
      id: event.event_id,
      timestamp: new Date(event.timestamp),
      sessionId: event.session_id,
      linkId: event.link_id,
      documentId: event.document_id,
      viewId: event.view_id,
      dataroomId: event.dataroom_id,
      pageNumber: event.page_number,
      versionNumber: event.version_number,
      href: event.href,
    })),
    skipDuplicates: true,
  });
}

export async function insertLinkViews(
  events: (CommonUserAgentFields & {
    timestamp: string;
    click_id: string;
    view_id: string;
    link_id: string;
    document_id: string | null;
    dataroom_id: string | null;
    continent: string;
    region: string;
    ip_address: string | null;
  })[],
) {
  await prisma.analyticsLinkView.createMany({
    data: events.map((event) => ({
      id: event.click_id,
      timestamp: new Date(event.timestamp),
      viewId: event.view_id,
      linkId: event.link_id,
      documentId: event.document_id,
      dataroomId: event.dataroom_id,
      continent: event.continent || "Unknown",
      country: event.country,
      region: event.region,
      city: event.city,
      device: event.device,
      browser: event.browser,
      browserVersion: event.browser_version,
      os: event.os,
      osVersion: event.os_version,
      ua: event.ua,
      referer: event.referer,
      refererUrl: event.referer_url,
      ipAddress: event.ip_address,
    })),
    skipDuplicates: true,
  });
}

export async function insertWebhookEvents(
  events: {
    event_id: string;
    webhook_id: string;
    message_id: string;
    event: string;
    url: string;
    http_status: number;
    request_body: string;
    response_body: string;
  }[],
) {
  await prisma.analyticsWebhookEvent.createMany({
    data: events.map((event) => ({
      eventId: event.event_id,
      webhookId: event.webhook_id,
      messageId: event.message_id,
      event: event.event,
      url: event.url,
      httpStatus: event.http_status,
      requestBody: event.request_body,
      responseBody: event.response_body,
    })),
  });
}

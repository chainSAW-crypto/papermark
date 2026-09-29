// Bookkeeping for PDF page rendering done inside this server (the self-hosted
// replacement for the Trigger.dev job). Kept on globalThis so every API route
// bundle in the process sees the same state.

type PdfRenderRegistry = {
  // document version ids queued or rendering right now
  active: Set<string>;
  // document version ids with a resume request on its way to the renderer
  requesting: Set<string>;
  // document version id -> time the last attempt failed
  failedAt: Map<string, number>;
  // jobs run one at a time so a large PDF can't exhaust the server
  queue: Promise<void>;
};

const globalForPdfRender = globalThis as typeof globalThis & {
  __papermarkPdfRender?: PdfRenderRegistry;
};

export const pdfRenderRegistry: PdfRenderRegistry =
  globalForPdfRender.__papermarkPdfRender ??
  (globalForPdfRender.__papermarkPdfRender = {
    active: new Set(),
    requesting: new Set(),
    failedAt: new Map(),
    queue: Promise.resolve(),
  });

// Don't retry a version whose last attempt failed more recently than this
const PDF_RENDER_RETRY_AFTER_MS = 10 * 60 * 1000;

type PdfRenderPayload = {
  documentId: string;
  documentVersionId: string;
  teamId: string;
  versionNumber?: number;
};

/**
 * Asks this server to render a PDF version's pages (handled by
 * /api/mupdf/process-document, which owns the mupdf dependency). Returns once
 * the job is queued; rendering continues in the background.
 */
export async function requestPdfRendering(payload: PdfRenderPayload) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL}/api/mupdf/process-document`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.INTERNAL_API_KEY}`,
      },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Could not queue PDF rendering (HTTP ${response.status}): ${await response.text()}`,
    );
  }
}

/**
 * Restarts rendering for a PDF version that still has no pages and no job
 * working on it (e.g. the server restarted mid-way). Pages rendered before
 * are kept, so it continues where it stopped.
 */
export function resumeStalledPdfRendering(
  payload: PdfRenderPayload,
  versionCreatedAt: Date,
) {
  const { documentVersionId } = payload;
  const failedAt = pdfRenderRegistry.failedAt.get(documentVersionId);
  const stalled =
    !pdfRenderRegistry.active.has(documentVersionId) &&
    !pdfRenderRegistry.requesting.has(documentVersionId) &&
    !(failedAt && Date.now() - failedAt < PDF_RENDER_RETRY_AFTER_MS) &&
    // give a freshly uploaded version's own job time to get going
    Date.now() - new Date(versionCreatedAt).getTime() > 60 * 1000;
  if (!stalled) return;

  // polling requests must not send it again while this request is in flight
  pdfRenderRegistry.requesting.add(documentVersionId);
  requestPdfRendering(payload)
    .catch((error) => {
      pdfRenderRegistry.failedAt.set(documentVersionId, Date.now());
      console.error(
        `[pdf-to-image ${documentVersionId}] could not resume:`,
        (error as Error).message,
      );
    })
    .finally(() => pdfRenderRegistry.requesting.delete(documentVersionId));
}

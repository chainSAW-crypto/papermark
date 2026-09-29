import { NextApiRequest, NextApiResponse } from "next";

import * as mupdf from "mupdf";
import { z } from "zod";

import { pdfRenderRegistry } from "@/lib/documents/pdf-render-registry";
import {
  DocumentProcessingBlockedError,
  renderPdfPage,
} from "@/lib/documents/render-pdf-page";
import { getFile } from "@/lib/files/get-file";
import prisma from "@/lib/prisma";

const payloadSchema = z.object({
  documentId: z.string(),
  documentVersionId: z.string(),
  teamId: z.string(),
  versionNumber: z.number().int().optional(),
});

type Payload = z.infer<typeof payloadSchema>;

// POST /api/mupdf/process-document (internal)
// Renders every page of a PDF version inside this server, for self-hosted
// installs where the Trigger.dev job can't run. The PDF is downloaded and
// opened once, pages that already exist are skipped (so an interrupted job
// resumes), and jobs run one at a time. Responds immediately; the rendering
// continues in the background.
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const token = req.headers.authorization?.split(" ")[1];
  if (token !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const parsed = payloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload" });
  }
  const payload = parsed.data;
  const { documentVersionId } = payload;

  if (pdfRenderRegistry.active.has(documentVersionId)) {
    return res.status(202).json({ status: "already-running" });
  }

  pdfRenderRegistry.active.add(documentVersionId);
  pdfRenderRegistry.failedAt.delete(documentVersionId);

  const job = pdfRenderRegistry.queue.then(() => renderDocument(payload));
  // keep the queue going whatever this job does
  pdfRenderRegistry.queue = job.then(
    () => {},
    () => {},
  );
  job
    .catch((error) => {
      pdfRenderRegistry.failedAt.set(documentVersionId, Date.now());
      console.error(
        `[pdf-to-image ${documentVersionId}] failed:`,
        error instanceof Error ? error.message : error,
      );
    })
    .finally(() => pdfRenderRegistry.active.delete(documentVersionId));

  return res.status(202).json({ status: "queued" });
}

async function renderDocument({
  documentId,
  documentVersionId,
  teamId,
  versionNumber,
}: Payload) {
  const prefix = `[pdf-to-image ${documentVersionId}]`;

  const version = await prisma.documentVersion.findUnique({
    where: { id: documentVersionId },
    select: { file: true, storageType: true, hasPages: true },
  });
  if (!version) {
    console.error(prefix, "document version not found");
    return;
  }
  if (version.hasPages) return;

  // Download and open the PDF once for all pages
  const url = await getFile({
    type: version.storageType,
    data: version.file,
  });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download the PDF (HTTP ${response.status})`);
  }
  const doc = new mupdf.PDFDocument(await response.arrayBuffer());

  try {
    const numPages = doc.countPages();
    if (numPages < 1) {
      throw new Error("The PDF has no pages");
    }

    const rendered = await prisma.documentPage.findMany({
      where: { versionId: documentVersionId },
      select: { pageNumber: true },
    });
    const done = new Set(rendered.map((page) => page.pageNumber));
    console.log(
      prefix,
      `rendering ${numPages - done.size} of ${numPages} pages in-process`,
    );

    // page images are stored next to the PDF (teamId/doc_xxx/...)
    const docId = version.file.match(/(doc_[^\/]+)\//)?.[1];

    for (let pageNumber = 1; pageNumber <= numPages; pageNumber++) {
      if (done.has(pageNumber)) continue;
      try {
        await renderPdfPage({
          doc,
          pageNumber,
          documentVersionId,
          teamId,
          docId,
        });
      } catch (error) {
        if (error instanceof DocumentProcessingBlockedError) throw error;
        throw new Error(
          `page ${pageNumber}: ${error instanceof Error ? error.message : error}`,
        );
      }
      if (pageNumber % 25 === 0 || pageNumber === numPages) {
        console.log(prefix, `${pageNumber} / ${numPages} pages`);
      }
    }

    await prisma.documentVersion.update({
      where: { id: documentVersionId },
      data: { numPages, hasPages: true, isPrimary: true },
    });

    if (versionNumber) {
      // a new version replaces the others once its pages are ready
      await prisma.documentVersion.updateMany({
        where: { documentId, versionNumber: { not: versionNumber } },
        data: { isPrimary: false },
      });
    }

    // refresh the cached view pages of this document's links
    await fetch(
      `${process.env.NEXTAUTH_URL}/api/revalidate?secret=${process.env.REVALIDATE_TOKEN}&documentId=${documentId}`,
    ).catch(() => {});

    console.log(prefix, "processing complete");
  } finally {
    doc.destroy(); // free memory
  }
}

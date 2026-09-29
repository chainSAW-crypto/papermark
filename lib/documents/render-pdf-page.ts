import { DocumentPage, Prisma } from "@prisma/client";
import { get } from "@vercel/edge-config";
import { waitUntil } from "@vercel/functions";
import * as mupdf from "mupdf";

import { putFileServer } from "@/lib/files/put-file-server";
import prisma from "@/lib/prisma";
import { log } from "@/lib/utils";

// Only import this from pages/api/mupdf/*: those are the routes that ship the
// mupdf .wasm file (see outputFileTracingIncludes in next.config.mjs).

export class DocumentProcessingBlockedError extends Error {
  constructor(
    public matchedUrl: string,
    public matchedKeyword: string,
    public pageNumber: number,
  ) {
    super("Document processing blocked");
  }
}

// Calculate optimal scale factor based on document dimensions and memory constraints
const getOptimalScaleFactor = (width: number, height: number): number => {
  // Maximum reasonable pixel dimensions to prevent memory issues
  const MAX_PIXEL_DIMENSION = 8000;
  const MAX_TOTAL_PIXELS = 32_000_000; // ~32MP to stay within memory limits

  // Start with default scaling logic
  // Note: Avoid scale factor 3 exactly due to mupdf 1.26.4 rendering bug with tiling patterns
  let scaleFactor = width >= 1600 ? 2 : 2.95;

  // Check if scaled dimensions would exceed limits
  const scaledWidth = width * scaleFactor;
  const scaledHeight = height * scaleFactor;
  const totalPixels = scaledWidth * scaledHeight;

  // Reduce scale factor if dimensions are too large
  if (
    scaledWidth > MAX_PIXEL_DIMENSION ||
    scaledHeight > MAX_PIXEL_DIMENSION ||
    totalPixels > MAX_TOTAL_PIXELS
  ) {
    // Calculate maximum safe scale factor
    const maxScaleByWidth = MAX_PIXEL_DIMENSION / width;
    const maxScaleByHeight = MAX_PIXEL_DIMENSION / height;
    const maxScaleByTotal = Math.sqrt(MAX_TOTAL_PIXELS / (width * height));

    scaleFactor = Math.min(maxScaleByWidth, maxScaleByHeight, maxScaleByTotal);

    // Ensure minimum scale factor of 1
    scaleFactor = Math.max(1, Math.floor(scaleFactor * 10) / 10); // Round down to 1 decimal

    console.log(
      `Large document detected. Reduced scale factor from ${width >= 1600 ? 2 : 2.95} to ${scaleFactor}`,
    );
  }

  return scaleFactor;
};

/**
 * Renders one page of an already opened PDF to an image, uploads it and
 * records it as a DocumentPage. Returns the existing record if that page was
 * rendered before.
 */
export async function renderPdfPage({
  doc,
  pageNumber,
  documentVersionId,
  teamId,
  docId,
}: {
  doc: mupdf.PDFDocument;
  pageNumber: number;
  documentVersionId: string;
  teamId: string;
  docId?: string;
}): Promise<DocumentPage> {
  const page = doc.loadPage(pageNumber - 1); // 0-based page index
  let scaledPixmap: mupdf.Pixmap | undefined;

  try {
    // get the bounds of the page for orientation and scaling
    const bounds = page.getBounds();
    const [ulx, uly, lrx, lry] = bounds;
    const widthInPoints = Math.abs(lrx - ulx);
    const heightInPoints = Math.abs(lry - uly);

    // Validate document dimensions
    if (widthInPoints <= 0 || heightInPoints <= 0) {
      throw new Error(
        `Invalid page dimensions: ${widthInPoints} × ${heightInPoints} points`,
      );
    }

    if (pageNumber === 1) {
      // get the orientation of the document and update document version
      const isVertical = heightInPoints > widthInPoints;

      await prisma.documentVersion.update({
        where: { id: documentVersionId },
        data: { isVertical },
      });
    }

    const scaleFactor = getOptimalScaleFactor(widthInPoints, heightInPoints);
    const doc_to_screen = mupdf.Matrix.scale(scaleFactor, scaleFactor);

    // get links
    const links = page.getLinks();
    const embeddedLinks = links.map((link) => {
      return { href: link.getURI(), coords: link.getBounds().join(",") };
    });

    // Check embedded links for blocked keywords
    if (embeddedLinks.length > 0) {
      let keywords: unknown;
      try {
        keywords = await get("keywords");
      } catch (error) {
        // Log error but continue processing if check fails
        console.log("Failed to check keywords:", error);
      }
      if (Array.isArray(keywords) && keywords.length > 0) {
        for (const link of embeddedLinks) {
          if (!link.href) continue;
          const matchedKeyword = keywords.find(
            (keyword): keyword is string =>
              typeof keyword === "string" && link.href.includes(keyword),
          );
          if (matchedKeyword) {
            waitUntil(
              log({
                message: `Document processing blocked: ${matchedKeyword} \n\n \`Metadata: {teamId: ${teamId}, documentVersionId: ${documentVersionId}, pageNumber: ${pageNumber}}\``,
                type: "error",
                mention: true,
              }),
            );
            throw new DocumentProcessingBlockedError(
              link.href,
              matchedKeyword,
              pageNumber,
            );
          }
        }
      }
    }

    // Will be updated if we use a reduced scale factor
    let actualScaleFactor = scaleFactor;

    const metadata = {
      originalWidth: widthInPoints,
      originalHeight: heightInPoints,
      width: widthInPoints * actualScaleFactor,
      height: heightInPoints * actualScaleFactor,
      scaleFactor: actualScaleFactor,
    };

    // Estimate memory usage before creating pixmap
    const finalWidth = Math.floor(widthInPoints * scaleFactor);
    const finalHeight = Math.floor(heightInPoints * scaleFactor);
    const estimatedMemoryMB = (finalWidth * finalHeight * 3) / (1024 * 1024); // RGB = 3 bytes per pixel

    // Warn if memory usage is high
    if (estimatedMemoryMB > 200) {
      console.warn(
        `High memory usage expected: ${estimatedMemoryMB.toFixed(1)}MB. Consider reducing document size.`,
      );
    }

    try {
      scaledPixmap = page.toPixmap(
        doc_to_screen,
        mupdf.ColorSpace.DeviceRGB,
        false,
        true,
      );
    } catch (error) {
      // If pixmap creation fails, try with a smaller scale factor
      console.error(
        "Pixmap creation failed, attempting with reduced scale factor:",
        error,
      );
      const reducedScaleFactor = Math.max(1, scaleFactor * 0.5);

      const reduced_doc_to_screen = mupdf.Matrix.scale(
        reducedScaleFactor,
        reducedScaleFactor,
      );
      scaledPixmap = page.toPixmap(
        reduced_doc_to_screen,
        mupdf.ColorSpace.DeviceRGB,
        false,
        true,
      );

      // Update metadata with actual scale factor used
      actualScaleFactor = reducedScaleFactor;
      metadata.width = widthInPoints * actualScaleFactor;
      metadata.height = heightInPoints * actualScaleFactor;
      metadata.scaleFactor = actualScaleFactor;
    }

    // Keep whichever encoding is smaller
    const pngBuffer = scaledPixmap.asPNG();
    const jpegBuffer = scaledPixmap.asJPEG(80, false);
    const [chosenBuffer, chosenFormat] =
      pngBuffer.byteLength < jpegBuffer.byteLength
        ? [pngBuffer, "png"]
        : [jpegBuffer, "jpeg"];

    const { type, data } = await putFileServer({
      file: {
        name: `page-${pageNumber}.${chosenFormat}`,
        type: `image/${chosenFormat}`,
        buffer: Buffer.from(chosenBuffer),
      },
      teamId: teamId,
      docId: docId,
    });

    if (!data || !type) {
      throw new Error(`Failed to upload document page ${pageNumber}`);
    }

    const where = {
      pageNumber_versionId: {
        pageNumber: pageNumber,
        versionId: documentVersionId,
      },
    };

    // Check if a documentPage with the same pageNumber and versionId already exists
    const existingPage = await prisma.documentPage.findUnique({ where });
    if (existingPage) return existingPage;

    try {
      return await prisma.documentPage.create({
        data: {
          versionId: documentVersionId,
          pageNumber: pageNumber,
          file: data,
          storageType: type,
          pageLinks: embeddedLinks,
          metadata: metadata,
        },
      });
    } catch (error) {
      // Another job created the same page in the meantime
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const page = await prisma.documentPage.findUnique({ where });
        if (page) return page;
      }
      throw error;
    }
  } finally {
    scaledPixmap?.destroy(); // free memory
    page.destroy(); // free memory
  }
}

import { getFile } from "@/lib/files/get-file";
import prisma from "@/lib/prisma";

export type ConvertPdfToImagePayload = {
  documentId: string;
  documentVersionId: string;
  teamId: string;
  versionNumber?: number;
};

type ConversionHooks = {
  log: (
    level: "info" | "error",
    message: string,
    data?: Record<string, unknown>,
  ) => void;
  status: (status: { progress: number; text: string }) => void;
};

/**
 * Renders every page of a PDF version to an image (through the app's
 * /api/mupdf endpoints, one request per page) and marks the version as having
 * pages. Runs inside the Trigger.dev task; without Trigger.dev the app renders
 * pages itself via /api/mupdf/process-document.
 */
export async function convertPdfToImages(
  payload: ConvertPdfToImagePayload,
  { log, status }: ConversionHooks,
) {
  const { documentVersionId, teamId, documentId, versionNumber } = payload;

  status({ progress: 0, text: "Initializing..." });

  // 1. get file url from document version
  const documentVersion = await prisma.documentVersion.findUnique({
    where: {
      id: documentVersionId,
    },
    select: {
      file: true,
      storageType: true,
      numPages: true,
    },
  });

  // if documentVersion is null, log error and return
  if (!documentVersion) {
    log("error", "File not found", { payload });
    status({ progress: 0, text: "Document not found" });
    return;
  }

  log("info", "Document version", { documentVersion });
  status({ progress: 10, text: "Retrieving file..." });

  // 2. get signed url from file
  const signedUrl = await getFile({
    type: documentVersion.storageType,
    data: documentVersion.file,
  });

  log("info", "Retrieved signed url", { signedUrl });

  if (!signedUrl) {
    log("error", "Failed to get signed url", { payload });
    status({ progress: 0, text: "Failed to retrieve document" });
    return;
  }

  let numPages = documentVersion.numPages;

  // skip if the numPages are already defined
  if (!numPages || numPages === 1) {
    // 3. send file to api/convert endpoint in a task and get back number of pages
    log("info", "Sending file to api/get-pages endpoint");

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/mupdf/get-pages`,
      {
        method: "POST",
        body: JSON.stringify({ url: signedUrl }),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.INTERNAL_API_KEY}`,
        },
      },
    );

    if (!response.ok) {
      log("error", "Failed to get number of pages", {
        signedUrl,
        status: response.status,
      });
      throw new Error("Failed to get number of pages");
    }

    const { numPages: numPagesResult } = (await response.json()) as {
      numPages: number;
    };

    log("info", "Received number of pages", { numPagesResult });

    if (numPagesResult < 1) {
      log("error", "Failed to get number of pages", { payload });
      status({ progress: 0, text: "Failed to get number of pages" });
      return;
    }

    numPages = numPagesResult;
  }

  status({ progress: 20, text: "Converting document..." });

  // 4. iterate through pages and upload to blob in a task
  let currentPage = 0;
  let conversionWithoutError = true;
  for (var i = 0; i < numPages; ++i) {
    if (!conversionWithoutError) {
      break;
    }

    // increment currentPage
    currentPage = i + 1;
    log("info", `Converting page ${currentPage}`, {
      currentPage,
      numPages,
    });

    try {
      // send page number to api/convert-page endpoint in a task and get back page img url
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_URL}/api/mupdf/convert-page`,
        {
          method: "POST",
          body: JSON.stringify({
            documentVersionId: documentVersionId,
            pageNumber: currentPage,
            url: signedUrl,
            teamId: teamId,
          }),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.INTERNAL_API_KEY}`,
          },
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // If document was blocked, stop processing entirely
        if (response.status === 400 && errorData.error?.includes("blocked")) {
          log("error", "Document blocked", {
            pageNumber: currentPage,
            matchedUrl: errorData.matchedUrl,
            matchedKeyword: errorData.matchedKeyword,
            payload,
          });

          status({
            progress: 0,
            text: `Document couldn't be processed`,
          });

          throw new Error("Document processing blocked");
        }

        throw new Error("Failed to convert page");
      }

      const { documentPageId } = (await response.json()) as {
        documentPageId: string;
      };

      log("info", `Created document page for page ${currentPage}:`, {
        documentPageId,
        payload,
      });
    } catch (error: unknown) {
      conversionWithoutError = false;
      if (error instanceof Error) {
        log("error", "Failed to convert page", {
          error: error.message,
        });
      }
    }

    status({
      progress: (currentPage / numPages) * 100,
      text: `${currentPage} / ${numPages} pages processed`,
    });
  }

  if (!conversionWithoutError) {
    log("error", "Failed to process pages", { payload });
    status({
      progress: (currentPage / numPages) * 100,
      text: `Error processing page ${currentPage} of ${numPages}`,
    });
    return;
  }

  // 5. after all pages are uploaded, update document version to hasPages = true
  await prisma.documentVersion.update({
    where: {
      id: documentVersionId,
    },
    data: {
      numPages: numPages,
      hasPages: true,
      isPrimary: true,
    },
    select: {
      id: true,
      hasPages: true,
      isPrimary: true,
    },
  });

  log("info", "Enabling pages");
  status({
    progress: 90,
    text: "Enabling pages...",
  });

  if (versionNumber) {
    // after all pages are uploaded, update all other versions to be not primary
    await prisma.documentVersion.updateMany({
      where: {
        documentId: documentId,
        versionNumber: {
          not: versionNumber,
        },
      },
      data: {
        isPrimary: false,
      },
    });
  }

  log("info", "Revalidating link");
  status({
    progress: 95,
    text: "Revalidating link...",
  });

  // initialize link revalidation for all the document's links
  await fetch(
    `${process.env.NEXTAUTH_URL}/api/revalidate?secret=${process.env.REVALIDATE_TOKEN}&documentId=${documentId}`,
  );

  status({
    progress: 100,
    text: "Processing complete",
  });

  log("info", "Processing complete");
  return {
    success: true,
    message: "Successfully converted PDF to images",
    totalPages: numPages,
  };
}

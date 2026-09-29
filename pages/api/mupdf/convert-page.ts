import { NextApiRequest, NextApiResponse } from "next";

import * as mupdf from "mupdf";

import {
  DocumentProcessingBlockedError,
  renderPdfPage,
} from "@/lib/documents/render-pdf-page";
import { log } from "@/lib/utils";

// This function can run for a maximum of 120 seconds
export const config = {
  maxDuration: 180,
};

// Renders a single page (used by the Trigger.dev job, one request per page).
// The in-server path renders all pages from one download: see process-document.ts
export default async (req: NextApiRequest, res: NextApiResponse) => {
  // check if post method
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  // Extract the API Key from the Authorization header
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1]; // Assuming the format is "Bearer [token]"

  // Check if the API Key matches
  if (token !== process.env.INTERNAL_API_KEY) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const { documentVersionId, pageNumber, url, teamId } = req.body as {
    documentVersionId: string;
    pageNumber: number;
    url: string;
    teamId: string;
  };

  let doc: mupdf.PDFDocument | undefined;
  try {
    // Fetch the PDF data
    let response: Response;
    try {
      response = await fetch(url);
    } catch (error) {
      log({
        message: `Failed to fetch PDF in conversion process with error: \n\n Error: ${error} \n\n \`Metadata: {teamId: ${teamId}, documentVersionId: ${documentVersionId}, pageNumber: ${pageNumber}}\``,
        type: "error",
        mention: true,
      });
      throw new Error(`Failed to fetch pdf on document page ${pageNumber}`);
    }

    // Convert the response to a buffer
    const pdfData = await response.arrayBuffer();
    // Create a MuPDF instance
    doc = new mupdf.PDFDocument(pdfData);
    console.log("Original document size:", pdfData.byteLength);

    // get docId from url with starts with "doc_" with regex
    const match = url.match(/(doc_[^\/]+)\//);
    const docId = match ? match[1] : undefined;

    const documentPage = await renderPdfPage({
      doc,
      pageNumber,
      documentVersionId,
      teamId,
      docId,
    });

    // Send the images as a response
    res.status(200).json({ documentPageId: documentPage.id });
    return;
  } catch (error) {
    if (error instanceof DocumentProcessingBlockedError) {
      res.status(400).json({
        error: "Document processing blocked",
        matchedUrl: error.matchedUrl,
        matchedKeyword: error.matchedKeyword,
        pageNumber: error.pageNumber,
      });
      return;
    }
    log({
      message: `Failed to convert page with error: \n\n Error: ${error} \n\n \`Metadata: {teamId: ${teamId}, documentVersionId: ${documentVersionId}, pageNumber: ${pageNumber}}\``,
      type: "error",
      mention: true,
    });
    throw error;
  } finally {
    doc?.destroy(); // free memory
  }
};

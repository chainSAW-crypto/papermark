import { convertPdfToImageRoute } from "@/lib/trigger/pdf-to-image-route";
import { conversionQueue, tryTrigger } from "@/lib/utils/trigger-utils";

import { ConvertPdfToImagePayload } from "./convert-pdf-to-images";
import { requestPdfRendering } from "./pdf-render-registry";

/**
 * Starts rendering a PDF version's pages: on Trigger.dev when it accepts the
 * job, otherwise in this server so the document still finishes processing.
 */
export async function queuePdfConversion(
  payload: ConvertPdfToImagePayload,
  teamPlan: string,
) {
  const { teamId, documentId, documentVersionId } = payload;
  const result = await tryTrigger("pdf page rendering", () =>
    convertPdfToImageRoute.trigger(payload, {
      idempotencyKey: `${teamId}-${documentVersionId}`,
      tags: [
        `team_${teamId}`,
        `document_${documentId}`,
        `version:${documentVersionId}`,
      ],
      queue: conversionQueue(teamPlan),
      concurrencyKey: teamId,
    }),
  );
  if (result.queued) return;

  console.log(
    `[pdf-to-image ${documentVersionId}] rendering pages in-process instead`,
  );
  try {
    await requestPdfRendering(payload);
  } catch (error) {
    // Never fail the upload over this: opening the document page retries it
    // (resumeStalledPdfRendering), and visitors get the plain PDF meanwhile
    console.error(
      `[pdf-to-image ${documentVersionId}]`,
      (error as Error).message,
    );
  }
}

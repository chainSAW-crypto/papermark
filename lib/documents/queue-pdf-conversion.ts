import { convertPdfToImageRoute } from "@/lib/trigger/pdf-to-image-route";
import { conversionQueue, tryTrigger } from "@/lib/utils/trigger-utils";

import {
  ConvertPdfToImagePayload,
  runPdfConversionInBackground,
} from "./convert-pdf-to-images";

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

  if (!result.queued) {
    console.log(
      `[pdf-to-image ${documentVersionId}] rendering pages in-process instead`,
    );
    runPdfConversionInBackground(payload);
  }
}

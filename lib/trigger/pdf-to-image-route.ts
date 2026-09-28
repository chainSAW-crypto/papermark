import { logger, task } from "@trigger.dev/sdk/v3";

import {
  ConvertPdfToImagePayload,
  convertPdfToImages,
} from "@/lib/documents/convert-pdf-to-images";
import { updateStatus } from "@/lib/utils/generate-trigger-status";

export const convertPdfToImageRoute = task({
  id: "convert-pdf-to-image-route",
  run: async (payload: ConvertPdfToImagePayload) =>
    convertPdfToImages(payload, {
      log: (level, message, data) => logger[level](message, data),
      status: updateStatus,
    }),
});

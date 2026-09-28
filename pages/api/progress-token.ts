import { NextApiRequest, NextApiResponse } from "next";

import { generateTriggerPublicAccessToken } from "@/lib/utils/generate-trigger-auth-token";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { documentVersionId } = req.query;

  if (!documentVersionId || typeof documentVersionId !== "string") {
    return res.status(400).json({ error: "Document version ID is required" });
  }

  try {
    const publicAccessToken = await generateTriggerPublicAccessToken(
      `version:${documentVersionId}`,
    );
    return res.status(200).json({ publicAccessToken });
  } catch (error) {
    // Trigger.dev not configured or unreachable: the client falls back to
    // polling the document instead of live progress
    console.error("Error generating token:", (error as Error).message);
    return res
      .status(503)
      .json({ error: "Live processing progress is unavailable" });
  }
}

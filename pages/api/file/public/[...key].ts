import type { NextApiRequest, NextApiResponse } from "next";

import { GetObjectCommand } from "@aws-sdk/client-s3";

import { getStorageConfig } from "@/ee/features/storage/config";
import { getS3Client } from "@/lib/files/aws-client";
import {
  PUBLIC_IMAGE_PATH_REGEX,
  PUBLIC_IMAGE_PREFIX,
} from "@/lib/files/public-image";

// GET /api/file/public/<type>/<id>.<ext>
// Serves images uploaded via /api/file/s3/image-upload. Unauthenticated on
// purpose: favicons, OG images and logos are fetched by viewers and link
// preview crawlers. Only keys under PUBLIC_IMAGE_PREFIX are reachable.
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).end("Method Not Allowed");
  }

  const segments = Array.isArray(req.query.key)
    ? req.query.key
    : [req.query.key ?? ""];
  const path = segments.join("/");

  if (!PUBLIC_IMAGE_PATH_REGEX.test(path)) {
    return res.status(404).end("Not Found");
  }

  try {
    const object = await getS3Client().send(
      new GetObjectCommand({
        Bucket: getStorageConfig().bucket,
        Key: `${PUBLIC_IMAGE_PREFIX}/${path}`,
      }),
    );

    if (!object.Body) {
      return res.status(404).end("Not Found");
    }

    const bytes = await object.Body.transformToByteArray();

    res.setHeader("Content-Type", object.ContentType || "application/octet-stream");
    res.setHeader("Content-Length", bytes.length);
    // Keys are random and never overwritten
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    // SVGs are served from the app origin: never let them run scripts
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
    );

    if (req.method === "HEAD") {
      return res.status(200).end();
    }
    return res.status(200).send(Buffer.from(bytes));
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === "NoSuchKey" || name === "NotFound") {
      return res.status(404).end("Not Found");
    }
    console.error("Public image fetch failed:", error);
    return res.status(500).end("Internal Server Error");
  }
}

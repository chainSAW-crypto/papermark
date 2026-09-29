import type { NextApiRequest, NextApiResponse } from "next";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getServerSession } from "next-auth/next";
import crypto from "node:crypto";

import { getStorageConfig } from "@/ee/features/storage/config";
import { getS3Client } from "@/lib/files/aws-client";
import {
  PUBLIC_IMAGE_EXTENSIONS,
  PUBLIC_IMAGE_PREFIX,
  PUBLIC_IMAGE_UPLOAD_CONFIG,
  type PublicImageUploadType,
} from "@/lib/files/public-image";

import { authOptions } from "../../auth/[...nextauth]";

// The raw image bytes are the request body; the Content-Type header carries
// the image's MIME type.
export const config = {
  api: {
    bodyParser: false,
  },
};

class PayloadTooLargeError extends Error {}

const readBody = async (req: NextApiRequest, maxBytes: number) => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new PayloadTooLargeError();
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

// POST /api/file/s3/image-upload?type= "profile" | "assets"
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const type = Array.isArray(req.query.type)
    ? req.query.type[0]
    : req.query.type;

  if (!type || !(type in PUBLIC_IMAGE_UPLOAD_CONFIG)) {
    return res.status(400).json({ error: "Invalid upload type specified." });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { allowedContentTypes, maximumSizeInBytes } =
    PUBLIC_IMAGE_UPLOAD_CONFIG[type as PublicImageUploadType];

  const contentType = (req.headers["content-type"] || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (!(allowedContentTypes as readonly string[]).includes(contentType)) {
    return res.status(400).json({
      error: `Unsupported image type "${contentType || "unknown"}". Allowed: ${allowedContentTypes.join(", ")}`,
    });
  }

  let body: Buffer;
  try {
    body = await readBody(req, maximumSizeInBytes);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return res.status(413).json({
        error: `Image is too large (max ${maximumSizeInBytes / 1024 / 1024}MB)`,
      });
    }
    throw error;
  }

  if (body.length === 0) {
    return res.status(400).json({ error: "Empty image" });
  }

  try {
    const path = `${type}/${crypto.randomBytes(16).toString("hex")}.${PUBLIC_IMAGE_EXTENSIONS[contentType]}`;
    const storageConfig = getStorageConfig();

    await getS3Client().send(
      new PutObjectCommand({
        Bucket: storageConfig.bucket,
        Key: `${PUBLIC_IMAGE_PREFIX}/${path}`,
        Body: body,
        ContentType: contentType,
      }),
    );

    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/$/, "");
    return res.status(200).json({ url: `${baseUrl}/api/file/public/${path}` });
  } catch (error) {
    console.error("Public image upload failed:", error);
    return res.status(500).json({ error: "Failed to store image" });
  }
}

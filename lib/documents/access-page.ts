import { DocumentStorageType } from "@prisma/client";
import { createHash } from "crypto";

import { getFile } from "@/lib/files/get-file";

// A document can show a short note and a few images on the access (email)
// screen of its links, so visitors know what they are about to open.
export {
  ACCESS_PAGE_MAX_DESCRIPTION,
  ACCESS_PAGE_MAX_IMAGES,
} from "./access-page-constants";

const IMAGE_EXTENSIONS = /\.(png|jpe?g)$/i;

/**
 * Opaque, stable id for an access image. Visitors only ever see this id,
 * never the storage key, and it changes when the image is replaced (so it
 * doubles as a cache buster).
 */
export function getAccessImageId(key: string) {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

/**
 * Whether `key` may be stored as an access image for `teamId`: an S3 key
 * inside the team's own folder, or a Vercel Blob URL when that transport is
 * used.
 */
export function isAllowedAccessImage(key: string, teamId: string) {
  if (key.startsWith("https://")) {
    try {
      return new URL(key).hostname.endsWith(".public.blob.vercel-storage.com");
    } catch {
      return false;
    }
  }
  return (
    key.startsWith(`${teamId}/`) &&
    !key.includes("..") &&
    IMAGE_EXTENSIONS.test(key)
  );
}

/** Short-lived URL the browser can load the image from. */
export async function getAccessImageUrl(key: string) {
  return getFile({
    type: key.startsWith("https://")
      ? DocumentStorageType.VERCEL_BLOB
      : DocumentStorageType.S3_PATH,
    data: key,
  });
}

// Public images (link OG images and favicons, branding logos and banners,
// avatars) for self-hosted instances on S3/MinIO, where Vercel Blob is not
// available. They are stored under PUBLIC_IMAGE_PREFIX in the upload bucket
// and served by /api/file/public/[...key], since the bucket itself is private.

export const PUBLIC_IMAGE_PREFIX = "public-images";

export const PUBLIC_IMAGE_UPLOAD_CONFIG = {
  profile: {
    allowedContentTypes: ["image/png", "image/jpeg", "image/jpg"],
    maximumSizeInBytes: 2 * 1024 * 1024, // 2MB
  },
  assets: {
    allowedContentTypes: [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/svg+xml",
      "image/x-icon",
      "image/ico",
      "image/vnd.microsoft.icon",
    ],
    maximumSizeInBytes: 5 * 1024 * 1024, // 5MB
  },
} as const;

export type PublicImageUploadType = keyof typeof PUBLIC_IMAGE_UPLOAD_CONFIG;

export const PUBLIC_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/ico": "ico",
  "image/vnd.microsoft.icon": "ico",
};

// <type>/<random id>.<ext>, relative to PUBLIC_IMAGE_PREFIX
export const PUBLIC_IMAGE_PATH_REGEX =
  /^(profile|assets)\/[A-Za-z0-9_-]{16,64}\.(png|jpg|svg|ico)$/;

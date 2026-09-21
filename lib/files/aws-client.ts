import {
  type StorageConfig,
  getStorageConfig,
  getTeamStorageConfigById,
} from "@/ee/features/storage/config";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { S3Client } from "@aws-sdk/client-s3";

// forcePathStyle is set whenever a custom endpoint is configured: S3-compatible
// backends (MinIO and friends) serve path-style URLs (endpoint/bucket/key),
// while the SDK defaults to virtual-hosted-style (bucket.endpoint/key), which
// would require wildcard DNS and a wildcard cert per bucket. Real AWS keeps the
// default, since config.endpoint is undefined there.
export const getS3Client = (storageRegion?: string) => {
  const NEXT_PUBLIC_UPLOAD_TRANSPORT = process.env.NEXT_PUBLIC_UPLOAD_TRANSPORT;

  if (NEXT_PUBLIC_UPLOAD_TRANSPORT !== "s3") {
    throw new Error("Invalid upload transport");
  }

  const config = getStorageConfig(storageRegion);

  return new S3Client({
    endpoint: config.endpoint || undefined,
    forcePathStyle: !!config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
};

export const getS3ClientForTeam = async (teamId: string) => {
  const NEXT_PUBLIC_UPLOAD_TRANSPORT = process.env.NEXT_PUBLIC_UPLOAD_TRANSPORT;

  if (NEXT_PUBLIC_UPLOAD_TRANSPORT !== "s3") {
    throw new Error("Invalid upload transport");
  }

  const config = await getTeamStorageConfigById(teamId);

  return new S3Client({
    endpoint: config.endpoint || undefined,
    forcePathStyle: !!config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
};

export const getLambdaClient = (storageRegion?: string) => {
  const NEXT_PUBLIC_UPLOAD_TRANSPORT = process.env.NEXT_PUBLIC_UPLOAD_TRANSPORT;

  if (NEXT_PUBLIC_UPLOAD_TRANSPORT !== "s3") {
    throw new Error("Invalid upload transport");
  }

  const config = getStorageConfig(storageRegion);

  return new LambdaClient({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
};

export const getLambdaClientForTeam = async (teamId: string) => {
  const NEXT_PUBLIC_UPLOAD_TRANSPORT = process.env.NEXT_PUBLIC_UPLOAD_TRANSPORT;

  if (NEXT_PUBLIC_UPLOAD_TRANSPORT !== "s3") {
    throw new Error("Invalid upload transport");
  }

  const config = await getTeamStorageConfigById(teamId);

  return new LambdaClient({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
};

/**
 * Gets both S3 client and storage config for a team in a single call.
 * This is more efficient than calling getS3ClientForTeam and getTeamStorageConfigById separately.
 *
 * @param teamId - The team ID
 * @returns Promise<{ client: S3Client, config: StorageConfig }> - Both client and config
 */
export const getTeamS3ClientAndConfig = async (teamId: string) => {
  const NEXT_PUBLIC_UPLOAD_TRANSPORT = process.env.NEXT_PUBLIC_UPLOAD_TRANSPORT;

  if (NEXT_PUBLIC_UPLOAD_TRANSPORT !== "s3") {
    throw new Error("Invalid upload transport");
  }

  const config = await getTeamStorageConfigById(teamId);

  const client = new S3Client({
    endpoint: config.endpoint || undefined,
    forcePathStyle: !!config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return { client, config };
};

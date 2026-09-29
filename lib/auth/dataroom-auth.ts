import { NextApiRequest } from "next";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

import { ipAddress } from "@vercel/functions";
import { parse } from "cookie";
import crypto from "crypto";
import { z } from "zod";

import prisma from "@/lib/prisma";

import { LOCALHOST_IP } from "../utils/geo";
import { getIpAddress } from "../utils/ip";

const COOKIE_EXPIRATION_TIME = 23 * 60 * 60 * 1000; // 23 hours

// Define the Zod schema for session data
export const DataroomSessionSchema = z.object({
  linkId: z.string(),
  dataroomId: z.string(),
  viewId: z.string(),
  viewerId: z.string().optional(),
  expiresAt: z.number(),
  ipAddress: z.string(),
  verified: z.boolean(),
});

// Generate TypeScript type from Zod schema
export type DataroomSession = z.infer<typeof DataroomSessionSchema>;

// Sessions are stored in the DataroomSession table, keyed by a hash of the
// cookie token so a database leak doesn't hand out usable cookies.
const hashSessionToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

async function loadSession(token: string): Promise<DataroomSession | null> {
  const row = await prisma.dataroomSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
  });
  if (!row) return null;

  return {
    dataroomId: row.dataroomId,
    linkId: row.linkId,
    viewId: row.viewId,
    viewerId: row.viewerId ?? undefined,
    expiresAt: row.expiresAt.getTime(),
    ipAddress: row.ipAddress,
    verified: row.verified,
  };
}

async function deleteSession(token: string) {
  await prisma.dataroomSession.deleteMany({
    where: { tokenHash: hashSessionToken(token) },
  });
}

async function createDataroomSession(
  dataroomId: string,
  linkId: string,
  viewId: string,
  ipAddress: string,
  verified: boolean,
  viewerId?: string,
): Promise<{ token: string; expiresAt: number }> {
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + COOKIE_EXPIRATION_TIME;

  const sessionData: DataroomSession = {
    dataroomId,
    linkId,
    viewId,
    viewerId,
    expiresAt,
    ipAddress,
    verified,
  };

  // Validate session data before storing
  DataroomSessionSchema.parse(sessionData);

  await prisma.dataroomSession.create({
    data: {
      tokenHash: hashSessionToken(sessionToken),
      dataroomId,
      linkId,
      viewId,
      viewerId,
      ipAddress,
      verified,
      expiresAt: new Date(expiresAt),
    },
  });

  // Housekeeping: drop expired sessions (Redis used to expire them itself)
  prisma.dataroomSession
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch(() => {});

  return {
    token: sessionToken,
    expiresAt,
  };
}

async function verifyDataroomSession(
  request: NextRequest,
  linkId: string,
  dataroomId: string,
): Promise<DataroomSession | null> {
  if (!dataroomId) return null;

  const sessionToken = cookies().get(`pm_drs_${linkId}`)?.value;
  if (!sessionToken) return null;

  const session = await loadSession(sessionToken);
  if (!session) return null;

  try {
    const sessionData = DataroomSessionSchema.parse(session);

    // Check if session is expired
    if (sessionData.expiresAt < Date.now()) {
      await deleteSession(sessionToken);
      return null;
    }

    const ipAddressValue = ipAddress(request) ?? LOCALHOST_IP;

    if (ipAddressValue !== sessionData.ipAddress) {
      await deleteSession(sessionToken);
      return null;
    }

    // Check if the session is for the correct link and dataroom
    if (
      sessionData.linkId !== linkId ||
      sessionData.dataroomId !== dataroomId
    ) {
      await deleteSession(sessionToken);
      return null;
    }

    return sessionData;
  } catch (error) {
    console.log("error", error);
    // If validation fails, delete invalid session and return null
    await deleteSession(sessionToken);
    return null;
  }
}

export async function verifyDataroomSessionInPagesRouter(
  req: NextApiRequest,
  linkId: string,
  dataroomId: string,
): Promise<DataroomSession | null> {
  if (!dataroomId) return null;

  // Get cookies from request headers
  const cookies = parse(req.headers.cookie || "");
  const sessionToken = cookies[`pm_drs_${linkId}`];
  if (!sessionToken) return null;

  const session = await loadSession(sessionToken);
  if (!session) return null;

  try {
    const sessionData = DataroomSessionSchema.parse(session);

    // Check if session is expired
    if (sessionData.expiresAt < Date.now()) {
      await deleteSession(sessionToken);
      return null;
    }

    // Get IP address from request
    const ipAddressValue = getIpAddress(req.headers) ?? LOCALHOST_IP;

    if (ipAddressValue !== sessionData.ipAddress) {
      await deleteSession(sessionToken);
      return null;
    }

    // Check if the session is for the correct link and dataroom
    if (
      sessionData.linkId !== linkId ||
      sessionData.dataroomId !== dataroomId
    ) {
      await deleteSession(sessionToken);
      return null;
    }

    return sessionData;
  } catch (error) {
    console.log("error", error);
    // If validation fails, delete invalid session and return null
    await deleteSession(sessionToken);
    return null;
  }
}

export { createDataroomSession, verifyDataroomSession };

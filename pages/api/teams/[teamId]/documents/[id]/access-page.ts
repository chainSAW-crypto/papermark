import { NextApiRequest, NextApiResponse } from "next";

import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { getServerSession } from "next-auth/next";
import { z } from "zod";

import {
  ACCESS_PAGE_MAX_DESCRIPTION,
  ACCESS_PAGE_MAX_IMAGES,
  getAccessImageUrl,
  isAllowedAccessImage,
} from "@/lib/documents/access-page";
import { errorhandler } from "@/lib/errorHandler";
import prisma from "@/lib/prisma";
import { CustomUser } from "@/lib/types";

const updateSchema = z.object({
  description: z
    .string()
    .trim()
    .max(ACCESS_PAGE_MAX_DESCRIPTION)
    .nullable()
    .transform((value) => value || null),
  images: z.array(z.string()).max(ACCESS_PAGE_MAX_IMAGES),
});

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET" && req.method !== "PUT") {
    res.setHeader("Allow", ["GET", "PUT"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // GET|PUT /api/teams/:teamId/documents/:id/access-page
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).end("Unauthorized");
  }

  const { teamId, id: docId } = req.query as { teamId: string; id: string };
  const userId = (session.user as CustomUser).id;

  try {
    const teamAccess = await prisma.userTeam.findUnique({
      where: { userId_teamId: { userId, teamId } },
      select: { teamId: true },
    });
    if (!teamAccess) {
      return res.status(401).end("Unauthorized");
    }

    const document = await prisma.document.findUnique({
      where: { id: docId, teamId },
      select: { id: true, accessDescription: true, accessImages: true },
    });
    if (!document) {
      return res.status(404).end("Document not found");
    }

    if (req.method === "GET") {
      const images = await Promise.all(
        document.accessImages.map(async (key) => ({
          key,
          url: await getAccessImageUrl(key),
        })),
      );
      return res
        .status(200)
        .json({ description: document.accessDescription, images });
    }

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid access page settings" });
    }
    const { description, images } = parsed.data;

    // Keep images already on the document; new ones must be uploads that
    // belong to this team, so no other file can be exposed through a link.
    const invalid = images.find(
      (key) =>
        !document.accessImages.includes(key) &&
        !isAllowedAccessImage(key, teamId),
    );
    if (invalid) {
      return res.status(400).json({ message: "Invalid image" });
    }

    await prisma.document.update({
      where: { id: docId },
      data: {
        accessDescription: description,
        accessImages: Array.from(new Set(images)),
      },
    });

    // Refresh the statically generated view pages of this document's links
    await fetch(
      `${process.env.NEXTAUTH_URL}/api/revalidate?secret=${process.env.REVALIDATE_TOKEN}&documentId=${docId}`,
    ).catch(() => {});

    return res.status(200).json({ message: "Access page updated" });
  } catch (error) {
    errorhandler(error, res);
  }
}

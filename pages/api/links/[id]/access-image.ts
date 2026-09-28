import { NextApiRequest, NextApiResponse } from "next";

import { z } from "zod";

import {
  getAccessImageId,
  getAccessImageUrl,
} from "@/lib/documents/access-page";
import prisma from "@/lib/prisma";

const querySchema = z.object({
  id: z.string().cuid(),
  img: z.string().regex(/^[a-f0-9]{16}$/),
});

// GET /api/links/:id/access-image?img=<image id>
// Public: serves an image shown on a link's access screen by redirecting to a
// short-lived storage URL. The static view page can't embed presigned URLs
// directly because it is cached for longer than they stay valid.
export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).end("Bad request");
  }
  const { id, img } = parsed.data;

  const link = await prisma.link.findUnique({
    where: { id, deletedAt: null, isArchived: false },
    select: { document: { select: { accessImages: true } } },
  });

  const key = link?.document?.accessImages.find(
    (key) => getAccessImageId(key) === img,
  );
  if (!key) {
    return res.status(404).end("Not found");
  }

  try {
    const url = await getAccessImageUrl(key);
    // Presigned URLs last an hour; let browsers reuse the redirect briefly
    res.setHeader("Cache-Control", "private, max-age=600");
    return res.redirect(302, url);
  } catch (error) {
    return res.status(500).end("Failed to load image");
  }
}

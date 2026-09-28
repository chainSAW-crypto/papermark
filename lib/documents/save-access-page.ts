import { putFile } from "@/lib/files/put-file";

// An image in the access page editor: either already stored (`key`) or
// picked in this session and not uploaded yet (`file`).
export type AccessImageDraft = {
  key?: string;
  file?: File;
  previewUrl: string;
};

export type AccessPageDraft = {
  description: string;
  images: AccessImageDraft[];
};

export const EMPTY_ACCESS_PAGE: AccessPageDraft = {
  description: "",
  images: [],
};

export const isAccessPageEmpty = (draft: AccessPageDraft) =>
  !draft.description.trim() && draft.images.length === 0;

/** Uploads newly picked images, then saves the note + image list. */
export async function saveAccessPage({
  teamId,
  documentId,
  draft,
}: {
  teamId: string;
  documentId: string;
  draft: AccessPageDraft;
}) {
  const images = await Promise.all(
    draft.images.map(async (image) => {
      if (image.key) return image.key;
      const { data } = await putFile({ file: image.file!, teamId });
      if (!data) throw new Error("Image upload failed");
      return data;
    }),
  );

  const response = await fetch(
    `/api/teams/${teamId}/documents/${documentId}/access-page`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: draft.description.trim() || null,
        images,
      }),
    },
  );
  if (!response.ok) {
    const { message } = await response.json().catch(() => ({ message: "" }));
    throw new Error(message || "Failed to save the access page");
  }
}

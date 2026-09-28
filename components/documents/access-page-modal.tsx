import { useEffect, useState } from "react";

import { toast } from "sonner";

import {
  AccessPageDraft,
  EMPTY_ACCESS_PAGE,
  saveAccessPage,
} from "@/lib/documents/save-access-page";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { AccessPageFields } from "./access-page-fields";

export function AccessPageModal({
  open,
  setOpen,
  teamId,
  documentId,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  teamId: string;
  documentId: string;
}) {
  const [draft, setDraft] = useState<AccessPageDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(null);
    fetch(`/api/teams/${teamId}/documents/${documentId}/access-page`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then(
        (data: {
          description: string | null;
          images: { key: string; url: string }[];
        }) =>
          setDraft({
            description: data.description ?? "",
            images: data.images.map(({ key, url }) => ({
              key,
              previewUrl: url,
            })),
          }),
      )
      .catch(() => {
        toast.error("Failed to load the access page settings.");
        setDraft(EMPTY_ACCESS_PAGE);
      });
  }, [open, teamId, documentId]);

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await saveAccessPage({ teamId, documentId, draft });
      toast.success("Access page updated.");
      setOpen(false);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[90vw] sm:max-w-[480px]">
        <DialogHeader className="text-start">
          <DialogTitle>Access page</DialogTitle>
          <DialogDescription>
            Shown to visitors on the screen where they enter their email, before
            they open this document.
          </DialogDescription>
        </DialogHeader>

        {draft ? (
          <AccessPageFields
            value={draft}
            onChange={setDraft}
            disabled={saving}
          />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Loading...
          </p>
        )}

        <DialogFooter>
          <Button
            onClick={handleSave}
            disabled={!draft || saving}
            loading={saving}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

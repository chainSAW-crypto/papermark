import { useEffect, useRef } from "react";

import { ImagePlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import {
  ACCESS_PAGE_IMAGE_TYPES,
  ACCESS_PAGE_MAX_DESCRIPTION,
  ACCESS_PAGE_MAX_IMAGES,
  ACCESS_PAGE_MAX_IMAGE_MB,
} from "@/lib/documents/access-page-constants";
import { AccessPageDraft } from "@/lib/documents/save-access-page";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Editor for the note and images visitors see on a link's access (email)
 * screen. Used when uploading a document and from the document page.
 */
export function AccessPageFields({
  value,
  onChange,
  disabled,
}: {
  value: AccessPageDraft;
  onChange: (value: AccessPageDraft) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Release previews of images picked in this session when they go away
  const previews = useRef<string[]>([]);
  useEffect(() => {
    previews.current = value.images
      .filter((image) => image.file)
      .map((image) => image.previewUrl);
  }, [value.images]);
  useEffect(
    () => () => previews.current.forEach((url) => URL.revokeObjectURL(url)),
    [],
  );

  const addImages = (files: FileList | null) => {
    if (!files) return;
    const room = ACCESS_PAGE_MAX_IMAGES - value.images.length;
    const picked = Array.from(files);

    const accepted = picked.filter((file) => {
      if (!ACCESS_PAGE_IMAGE_TYPES.includes(file.type)) {
        toast.error(`${file.name}: only PNG and JPG images are supported.`);
        return false;
      }
      if (file.size > ACCESS_PAGE_MAX_IMAGE_MB * 1024 * 1024) {
        toast.error(
          `${file.name} is larger than ${ACCESS_PAGE_MAX_IMAGE_MB} MB.`,
        );
        return false;
      }
      return true;
    });
    if (accepted.length > room) {
      toast.error(`You can add up to ${ACCESS_PAGE_MAX_IMAGES} images.`);
    }

    onChange({
      ...value,
      images: [
        ...value.images,
        ...accepted.slice(0, room).map((file) => ({
          file,
          previewUrl: URL.createObjectURL(file),
        })),
      ],
    });
  };

  const removeImage = (index: number) => {
    const image = value.images[index];
    if (image.file) URL.revokeObjectURL(image.previewUrl);
    onChange({
      ...value,
      images: value.images.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="access-description">Note for viewers</Label>
        <Textarea
          id="access-description"
          rows={3}
          maxLength={ACCESS_PAGE_MAX_DESCRIPTION}
          placeholder="e.g. Hi! This is our Q3 pitch deck. Enter your email to take a look."
          value={value.description}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          disabled={disabled}
          className="px-3 py-2"
        />
        <p className="text-right text-xs text-muted-foreground">
          {value.description.length}/{ACCESS_PAGE_MAX_DESCRIPTION}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Images</Label>
        <div className="flex flex-wrap gap-2">
          {value.images.map((image, index) => (
            <div
              key={image.key ?? image.previewUrl}
              className="group relative h-20 w-20 overflow-hidden rounded-md border"
            >
              <img
                src={image.previewUrl}
                alt={`Image ${index + 1}`}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeImage(index)}
                disabled={disabled}
                aria-label={`Remove image ${index + 1}`}
                className="absolute right-1 top-1 rounded-full bg-black/70 p-0.5 text-white hover:bg-black"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {value.images.length < ACCESS_PAGE_MAX_IMAGES ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
              className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-muted"
            >
              <ImagePlusIcon className="h-5 w-5" />
              Add image
            </button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCESS_PAGE_IMAGE_TYPES.join(",")}
          multiple
          hidden
          data-testid="access-page-image-input"
          onChange={(e) => {
            addImages(e.target.files);
            e.target.value = ""; // allow picking the same file again
          }}
        />
        <p className="text-xs text-muted-foreground">
          Up to {ACCESS_PAGE_MAX_IMAGES} PNG or JPG images,{" "}
          {ACCESS_PAGE_MAX_IMAGE_MB} MB each. Shown next to the email field.
        </p>
      </div>
    </div>
  );
}

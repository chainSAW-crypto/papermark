import { cn } from "@/lib/utils";

/**
 * Note and images the document owner added for visitors, shown above the
 * access form so visitors know what they are about to open.
 */
export default function AccessPageIntro({
  description,
  imageUrls,
  textColor,
}: {
  description?: string | null;
  imageUrls: string[];
  textColor: string;
}) {
  if (!description && imageUrls.length === 0) return null;

  return (
    <div className="mt-6 space-y-4 sm:mx-auto sm:w-full sm:max-w-md">
      {description ? (
        <p
          className="whitespace-pre-line break-words text-sm leading-6 opacity-80"
          style={{ color: textColor }}
        >
          {description}
        </p>
      ) : null}

      {imageUrls.length > 0 ? (
        <div
          className={cn(
            "grid gap-2",
            imageUrls.length > 1 ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {imageUrls.map((src, index) => (
            <img
              key={src}
              src={src}
              alt={`Preview ${index + 1}`}
              loading="lazy"
              className={cn(
                "w-full rounded-lg bg-white/5 object-cover ring-1 ring-white/10",
                imageUrls.length === 1
                  ? "max-h-72 object-contain"
                  : "aspect-[4/3]",
                // odd count: let the first image span the full row
                imageUrls.length % 2 === 1 &&
                  index === 0 &&
                  imageUrls.length > 1
                  ? "col-span-2 aspect-[16/9]"
                  : null,
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

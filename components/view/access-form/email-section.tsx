import { Dispatch, SetStateAction, useEffect, useState } from "react";

import { Brand, DataroomBrand } from "@prisma/client";
import { useDebouncedCallback } from "use-debounce";

import { cn } from "@/lib/utils";
import { determineTextColor } from "@/lib/utils/determine-text-color";
import { getVisitorEmailError } from "@/lib/utils/validate-email";

import { DEFAULT_ACCESS_FORM_TYPE } from ".";

export default function EmailSection({
  data,
  setData,
  brand,
  disableEditEmail,
  useCustomAccessForm,
}: {
  data: DEFAULT_ACCESS_FORM_TYPE;
  setData: Dispatch<SetStateAction<DEFAULT_ACCESS_FORM_TYPE>>;
  brand?: Partial<Brand> | Partial<DataroomBrand> | null;
  disableEditEmail?: boolean;
  useCustomAccessForm?: boolean;
}) {
  const { email } = data;
  // Validity is derived synchronously from the current value; the parent form
  // runs the same check to disable "Continue". This flag only controls when
  // the message is shown, so visitors aren't nagged mid-typing.
  const [showError, setShowError] = useState(false);
  const emailError = email ? getVisitorEmailError(email) : null;
  const visibleError = showError ? emailError : null;

  useEffect(() => {
    // Load email from localStorage when the component mounts
    const storedEmail = window.localStorage.getItem("papermark.email");
    if (storedEmail) {
      setData((prevData) => ({
        ...prevData,
        email: storedEmail.toLowerCase().trim(),
      }));
      // A remembered address was typed on an earlier visit; surface problems
      // with it right away instead of leaving "Continue" silently disabled.
      setShowError(true);
    }
  }, [setData]);

  // Reveal the error once the visitor pauses after starting the domain part
  const debouncedReveal = useDebouncedCallback((value: string) => {
    if (value.includes("@")) setShowError(true);
  }, 800);

  const updateEmail = (newEmail: string) => {
    setData({ ...data, email: newEmail });
    window.localStorage.setItem("papermark.email", newEmail);
  };

  const handleInvalid = (e: React.InvalidEvent<HTMLInputElement>) => {
    e.preventDefault(); // Prevent default browser validation popup
    setShowError(true);
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Email addresses never contain whitespace; drop it as it's typed/pasted
    const newEmail = e.target.value.toLowerCase().replace(/\s/g, "");
    setShowError(false); // Hide error while typing
    debouncedReveal(newEmail);
    updateEmail(newEmail);
  };

  const handleBlur = () => {
    debouncedReveal.cancel();
    setShowError(true);
  };

  const applySuggestion = (suggestion: string) => {
    updateEmail(suggestion);
    setShowError(false);
  };

  return (
    <div className="relative space-y-2">
      <label
        htmlFor="email"
        className="block text-sm font-medium leading-6 text-white"
        style={{
          color: determineTextColor(brand?.accentColor),
        }}
      >
        Email address
      </label>
      <input
        name="email"
        id="email"
        type="email"
        autoCorrect="off"
        autoComplete="email"
        autoFocus
        required
        translate="no"
        className={cn(
          "notranslate flex w-full rounded-md border-0 bg-black py-1.5 text-gray-500 shadow-sm ring-1 ring-inset ring-gray-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-300 sm:text-sm sm:leading-6",
          visibleError && "ring-red-500",
        )}
        style={{
          backgroundColor:
            brand && brand.accentColor ? brand.accentColor : "black",
          color: disableEditEmail
            ? "hsl(var(--muted-foreground))"
            : determineTextColor(brand?.accentColor),
        }}
        value={email || ""}
        placeholder="Enter email"
        onChange={handleEmailChange}
        onInvalid={handleInvalid}
        onBlur={handleBlur}
        disabled={disableEditEmail}
        data-1p-ignore
        aria-invalid={visibleError ? "true" : "false"}
        aria-describedby={visibleError ? "email-error" : undefined}
      />
      {visibleError && (
        <p
          id="email-error"
          role="alert"
          className="mt-1 text-sm text-red-500"
          style={{
            color: determineTextColor(brand?.accentColor),
          }}
        >
          {visibleError.message}{" "}
          {visibleError.suggestion && !disableEditEmail ? (
            <button
              type="button"
              className="font-medium underline underline-offset-2"
              onClick={() => applySuggestion(visibleError.suggestion!)}
            >
              Use {visibleError.suggestion}
            </button>
          ) : null}
        </p>
      )}
      <p className="text-sm text-gray-500">
        {useCustomAccessForm
          ? "This data will be shared with the content provider."
          : "This data will be shared with the sender."}
      </p>
    </div>
  );
}

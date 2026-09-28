import { validateEmail } from "@/lib/utils/validate-email";

// Visitor email remembered in this browser so other links can prefill it.
// Same key as before, so addresses saved by earlier versions still work.
const STORAGE_KEY = "papermark.email";

export function getRememberedEmail(): string | null {
  try {
    const email = window.localStorage
      .getItem(STORAGE_KEY)
      ?.trim()
      .toLowerCase();
    return email && validateEmail(email) ? email : null;
  } catch {
    return null; // storage blocked (private mode, disabled cookies)
  }
}

/** Call once access was granted, so only addresses that worked are kept. */
export function rememberEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();
  if (!normalized || !validateEmail(normalized)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, normalized);
  } catch {
    // storage blocked; prefilling is a convenience only
  }
}

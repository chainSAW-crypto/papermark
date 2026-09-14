import { tenant } from "@teamhanko/passkeys-next-auth-provider";

// Hanko passkey login is optional. This module is imported unconditionally
// by the NextAuth config (PasskeyProvider is always registered), so it must
// not throw at import time when unconfigured - only actual passkey
// registration/login attempts should fail, not every page load.
if (!process.env.HANKO_API_KEY || !process.env.NEXT_PUBLIC_HANKO_TENANT_ID) {
  console.warn(
    "HANKO_API_KEY and NEXT_PUBLIC_HANKO_TENANT_ID are not set - passkey login is disabled.",
  );
}

const hanko = tenant({
  apiKey: process.env.HANKO_API_KEY ?? "",
  // The SDK's tenant() throws eagerly if tenantId is falsy, so a placeholder
  // is required here even when unconfigured - the placeholder only causes a
  // real (expected) API error if someone actually attempts passkey login.
  tenantId: process.env.NEXT_PUBLIC_HANKO_TENANT_ID || "unconfigured",
});

export default hanko;

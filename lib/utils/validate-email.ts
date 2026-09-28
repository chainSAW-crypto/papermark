// RFC 5322 compliant regex
export const fullyCompliantEmailRegex =
  /^(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/;

// Simple email regex - supports university domains with subdomains and hyphens
export const simpleEmailRegex =
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

export const validateEmail = (email: string) => {
  const normalized = email.toLowerCase().trim();
  if (!simpleEmailRegex.test(normalized)) return false;

  // Structural rules the regex doesn't cover (RFC 5321 limits, dot placement)
  const [localPart] = normalized.split("@");
  return (
    normalized.length <= 254 &&
    localPart.length <= 64 &&
    !localPart.startsWith(".") &&
    !localPart.endsWith(".") &&
    !normalized.includes("..")
  );
};

// ---------------------------------------------------------------------------
// Visitor email check (access form in front of shared documents/datarooms)
// ---------------------------------------------------------------------------

// Mistyped ".com" endings. None of these are real TLDs, so they can be
// rejected outright without risking a legitimate address.
const MISTYPED_COM_TLDS = new Set([
  "con",
  "cmo",
  "ocm",
  "cpm",
  "vom",
  "xom",
  "comm",
  "coom",
]);

// Mailbox providers whose domains get mistyped often enough to be worth
// catching ("gmial.com", "gmail.co", "hotmal.com", ...).
const POPULAR_PROVIDER_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "protonmail.com",
  "rediffmail.com",
];

// Real domains that sit one typo away from a popular provider and must never
// be flagged (e.g. "ymail.com" and "mail.com" vs "gmail.com").
const KNOWN_VALID_DOMAINS = new Set([
  ...POPULAR_PROVIDER_DOMAINS,
  "ymail.com",
  "mail.com",
  "email.com",
  "gmx.com",
  "live.com",
  "msn.com",
  "aol.com",
  "me.com",
  "mac.com",
  "proton.me",
  "pm.me",
]);

// Optimal string alignment distance (Levenshtein + adjacent transpositions),
// so "gmial.com" counts as a single typo of "gmail.com".
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
  );

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }

  return d[a.length][b.length];
}

function suggestDomain(domain: string): string | null {
  if (KNOWN_VALID_DOMAINS.has(domain)) return null;

  const labels = domain.split(".");
  const tld = labels[labels.length - 1];
  if (MISTYPED_COM_TLDS.has(tld)) {
    return [...labels.slice(0, -1), "com"].join(".");
  }

  return (
    POPULAR_PROVIDER_DOMAINS.find(
      (provider) => editDistance(domain, provider) === 1,
    ) ?? null
  );
}

export type VisitorEmailError = {
  message: string;
  // Corrected address to offer the visitor, when the problem is a likely typo
  suggestion?: string;
};

/**
 * Validates an email typed into a document access form. Returns null when the
 * address is acceptable. Used both client-side (to block the Continue button)
 * and server-side (so the check can't be bypassed by calling the API).
 */
export function getVisitorEmailError(
  email: string | null | undefined,
): VisitorEmailError | null {
  const normalized = (email ?? "").toLowerCase().trim();

  if (!normalized) {
    return { message: "Email is required." };
  }

  if (!validateEmail(normalized)) {
    return { message: "Please enter a valid email address." };
  }

  const [localPart, domain] = normalized.split("@");
  const suggestedDomain = suggestDomain(domain);
  if (suggestedDomain) {
    const suggestion = `${localPart}@${suggestedDomain}`;
    return {
      message: `This email looks mistyped. Did you mean ${suggestion}?`,
      suggestion,
    };
  }

  return null;
}

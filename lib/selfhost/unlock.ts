import prisma from "@/lib/prisma";

// SELFHOST_UNLOCK_ALL=true puts every team on the top plan with generous
// limits. Plan checks are spread across ~70 files and all read `Team.plan` /
// `Team.limits` from the database, so the switch works by keeping those two
// columns in sync rather than patching each check.
export const isSelfHostUnlockEnabled =
  process.env.SELFHOST_UNLOCK_ALL === "true";

export const SELFHOST_PLAN = "datarooms-premium";

// Merged over the plan defaults by getLimits() (ee/limits/server.ts).
// `null` for links/documents means unlimited.
export const SELFHOST_LIMITS = {
  users: 1000,
  datarooms: 1000,
  domains: 1000,
  links: null,
  documents: null,
  customDomainOnPro: true,
  customDomainInDataroom: true,
  advancedLinkControlsOnPro: true,
  watermarkOnBusiness: true,
  agreementOnBusiness: true,
  conversationsInDataroom: true,
  fileSizeLimits: {
    video: 2048, // MB
    document: 350, // MB
    image: 100, // MB
    excel: 100, // MB
    maxFiles: 500,
    maxPages: 1000,
  },
};

/** Fields to spread into `prisma.team.create({ data })`. */
export function selfHostTeamDefaults() {
  return isSelfHostUnlockEnabled
    ? { plan: SELFHOST_PLAN, limits: SELFHOST_LIMITS }
    : {};
}

/**
 * Upgrades any of the given teams that aren't on the self-host plan yet
 * (teams created before the switch was turned on). Returns the ids updated.
 */
export async function syncSelfHostPlan(
  teams: { id: string; plan: string }[],
): Promise<string[]> {
  if (!isSelfHostUnlockEnabled) return [];

  const outdated = teams
    .filter((team) => team.plan !== SELFHOST_PLAN)
    .map((team) => team.id);
  if (outdated.length === 0) return [];

  await prisma.team.updateMany({
    where: { id: { in: outdated } },
    data: { plan: SELFHOST_PLAN, limits: SELFHOST_LIMITS },
  });
  return outdated;
}

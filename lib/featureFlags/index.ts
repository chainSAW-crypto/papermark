import { get } from "@vercel/edge-config";

export type BetaFeatures =
  | "tokens"
  | "incomingWebhooks"
  | "roomChangeNotifications"
  | "webhooks"
  | "conversations"
  | "dataroomUpload"
  | "inDocumentLinks"
  | "usStorage"
  | "dataroomIndex"
  | "slack"
  | "annotations"
  | "dataroomInvitations"
  | "workflows";

type BetaFeaturesRecord = Record<BetaFeatures, string[]>;

export const getFeatureFlags = async ({ teamId }: { teamId?: string }) => {
  const teamFeatures: Record<BetaFeatures, boolean> = {
    tokens: false,
    incomingWebhooks: false,
    roomChangeNotifications: false,
    webhooks: false,
    conversations: false,
    dataroomUpload: false,
    inDocumentLinks: false,
    usStorage: false,
    dataroomIndex: false,
    slack: false,
    annotations: false,
    dataroomInvitations: false,
    workflows: false,
  };

  // Return all features as true if edge config is not available, except US
  // storage: that needs a second bucket (NEXT_PRIVATE_UPLOAD_BUCKET_US), and
  // without one every file request logged "Failed to resolve storage region"
  // before falling back to the default bucket anyway
  if (!process.env.EDGE_CONFIG) {
    return Object.fromEntries(
      Object.entries(teamFeatures).map(([key, _v]) => [
        key,
        key === "usStorage" ? !!process.env.NEXT_PRIVATE_UPLOAD_BUCKET_US : true,
      ]),
    );
  } else if (!teamId) {
    return teamFeatures;
  }

  let betaFeatures: BetaFeaturesRecord | undefined = undefined;

  try {
    betaFeatures = await get("betaFeatures");
  } catch (e) {
    console.error(`Error getting beta features: ${e}`);
  }

  if (betaFeatures) {
    for (const [featureFlag, teamIds] of Object.entries(betaFeatures)) {
      if (teamIds.includes(teamId)) {
        teamFeatures[featureFlag as BetaFeatures] = true;
      }
    }
  }

  return teamFeatures;
};

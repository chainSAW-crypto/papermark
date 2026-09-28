import { BasePlan } from "../swr/use-billing";

type TQueueConfig = {
  name: string;
  concurrencyLimit: number;
};

const concurrencyConfig: Record<string, number> = {
  free: 1,
  starter: 1,
  pro: 2,
  business: 10,
  datarooms: 10,
  "datarooms-plus": 10,
  // SELFHOST_UNLOCK_ALL puts teams on this plan; without an entry its queue
  // was created with no concurrency limit at all
  "datarooms-premium": 10,
};

export const conversionQueue = (plan: string): TQueueConfig => {
  const planName = plan.split("+")[0] as BasePlan;

  return {
    name: `conversion-${planName}`,
    concurrencyLimit: concurrencyConfig[planName],
  };
};

export type TriggerResult =
  | { queued: true }
  | { queued: false; reason: string };

/**
 * Queues a Trigger.dev background job without letting a Trigger.dev problem
 * (not configured, outage, retired SDK version) fail the request that
 * uploaded the file. Callers decide what a failed queue means for them.
 */
export async function tryTrigger(
  label: string,
  trigger: () => Promise<unknown>,
): Promise<TriggerResult> {
  try {
    await trigger();
    return { queued: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[trigger] could not queue ${label}: ${reason}`);
    return { queued: false, reason };
  }
}

// Shown when a file can't be used at all without its conversion job
export const conversionUnavailableMessage = (reason: string) =>
  `This file type has to be converted to PDF by the background job service (Trigger.dev), which is not available right now: ${reason}. PDFs, spreadsheets, images and videos can still be uploaded.`;

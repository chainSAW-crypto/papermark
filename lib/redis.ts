import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const isRedisConfigured = !!(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

// Without Redis (a self-hosted instance not running the SRH sidecar), every
// call would throw "Failed to parse URL from /pipeline" and fail its request
// (branding save, link preview, visitor details, ...). Instead keep the same
// keys in this process's memory: enough for a single app instance, but the
// data (preview sessions, caches, pending email changes) is lost on restart.
// Covers only the commands this codebase uses, with Upstash's behaviour of
// JSON-parsing values on read.
type Entry = { value: any; expiresAt?: number };

function createMemoryRedis() {
  const store = new Map<string, Entry>();

  const live = (key: string) => {
    const entry = store.get(key);
    if (entry?.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      store.delete(key);
      return undefined;
    }
    return entry;
  };
  const encode = (value: unknown) =>
    typeof value === "string" ? value : JSON.stringify(value);
  const decode = (value: string) => {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  };
  const collection = <T>(key: string, create: () => T): T => {
    const entry = live(key);
    if (entry) return entry.value;
    const value = create();
    store.set(key, { value });
    return value;
  };

  const set = async (
    key: string,
    value: unknown,
    opts: { ex?: number; px?: number; pxat?: number; nx?: boolean } = {},
  ) => {
    if (opts.nx && live(key)) return null;
    const expiresAt =
      opts.pxat ??
      (opts.px !== undefined
        ? Date.now() + opts.px
        : opts.ex !== undefined
          ? Date.now() + opts.ex * 1000
          : undefined);
    store.set(key, { value: encode(value), expiresAt });
    return "OK";
  };

  return {
    get: async (key: string) => {
      const entry = live(key);
      return entry ? decode(entry.value) : null;
    },
    set,
    setex: (key: string, seconds: number, value: unknown) =>
      set(key, value, { ex: seconds }),
    del: async (...keys: string[]) =>
      keys.filter((key) => live(key) && store.delete(key)).length,
    expire: async (key: string, seconds: number) => {
      const entry = live(key);
      if (!entry) return 0;
      entry.expiresAt = Date.now() + seconds * 1000;
      return 1;
    },
    incr: async (key: string) => {
      const entry = live(key);
      const count = Number(entry ? entry.value : 0) + 1;
      store.set(key, { value: String(count), expiresAt: entry?.expiresAt });
      return count;
    },
    sadd: async (key: string, ...members: unknown[]) => {
      const existing = collection(key, () => new Set<string>());
      const before = existing.size;
      members.forEach((member) => existing.add(encode(member)));
      return existing.size - before;
    },
    srem: async (key: string, ...members: unknown[]) => {
      const existing: Set<string> | undefined = live(key)?.value;
      if (!existing) return 0;
      return members.filter((member) => existing.delete(encode(member))).length;
    },
    sismember: async (key: string, member: unknown) =>
      (live(key)?.value as Set<string> | undefined)?.has(encode(member))
        ? 1
        : 0,
    hset: async (key: string, fields: Record<string, unknown>) => {
      const hash = collection(key, () => new Map<string, unknown>());
      const added = Object.keys(fields).filter((field) => !hash.has(field));
      Object.entries(fields).forEach(([field, value]) => hash.set(field, value));
      return added.length;
    },
    hincrby: async (key: string, field: string, increment: number) => {
      const hash = collection(key, () => new Map<string, unknown>());
      const value = Number(hash.get(field) ?? 0) + increment;
      hash.set(field, value);
      return value;
    },
    zadd: async (
      key: string,
      ...items: { score: number; member: unknown }[]
    ) => {
      const zset = collection(key, () => new Map<string, number>());
      const added = items.filter(({ member }) => !zset.has(encode(member)));
      items.forEach(({ score, member }) => zset.set(encode(member), score));
      return added.length;
    },
    zrem: async (key: string, ...members: unknown[]) => {
      const zset: Map<string, number> | undefined = live(key)?.value;
      if (!zset) return 0;
      return members.filter((member) => zset.delete(encode(member))).length;
    },
    zrange: async (
      key: string,
      start: number | string,
      stop: number | string,
      opts: { byScore?: boolean; rev?: boolean } = {},
    ) => {
      const zset: Map<string, number> | undefined = live(key)?.value;
      if (!zset) return [];
      let entries = [...zset.entries()].sort((a, b) => a[1] - b[1]);
      if (opts.byScore) {
        entries = entries.filter(
          ([, score]) => score >= Number(start) && score <= Number(stop),
        );
      } else {
        if (opts.rev) entries.reverse();
        const end = Number(stop) < 0 ? entries.length + Number(stop) : Number(stop);
        entries = entries.slice(Number(start), end + 1);
      }
      return entries.map(([member]) => decode(member));
    },
  };
}

export const redis: Redis = isRedisConfigured
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL as string,
      token: process.env.UPSTASH_REDIS_REST_TOKEN as string,
    })
  : (createMemoryRedis() as unknown as Redis);

export const lockerRedisClient = new Redis({
  url: process.env.UPSTASH_REDIS_REST_LOCKER_URL as string,
  token: process.env.UPSTASH_REDIS_REST_LOCKER_TOKEN as string,
});

// Create a new ratelimiter, that allows 10 requests per 10 seconds by default
export const ratelimit = (
  requests: number = 10,
  seconds:
    | `${number} ms`
    | `${number} s`
    | `${number} m`
    | `${number} h`
    | `${number} d` = "10 s",
) => {
  // Without Redis there is nowhere to count requests: allow them (rate
  // limiting is off) rather than failing every rate-limited route
  if (!isRedisConfigured) {
    return {
      limit: async (_identifier: string) => ({
        success: true,
        limit: requests,
        remaining: requests,
        reset: Date.now(),
        pending: Promise.resolve(),
      }),
    } as unknown as Ratelimit;
  }

  return new Ratelimit({
    redis: redis,
    limiter: Ratelimit.slidingWindow(requests, seconds),
    analytics: true,
    prefix: "papermark",
  });
};

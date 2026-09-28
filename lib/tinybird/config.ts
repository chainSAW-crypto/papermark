// Tinybird is optional. Without TINYBIRD_TOKEN (the default for self-hosted
// deployments) every pipe and ingest endpoint in this folder is served from
// the Postgres tables in prisma/schema/analytics.prisma instead.
export const isTinybirdEnabled = !!process.env.TINYBIRD_TOKEN;

type PipeResponse<TData> = {
  meta: { name: string; type: string }[];
  rows?: number;
  data: TData[];
};

type IngestResponse = {
  successful_rows: number;
  quarantined_rows: number;
};

/**
 * Returns the Tinybird pipe when Tinybird is configured, otherwise wraps the
 * Postgres query in the same `{ data, rows }` response shape so callers don't
 * need to know which backend served them.
 */
export function withPostgresFallback<TParams, TData>(
  tinybirdPipe: (params: TParams) => Promise<PipeResponse<TData>>,
  postgresQuery: (params: TParams) => Promise<TData[]>,
): (params: TParams) => Promise<PipeResponse<TData>> {
  if (isTinybirdEnabled) return tinybirdPipe;

  return async (params) => {
    const data = await postgresQuery(params);
    return { meta: [], rows: data.length, data };
  };
}

/**
 * Ingest counterpart of `withPostgresFallback`. `parse` applies the same zod
 * schema (and defaults) the Tinybird endpoint would have applied.
 */
export function withPostgresIngest<TInput, TOutput>(
  tinybirdIngest: (events: TInput | TInput[]) => Promise<IngestResponse>,
  parse: (event: TInput) => TOutput,
  postgresInsert: (events: TOutput[]) => Promise<void>,
): (events: TInput | TInput[]) => Promise<IngestResponse> {
  if (isTinybirdEnabled) return tinybirdIngest;

  return async (events) => {
    const rows = (Array.isArray(events) ? events : [events]).map(parse);
    await postgresInsert(rows);
    return { successful_rows: rows.length, quarantined_rows: 0 };
  };
}

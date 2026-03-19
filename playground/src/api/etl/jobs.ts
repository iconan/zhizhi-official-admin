import { requestClient } from '#/api/request';

const ETL_PREFIX = '/v1/admin/etl';

export type JobCreateEndpoint = 'collect/web' | 'import';
export type ExtractorStrategy = 'hybrid' | 'managed_first' | 'rules_only';

export interface JobQuery {
  keyword?: string;
  limit?: number;
  offset?: number;
  source?: string;
  status?: string;
}

export interface JobInput {
  chunk_size?: number;
  csv_path?: string;
  extractor_strategy?: ExtractorStrategy;
  seed_urls?: string[];
  source_name?: string;
  tenant_schema: string;
}

export async function fetchJobs(params: JobQuery = {}) {
  const res = await requestClient.get(`${ETL_PREFIX}/jobs`, { params });
  const data = (res as any)?.data ?? res;
  const payload = data?.data ?? data ?? {};
  const items = (payload as any)?.items ?? [];
  const total = (payload as any)?.total ?? items.length ?? 0;
  return { items, total } as { items: any[]; total: number };
}

export async function fetchMetricsSummary() {
  return requestClient.get(`${ETL_PREFIX}/metrics/summary`);
}

export async function replayDeadLetter() {
  return requestClient.post(`${ETL_PREFIX}/jobs/replay-dead-letter`);
}

export async function createJob(
  payload: JobInput,
  endpoint: JobCreateEndpoint = 'collect/web',
) {
  return requestClient.post(`${ETL_PREFIX}/${endpoint}`, payload);
}

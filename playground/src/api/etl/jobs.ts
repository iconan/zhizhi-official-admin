import { requestClient } from '#/api/request';

const ETK_PREFIX = '/v1/admin/etl';

export interface JobQuery {
  limit?: number;
  offset?: number;
  keyword?: string;
  status?: string;
  source?: string;
}

export interface JobInput {
  name: string;
  description?: string;
  source?: string;
  csv_url?: string;
  web_url?: string;
  cron?: string;
}

export async function fetchJobs(params: JobQuery = {}) {
  const res = await requestClient.get(`${ETK_PREFIX}/jobs`, { params });
  const data = (res as any)?.data ?? res;
  const payload = data?.data ?? data ?? {};
  const items = (payload as any)?.items ?? [];
  const total = (payload as any)?.total ?? items.length ?? 0;
  return { items, total } as { items: any[]; total: number };
}

export async function fetchMetricsSummary() {
  return requestClient.get(`${ETK_PREFIX}/metrics/summary`);
}

export async function replayDeadLetter() {
  return requestClient.post(`${ETK_PREFIX}/jobs/replay-dead-letter`);
}

export async function createJob(payload: JobInput) {
  return requestClient.post(`${ETK_PREFIX}/jobs`, payload);
}

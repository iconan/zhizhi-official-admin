import { requestClient } from '#/api/request';

const PREFIX = '/v1/admin/seed-discovery';

export interface SeedDiscoveryMeta {
  sources: string[];
  topics: string[];
  topic_keywords: Record<string, string[]>;
}

export interface SeedDiscoveryJobItem {
  job_id: string;
  queue_name: string;
  tenant_schema: string;
  sources: string[];
  topics: string[];
  date_from?: string | null;
  date_to?: string | null;
  limit_per_source: number;
  status: string;
  is_finished: boolean;
  stats?: Record<string, any>;
  error?: string | null;
  enqueued_at?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  seed_count: number;
}

export interface SeedDiscoverySeedItem {
  id: string;
  job_id: string;
  source_name: string;
  topic: string;
  url: string;
  title?: string | null;
  published_at?: string | null;
  matched_keywords: string[];
  status: string;
  enqueued_job_id?: string | null;
  note?: string | null;
  created_at?: string | null;
}

export interface SeedDiscoveryRunRequest {
  tenant_schema: string;
  sources: string[];
  topics: string[];
  date_from?: string | null;
  date_to?: string | null;
  limit_per_source: number;
}

export interface SeedDiscoveryStatsResponse {
  job_id: string;
  total_seeds: number;
  sources: Array<{
    source_name: string;
    count: number;
    topics: Array<{ topic: string; count: number }>;
  }>;
  topics: Array<{ topic: string; count: number }>;
}

export interface SeedDiscoveryEnqueueResponse {
  job_id: string;
  enqueue_items: Array<{
    source_name: string;
    seed_count: number;
    job_id: string;
    queue_name: string;
    accepted: boolean;
    error?: string | null;
  }>;
  enqueued_seed_count: number;
  skipped_seed_count: number;
  accepted: boolean;
}

export interface SeedDiscoveryExportResponse {
  job_id: string;
  file_path: string;
  row_count: number;
  accepted: boolean;
}

function unwrap<T>(res: any): T {
  const data = res?.data ?? res;
  return (data?.data ?? data ?? {}) as T;
}

export async function fetchMeta() {
  const res = await requestClient.get(`${PREFIX}/meta`);
  return unwrap<SeedDiscoveryMeta>(res);
}

export async function runDiscovery(payload: SeedDiscoveryRunRequest) {
  const res = await requestClient.post(`${PREFIX}/run`, payload);
  return unwrap<{ job_id: string; queue_name: string; tenant_schema: string }>(res);
}

export async function fetchJobs(params: { limit?: number; offset?: number } = {}) {
  const res = await requestClient.get(`${PREFIX}/jobs`, { params });
  const payload = unwrap<any>(res);
  return {
    items: (payload?.items ?? []) as SeedDiscoveryJobItem[],
    total: (payload?.total ?? 0) as number,
  };
}

export async function fetchJob(jobId: string) {
  const res = await requestClient.get(`${PREFIX}/jobs/${jobId}`);
  return unwrap<SeedDiscoveryJobItem>(res);
}

export async function fetchJobStats(jobId: string) {
  const res = await requestClient.get(`${PREFIX}/jobs/${jobId}/stats`);
  return unwrap<SeedDiscoveryStatsResponse>(res);
}

export async function fetchSeeds(params: {
  job_id?: string;
  source_name?: string;
  topic?: string;
  status?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const res = await requestClient.get(`${PREFIX}/seeds`, { params });
  const payload = unwrap<any>(res);
  return {
    items: (payload?.items ?? []) as SeedDiscoverySeedItem[],
    total: (payload?.total ?? 0) as number,
  };
}

export async function exportExcel(payload: { job_id: string; seed_ids?: string[] }) {
  const res = await requestClient.post(`${PREFIX}/export`, payload);
  return unwrap<SeedDiscoveryExportResponse>(res);
}

export async function enqueueToCollect(payload: {
  job_id: string;
  tenant_schema?: string;
  seed_ids?: string[];
  chunk_size?: number;
  extractor_strategy?: string;
}) {
  const res = await requestClient.post(`${PREFIX}/enqueue`, payload);
  return unwrap<SeedDiscoveryEnqueueResponse>(res);
}

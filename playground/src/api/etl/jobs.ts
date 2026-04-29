import { requestClient } from '#/api/request';

const ETL_PREFIX = '/v1/admin/etl';

export type JobStatus =
  | 'canceled'
  | 'deferred'
  | 'failed'
  | 'finished'
  | 'queued'
  | 'started'
  | 'stopped';
export type JobType = 'web_collect';
export type AlertLevel = 'critical' | 'normal' | 'warning';
export type ExtractorStrategy = 'hybrid' | 'managed_first' | 'rules_only';

export interface JobItem {
  alert_level?: AlertLevel;
  chunk_size?: number;
  embedding_attempt_index?: number;
  embedding_dead_letter_materials?: number;
  embedding_dead_letter_ratio?: number;
  embedding_failed_materials?: number;
  embedding_job_id?: null | string;
  embedding_max_attempts?: number;
  embedding_retry_job_id?: null | string;
  embedding_retry_pending_materials?: number;
  embedding_status?: null | string;
  embedded_materials?: number;
  ended_at?: null | string;
  enqueued_at?: null | string;
  extractor_strategy?: null | ExtractorStrategy;
  inserted_articles?: number;
  inserted_materials?: number;
  is_finished?: boolean;
  job_id: string;
  job_type?: JobType;
  job_source?: string;
  low_quality_ratio?: number;
  low_quality_rows?: number;
  quality_score_avg?: number;
  rows?: number;
  s2_annotations_count?: number;
  s2_batches?: number;
  s2_deduplicated_items?: number;
  s2_deduplicated_ratio?: number;
  s2_fallback_count?: number;
  s2_invalid_items?: number;
  s2_invalid_ratio?: number;
  s2_normalized_items?: number;
  s2_provider_items?: number;
  source_name?: string;
  started_at?: null | string;
  status?: JobStatus | string;
  tenant_schema?: string;
  updated_articles?: number;
  web_collect_stage?: null | string;
  web_collect_fetch_total?: null | number;
  web_collect_fetch_completed?: null | number;
  web_collect_ingest_total?: null | number;
  web_collect_ingest_completed?: null | number;
}

export interface MetricsSummaryTenant {
  avg_dead_letter_ratio?: number;
  avg_quality_score?: number;
  critical_jobs?: number;
  tenant_schema: string;
  total_jobs?: number;
  warning_jobs?: number;
}

export interface MetricsSummary {
  avg_dead_letter_ratio?: number;
  avg_quality_score?: number;
  critical_jobs?: number;
  tenants?: MetricsSummaryTenant[];
  total_jobs?: number;
  warning_jobs?: number;
}

export interface JobStatusDetail {
  ended_at?: null | string;
  enqueued_at?: null | string;
  is_finished?: boolean;
  job_id: string;
  meta?: Partial<JobItem>;
  queue_name?: string;
  started_at?: null | string;
  status?: JobStatus | string;
}

export interface JobDiagnostics {
  alert_level?: AlertLevel;
  collect_items_sample?: Array<{
    extractor?: string;
    quality_score?: number;
    reason?: string;
    status?: string;
    url?: string;
  }>;
  collect_reason_counts?: Record<string, number>;
  embedded_materials?: number;
  embedding_attempt_index?: number;
  embedding_dead_letter_materials?: number;
  embedding_dead_letter_ratio?: number;
  embedding_failed_materials?: number;
  embedding_job_id?: null | string;
  embedding_max_attempts?: number;
  embedding_retry_job_id?: null | string;
  embedding_retry_pending_materials?: number;
  embedding_status?: null | string;
  extractor_counts?: Record<string, number>;
  extractor_strategy?: null | ExtractorStrategy;
  failed_urls?: number;
  job_id: string;
  low_quality_ratio?: number;
  low_quality_rows?: number;
  quality_score_avg?: number;
  s2_annotations_count?: number;
  s2_batches?: number;
  s2_deduplicated_items?: number;
  s2_deduplicated_ratio?: number;
  s2_fallback_count?: number;
  s2_invalid_items?: number;
  s2_invalid_ratio?: number;
  s2_normalized_items?: number;
  s2_provider_items?: number;
  seed_urls?: number;
}

export interface JobQuery {
  alert_level?: AlertLevel;
  has_dead_letter?: boolean;
  keyword?: string;
  limit?: number;
  offset?: number;
  quality_score_lt?: number;
  status?: JobStatus | string;
  tenant_schema?: string;
  job_type?: JobType;
}

export interface JobInput {
  chunk_size?: number;
  extractor_strategy?: ExtractorStrategy;
  seed_urls?: string[];
  source_name?: string;
  tenant_schema: string;
}

export interface ExcelImportRowResult {
  accepted: boolean;
  error?: string | null;
  extractor_strategy?: string | null;
  job_id?: string | null;
  queue_name?: string | null;
  row_index: number;
  seed_urls?: string[];
  source_name?: string | null;
  tenant_schema?: string | null;
}

export interface ExcelImportResponse {
  failed_count: number;
  filename: string;
  items: ExcelImportRowResult[];
  success_count: number;
  total_rows: number;
}

export async function fetchJobs(params: JobQuery = {}) {
  const res = await requestClient.get(`${ETL_PREFIX}/jobs`, { params });
  const data = (res as any)?.data ?? res;
  const payload = data?.data ?? data ?? {};
  const items = ((payload as any)?.items ?? []) as JobItem[];
  const total = (payload as any)?.total ?? items.length ?? 0;
  return { items, total } as { items: JobItem[]; total: number };
}

export async function fetchMetricsSummary() {
  const res = await requestClient.get(`${ETL_PREFIX}/metrics/summary`);
  const data = (res as any)?.data ?? res;
  const payload = data?.data ?? data ?? {};
  return payload as MetricsSummary;
}

export async function fetchJobDetail(jobId: string) {
  const res = await requestClient.get(`${ETL_PREFIX}/jobs/${jobId}`);
  const data = (res as any)?.data ?? res;
  const payload = data?.data ?? data ?? {};
  return payload as JobStatusDetail;
}

export async function fetchJobDiagnostics(jobId: string) {
  const res = await requestClient.get(`${ETL_PREFIX}/jobs/${jobId}/collect-diagnostics`);
  const data = (res as any)?.data ?? res;
  const payload = data?.data ?? data ?? {};
  return payload as JobDiagnostics;
}

export async function cancelJob(jobId: string) {
  return requestClient.post(`${ETL_PREFIX}/jobs/${jobId}/cancel`);
}

export async function resumeJob(jobId: string) {
  return requestClient.post(`${ETL_PREFIX}/jobs/${jobId}/resume`);
}

export async function replayJob(jobId: string) {
  return requestClient.post(`${ETL_PREFIX}/jobs/${jobId}/replay`);
}

export async function replayEmbedding(jobId: string) {
  return requestClient.post(`${ETL_PREFIX}/jobs/${jobId}/replay-embedding`);
}

export async function replayDeadLetter() {
  return requestClient.post(`${ETL_PREFIX}/jobs/replay-dead-letter`);
}

export async function createJob(payload: JobInput) {
  return requestClient.post(`${ETL_PREFIX}/collect/web`, payload);
}

export async function importExcelJobs(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return requestClient.post(`${ETL_PREFIX}/import`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  }) as Promise<{
    data?: {
      data?: ExcelImportResponse;
    };
  }>;
}

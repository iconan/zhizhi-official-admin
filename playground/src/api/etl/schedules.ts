import { requestClient } from '#/api/request';
import type { ExtractorStrategy } from '#/api/etl/jobs';

const ETL_PREFIX = '/v1/admin/etl';

export interface ScheduleItem {
  chunk_size?: number;
  created_at?: null | string;
  enabled?: boolean;
  extractor_strategy?: ExtractorStrategy;
  interval_minutes?: number;
  last_run_at?: null | string;
  name: string;
  next_run_at?: null | string;
  schedule_id: string;
  seed_urls?: string[];
  source_name?: string;
  tenant_schema: string;
  updated_at?: null | string;
}

export interface ScheduleQuery {
  limit?: number;
  offset?: number;
}

export interface ScheduleInput {
  chunk_size?: number;
  enabled?: boolean;
  extractor_strategy?: ExtractorStrategy;
  interval_minutes?: number;
  name: string;
  seed_urls: string[];
  source_name: string;
  tenant_schema: string;
}

export async function fetchSchedules(params: ScheduleQuery = {}) {
  const res = await requestClient.get(`${ETL_PREFIX}/schedules/web-collect`, { params });
  const data = (res as any)?.data ?? res;
  const payload = data?.data ?? data ?? {};
  const items = ((payload as any)?.items ?? []) as ScheduleItem[];
  const total = (payload as any)?.total ?? items.length ?? 0;
  return { items, total } as { items: ScheduleItem[]; total: number };
}

export async function createSchedule(payload: ScheduleInput) {
  return requestClient.post(`${ETL_PREFIX}/schedules/web-collect`, payload);
}

export async function updateSchedule(scheduleId: string, payload: Partial<ScheduleInput>) {
  return requestClient.post(`${ETL_PREFIX}/schedules/web-collect/${scheduleId}/update`, payload);
}

export async function deleteSchedule(scheduleId: string) {
  return requestClient.post(`${ETL_PREFIX}/schedules/web-collect/${scheduleId}/delete`);
}

export async function runScheduleNow(scheduleId: string) {
  return requestClient.post(`${ETL_PREFIX}/schedules/web-collect/${scheduleId}/run`);
}

export async function triggerDueSchedules(limit = 20) {
  return requestClient.post(`${ETL_PREFIX}/schedules/web-collect/trigger-due?limit=${limit}`);
}

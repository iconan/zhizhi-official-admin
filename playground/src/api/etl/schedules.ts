import { requestClient } from '#/api/request';

const ETL_PREFIX = '/v1/admin/etl';

export interface ScheduleQuery {
  limit?: number;
  offset?: number;
  keyword?: string;
}

export interface ScheduleInput {
  name: string;
  cron: string;
  description?: string;
}

export type ScheduleStatus = 'active' | 'paused';

export async function fetchSchedules(params: ScheduleQuery = {}) {
  const res = await requestClient.get(`${ETL_PREFIX}/schedules/web-collect`, { params });
  const data = (res as any)?.data ?? res;
  const payload = data?.data ?? data ?? {};
  const items = (payload as any)?.items ?? [];
  const total = (payload as any)?.total ?? items.length ?? 0;
  return { items, total } as { items: any[]; total: number };
}

export async function createSchedule(payload: ScheduleInput) {
  return requestClient.post(`${ETL_PREFIX}/schedules/web-collect`, payload);
}

export async function updateSchedule(scheduleId: string, payload: ScheduleInput) {
  return requestClient.post(`${ETL_PREFIX}/schedules/web-collect/${scheduleId}`, payload);
}

export async function deleteSchedule(scheduleId: string) {
  return requestClient.post(`${ETL_PREFIX}/schedules/web-collect/${scheduleId}/delete`);
}

export async function switchScheduleStatus(scheduleId: string, status: ScheduleStatus) {
  return requestClient.post(`${ETL_PREFIX}/schedules/web-collect/${scheduleId}/status`, { status });
}

export async function runScheduleNow(scheduleId: string) {
  return requestClient.post(`${ETL_PREFIX}/schedules/web-collect/${scheduleId}/run`);
}

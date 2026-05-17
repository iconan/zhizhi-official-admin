import { requestClient } from '#/api/request';

const PREFIX = '/v1/admin/logs';

export interface AdminLogItem {
  id: string;
  admin_id?: string | null;
  admin_name?: string | null;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  detail?: Record<string, any> | null;
  ip_address?: string | null;
  created_at?: string | null;
}

export interface AdminLogQuery {
  limit?: number;
  offset?: number;
  admin_id?: string;
  action?: string;
  target_type?: string;
  target_id?: string;
  keyword?: string;
  start_time?: string;
  end_time?: string;
}

export async function fetchAdminLogs(params: AdminLogQuery = {}) {
  return requestClient.get<{ items: AdminLogItem[]; total: number }>(PREFIX, {
    params,
  });
}

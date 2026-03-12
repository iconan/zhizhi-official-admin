import { requestClient } from '#/api/request';

const IAM_PREFIX = '/v1/admin/iam';

export interface IamPermission {
  permission_id: string;
  code: string;
  resource: string;
  action: string;
  name: string;
  description?: string | null;
}

export interface PermissionQuery {
  limit?: number;
  offset?: number;
  keyword?: string;
  code?: string;
  resource?: string;
  action?: string;
  name?: string;
}

export async function fetchPermissions(params: PermissionQuery = {}) {
  const res = await requestClient.get<{ code?: number; data?: any; items?: IamPermission[]; total?: number }>(
    `${IAM_PREFIX}/permissions`,
    { params },
  );
  const data = (res as any)?.data ?? res;
  const payload = data?.data ?? data ?? {};
  const items = (payload as any)?.items ?? payload ?? [];
  const total = (payload as any)?.total ?? items?.length ?? 0;
  return { items, total };
}

export async function createPermission(data: {
  code: string;
  resource: string;
  action: string;
  name: string;
  description?: string | null;
}) {
  return requestClient.post(`${IAM_PREFIX}/permissions`, data);
}

export async function updatePermission(
  permissionId: string,
  data: Partial<Omit<IamPermission, 'permission_id'>>,
) {
  return requestClient.post(`${IAM_PREFIX}/permissions/${permissionId}`, data);
}

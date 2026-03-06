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
}

export async function fetchPermissions(params: PermissionQuery = {}) {
  const res = await requestClient.get<{ items?: IamPermission[]; data?: any }>(
    `${IAM_PREFIX}/permissions`,
    { params },
  );
  return (res as any)?.items ?? (res as any)?.data?.items ?? (res as any)?.data ?? [];
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

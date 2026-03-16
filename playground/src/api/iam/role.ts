import { requestClient } from '#/api/request';

const IAM_PREFIX = '/v1/admin/iam';

export interface IamRole {
  role_id: string;
  code: string;
  name: string;
  description?: string | null;
  org_id?: string | null;
  status: 'active' | 'disabled';
  created_at?: string;
  updated_at?: string;
}

export interface RoleQuery {
  limit?: number;
  offset?: number;
  keyword?: string;
  org_id?: string | null;
  status?: IamRole['status'];
}

export interface SaveRoleInput {
  code?: string;
  name?: string;
  description?: string | null;
  org_id?: string | null;
}

export async function fetchRoles(params: RoleQuery = {}) {
  const res = await requestClient.get<{ items?: IamRole[]; data?: any }>(
    `${IAM_PREFIX}/roles`,
    { params },
  );
  return (res as any)?.items ?? (res as any)?.data?.items ?? (res as any)?.data ?? [];
}

export async function fetchRoleDetail(roleId: string) {
  return requestClient.get(`${IAM_PREFIX}/roles/${roleId}`);
}

export async function createRole(data: Required<Pick<SaveRoleInput, 'code' | 'name'>> & SaveRoleInput) {
  return requestClient.post(`${IAM_PREFIX}/roles`, data);
}

export async function updateRole(roleId: string, data: SaveRoleInput) {
  return requestClient.post(`${IAM_PREFIX}/roles/${roleId}`, data);
}

export async function updateRoleStatus(roleId: string, status: 'active' | 'disabled') {
  return requestClient.post(`${IAM_PREFIX}/roles/${roleId}/status`, { status });
}

export async function bindRolePermissions(roleId: string, permissionCodes: string[]) {
  return requestClient.post(`${IAM_PREFIX}/roles/${roleId}/bind-permissions`, {
    permission_codes: permissionCodes,
  });
}

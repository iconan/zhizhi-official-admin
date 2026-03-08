import { requestClient } from '#/api/request';

const IAM_PREFIX = '/v1/admin/iam';

export interface IamAdminUser {
  admin_user_id: string;
  email: string;
  name: string;
  org_id?: string | null;
  is_active: boolean;
  roles?: string[];
  permissions?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface AdminUserQuery {
  limit?: number;
  offset?: number;
  keyword?: string;
  org_id?: string | null;
  is_active?: boolean;
}

export interface SaveAdminUserInput {
  email?: string;
  name?: string;
  password?: string;
  org_id?: string | null;
}

export async function fetchAdminUsers(params: AdminUserQuery = {}) {
  const res = await requestClient.get<{ items?: IamAdminUser[]; data?: any }>(
    `${IAM_PREFIX}/admin-users`,
    { params },
  );
  return (res as any)?.items ?? (res as any)?.data?.items ?? (res as any)?.data ?? [];
}

export async function fetchAdminUserDetail(adminUserId: string) {
  return requestClient.get(`${IAM_PREFIX}/admin-users/${adminUserId}`);
}

export async function createAdminUser(
  data: Required<Pick<SaveAdminUserInput, 'email' | 'name' | 'password'>> & SaveAdminUserInput,
) {
  return requestClient.post(`${IAM_PREFIX}/admin-users`, data);
}

export async function updateAdminUser(adminUserId: string, data: SaveAdminUserInput) {
  return requestClient.post(`${IAM_PREFIX}/admin-users/${adminUserId}`, data);
}

export async function updateAdminUserStatus(adminUserId: string, isActive: boolean) {
  return requestClient.post(`${IAM_PREFIX}/admin-users/${adminUserId}/status`, {
    is_active: isActive,
  });
}

export async function resetAdminUserPassword(adminUserId: string, newPassword: string) {
  return requestClient.post(`${IAM_PREFIX}/admin-users/${adminUserId}/password`, {
    new_password: newPassword,
  });
}

export async function bindRolesToAdminUser(adminUserId: string, roleCodes: string[]) {
  return requestClient.post(`${IAM_PREFIX}/admin-users/${adminUserId}/bind-roles`, {
    role_codes: roleCodes,
  });
}

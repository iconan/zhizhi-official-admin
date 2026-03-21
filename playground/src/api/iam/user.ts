import { requestClient } from '#/api/request';

const IAM_PREFIX = '/v1/admin/iam';

export interface IamAdminUser {
  admin_user_id: string;
  created_at?: string;
  email: string;
  is_active: boolean;
  name: string;
  org_id?: null | string;
  permissions?: string[];
  roles?: string[];
  updated_at?: string;
}

export interface AdminUserQuery {
  is_active?: boolean;
  keyword?: string;
  limit?: number;
  offset?: number;
  org_id?: null | string;
}

export interface SaveAdminUserInput {
  email?: string;
  name?: string;
  org_id?: null | string;
  password?: string;
}

export async function fetchAdminUsers(params: AdminUserQuery = {}) {
  const res = await requestClient.get<{ data?: any; items?: IamAdminUser[] }>(
    `${IAM_PREFIX}/admin-users`,
    { params },
  );
  const data = (res as any)?.data ?? res;
  const payload = data?.data ?? data ?? {};
  const items = ((payload as any)?.items ?? []) as IamAdminUser[];
  const total = (payload as any)?.total ?? items.length ?? 0;
  return { items, total } as { items: IamAdminUser[]; total: number };
}

export async function fetchAdminUserDetail(adminUserId: string) {
  return requestClient.get(`${IAM_PREFIX}/admin-users/${adminUserId}`);
}

export async function createAdminUser(
  data: Required<Pick<SaveAdminUserInput, 'email' | 'name' | 'password'>> &
    SaveAdminUserInput,
) {
  return requestClient.post(`${IAM_PREFIX}/admin-users`, data);
}

export async function updateAdminUser(
  adminUserId: string,
  data: SaveAdminUserInput,
) {
  return requestClient.post(`${IAM_PREFIX}/admin-users/${adminUserId}`, data);
}

export async function updateAdminUserStatus(
  adminUserId: string,
  isActive: boolean,
) {
  return requestClient.post(`${IAM_PREFIX}/admin-users/${adminUserId}/status`, {
    is_active: isActive,
  });
}

export async function resetAdminUserPassword(
  adminUserId: string,
  newPassword: string,
) {
  return requestClient.post(
    `${IAM_PREFIX}/admin-users/${adminUserId}/password`,
    {
      new_password: newPassword,
    },
  );
}

export async function bindRolesToAdminUser(
  adminUserId: string,
  roleCodes: string[],
) {
  return requestClient.post(
    `${IAM_PREFIX}/admin-users/${adminUserId}/bind-roles`,
    {
      role_codes: roleCodes,
    },
  );
}

import { preferences } from '@vben/preferences';

import { requestClient } from '#/api/request';

const IAM_PREFIX = '/api/v1/admin/iam';

/**
 * 获取当前管理员信息
 */
export async function getUserInfoApi() {
  const data = await requestClient.get<{
    admin_user_id: string;
    email: string;
    name?: string;
    org_id?: string | null;
    is_active?: boolean;
    roles?: string[];
    permissions?: string[];
    created_at?: string;
    updated_at?: string;
  }>(`${IAM_PREFIX}/me`);

  return {
    userId: data.admin_user_id,
    username: data.email,
    realName: data.name || data.email,
    desc: data.org_id || '',
    roles: data.roles || [],
    homePath: preferences.app.defaultHomePath,
    permissions: data.permissions || [],
  };
}

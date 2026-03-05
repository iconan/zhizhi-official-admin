import type { UserInfo } from '@vben/types';

import { requestClient } from '#/api/request';

const IAM_PREFIX = '/v1/admin/iam';

/** 获取用户信息 */
export async function getUserInfoApi() {
  return requestClient.get<UserInfo>(`${IAM_PREFIX}/me`);
}

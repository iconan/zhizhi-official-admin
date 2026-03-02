import { baseRequestClient, requestClient } from '#/api/request';

const IAM_PREFIX = '/api/v1/admin/iam';

export namespace AuthApi {
  /** 登录接口参数 */
  export interface LoginParams {
    login: string; // 邮箱或用户名
    password: string;
  }

  /** 登录/刷新返回值 */
  export interface LoginResult {
    access_token: string;
    refresh_token?: string;
  }

  export interface PermissionsResult {
    permissions: string[];
    roles: string[];
  }
}

/**
 * 登录
 */
export async function loginApi(data: AuthApi.LoginParams) {
  return requestClient.post<AuthApi.LoginResult>(`${IAM_PREFIX}/login`, data);
}

/**
 * 刷新 access token（优先使用 HttpOnly refresh cookie）
 */
export async function refreshTokenApi() {
  return baseRequestClient.post<AuthApi.LoginResult>(`${IAM_PREFIX}/refresh`, {}, {
    withCredentials: true,
    responseReturn: 'data',
  });
}

/**
 * 退出登录（清除 refresh cookie）
 */
export async function logoutApi() {
  return baseRequestClient.post(`${IAM_PREFIX}/logout`, {}, {
    withCredentials: true,
  });
}

/**
 * 获取当前管理员权限码
 */
export async function getAccessCodesApi() {
  const { permissions } = await requestClient.get<AuthApi.PermissionsResult>(`${IAM_PREFIX}/me/permissions`);
  return permissions;
}

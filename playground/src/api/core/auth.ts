import { baseRequestClient, requestClient } from '#/api/request';

const IAM_PREFIX = '/v1/admin/iam';

export namespace AuthApi {
  /** 登录接口参数 */
  export interface LoginParams {
    login: string;
    password: string;
  }

  /** 登录接口返回值 */
  export interface LoginResult {
    accessToken: string;
    refreshToken?: string;
  }

  export interface RefreshTokenResult {
    accessToken: string;
    refreshToken?: string;
  }

  export interface PermissionsResult {
    permissions: string[];
    roles: string[];
  }
}

/** 登录 */
export async function loginApi(data: AuthApi.LoginParams) {
  const res = await requestClient.post<{
    access_token: string;
    refresh_token?: string;
  }>(`${IAM_PREFIX}/login`, data, {
    withCredentials: true,
  });

  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
  } satisfies AuthApi.LoginResult;
}

/** 刷新 accessToken */
export async function refreshTokenApi(refreshToken?: string) {
  const res = await baseRequestClient.post<{
    code: number;
    data: {
      access_token: string;
      refresh_token?: string;
    };
    message: string;
  }>(
    `${IAM_PREFIX}/refresh`,
    refreshToken ? { refresh_token: refreshToken } : null,
    { withCredentials: true },
  );

  // baseRequestClient 返回完整 axios 响应，token 在 res.data.data 中
  const response = res as unknown as {
    data: {
      code: number;
      data: { access_token: string; refresh_token?: string };
      message: string;
    }
  };
  return {
    accessToken: response.data?.data?.access_token,
    refreshToken: response.data?.data?.refresh_token,
  } satisfies AuthApi.RefreshTokenResult;
}

/** 退出登录 */
export async function logoutApi() {
  return baseRequestClient.post(`${IAM_PREFIX}/logout`, null, {
    withCredentials: true,
  });
}

/** 获取权限码 */
export async function getAccessCodesApi() {
  const res = await requestClient.get<AuthApi.PermissionsResult>(
    `${IAM_PREFIX}/me/permissions`,
  );
  return res?.permissions ?? [];
}

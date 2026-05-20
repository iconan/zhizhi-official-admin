/**
 * 该文件可自行根据业务逻辑进行调整
 */
import type { AxiosResponseHeaders, RequestClientOptions } from '@vben/request';

import { useAppConfig } from '@vben/hooks';
import { preferences } from '@vben/preferences';
import {
  authenticateResponseInterceptor,
  defaultResponseInterceptor,
  errorMessageResponseInterceptor,
  RequestClient,
} from '@vben/request';
import { useAccessStore } from '@vben/stores';
import { cloneDeep } from '@vben/utils';

import { message } from 'ant-design-vue';
import JSONBigInt from 'json-bigint';

import { useAuthStore } from '#/store';

import { refreshTokenApi } from './core';

const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);

function createRequestClient(baseURL: string, options?: RequestClientOptions) {
  const client = new RequestClient({
    ...options,
    baseURL,
    transformResponse: (data: any, header: AxiosResponseHeaders) => {
      // storeAsString指示将BigInt存储为字符串，设为false则会存储为内置的BigInt类型
      if (
        header.getContentType()?.toString().includes('application/json') &&
        typeof data === 'string'
      ) {
        return cloneDeep(
          JSONBigInt({ storeAsString: true, strict: true }).parse(data),
        );
      }
      return data;
    },
  });

  /**
   * 重新认证逻辑
   */
  async function doReAuthenticate() {
    console.warn('Access token or refresh token is invalid or expired. ');
    const accessStore = useAccessStore();
    const authStore = useAuthStore();
    accessStore.setAccessToken(null);
    accessStore.setRefreshToken(null);
    if (
      preferences.app.loginExpiredMode === 'modal' &&
      accessStore.isAccessChecked
    ) {
      accessStore.setLoginExpired(true);
    } else {
      await authStore.logout();
    }
  }

  /**
   * 刷新token逻辑
   */
  async function doRefreshToken() {
    const accessStore = useAccessStore();
    const resp = await refreshTokenApi(accessStore.refreshToken ?? undefined);
    const newToken =
      (resp as any)?.accessToken ??
      (resp as any)?.access_token ??
      (resp as any)?.data?.access_token ??
      resp;
    const newRefreshToken =
      (resp as any)?.refreshToken ??
      (resp as any)?.refresh_token ??
      (resp as any)?.data?.refresh_token ??
      null;
    accessStore.setAccessToken(newToken);
    accessStore.setRefreshToken(newRefreshToken);
    return newToken;
  }

  function formatToken(token: null | string) {
    return token ? `Bearer ${token}` : null;
  }

  // 请求头处理
  client.addRequestInterceptor({
    fulfilled: async (config) => {
      const accessStore = useAccessStore();

      config.headers.Authorization = formatToken(accessStore.accessToken);
      config.headers['Accept-Language'] = preferences.app.locale;
      return config;
    },
  });

  // 处理返回的响应数据格式
  client.addResponseInterceptor(
    defaultResponseInterceptor({
      codeField: 'code',
      dataField: 'data',
      successCode: 0,
    }),
  );

  // token过期的处理
  client.addResponseInterceptor(
    authenticateResponseInterceptor({
      client,
      doReAuthenticate,
      doRefreshToken,
      enableRefreshToken: preferences.app.enableRefreshToken,
      formatToken,
    }),
  );

  // 通用的错误处理,如果没有进入上面的错误处理逻辑，就会进入这里
  client.addResponseInterceptor(
    errorMessageResponseInterceptor((msg: string, error) => {
      const status = error?.response?.status;
      // 兼容两种情况：
      // 1) 标准 axios error：body 在 error.response.data 中
      // 2) RequestClient.request catch 后抛出的纯 body 对象：error 本身就是 {code, msg, data}
      const isBody =
        error &&
        typeof error === 'object' &&
        !error.response &&
        'code' in error &&
        'msg' in error;
      const responseData = isBody ? error : (error?.response?.data ?? {});
      const bizCode: number | undefined = responseData?.code ?? error?.code;

      // 401 已经由认证拦截器处理（刷新或跳转登录），这里不再弹 toast，
      // 避免出现认证相关错误对用户无意义的提示。
      // 另外，当 error 被转换为纯 body 对象（无 response）且业务码为认证类时，
      // 说明是 refresh token 链路抛出的，同样静默。
      if (status === 401) {
        return;
      }
      if (
        typeof status !== 'number' &&
        typeof bizCode === 'number' &&
        bizCode >= 40100 &&
        bizCode <= 40199
      ) {
        return;
      }

      // 后端统一返回 msg，若不存在再回退 error/message
      const errorMessage =
        responseData?.msg ??
        responseData?.error ??
        responseData?.message ??
        error?.msg ??
        '';
      void message.error(errorMessage || msg);
    }),
  );

  return client;
}

export const requestClient = createRequestClient(apiURL, {
  responseReturn: 'data',
});

export const baseRequestClient = new RequestClient({ baseURL: apiURL });

export interface PageFetchParams {
  [key: string]: any;
  pageNo?: number;
  pageSize?: number;
}

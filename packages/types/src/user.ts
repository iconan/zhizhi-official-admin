import type { BasicUserInfo } from '@vben-core/typings';

interface UserRoleInfo {
  code: string;
  name: string;
}

/** 用户信息 */
interface UserInfo extends Omit<BasicUserInfo, 'roles'> {
  /**
   * 用户描述
   */
  desc: string;
  /**
   * 首页地址
   */
  homePath: string;

  /**
   * 所属组织
   */
  org?: {
    id: string;
    name: string;
  } | null;

  /**
   * 用户角色
   */
  roles?: UserRoleInfo[];

  /**
   * accessToken
   */
  token: string;
}

export type { UserInfo, UserRoleInfo };

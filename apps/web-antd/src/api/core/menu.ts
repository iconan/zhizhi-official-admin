import type { RouteMeta } from 'vue-router';

import { requestClient } from '#/api/request';

const IAM_PREFIX = '/api/v1/admin/iam';

export namespace MenuApi {
  export interface MenuItem {
    menu_id: string;
    parent_id: string | null;
    name: string;
    code: string;
    menu_type: 'directory' | 'menu' | 'button' | 'link';
    path: string;
    component?: string;
    icon?: string;
    sort: number;
    is_hidden: boolean;
    status: 'active' | 'disabled';
    permission_code?: string;
    meta?: RouteMeta;
    children?: MenuItem[];
  }

  export interface ListResponse {
    items: MenuItem[];
  }
}

/** 菜单列表 */
export async function fetchMenus(params?: { include_disabled?: boolean }) {
  return requestClient.get<MenuApi.ListResponse>(`${IAM_PREFIX}/menus`, {
    params,
  });
}

/** 菜单树 */
export async function fetchMenuTree(params?: { include_disabled?: boolean }) {
  const res = await requestClient.get<MenuApi.ListResponse>(`${IAM_PREFIX}/menus/tree`, {
    params,
  });
  return res?.items ?? [];
}

/** 新建菜单 */
export async function createMenu(data: Partial<MenuApi.MenuItem>) {
  return requestClient.post(`${IAM_PREFIX}/menus`, data);
}

/** 更新菜单 */
export async function updateMenu(menuId: string, data: Partial<MenuApi.MenuItem>) {
  return requestClient.post(`${IAM_PREFIX}/menus/${menuId}`, data);
}

/** 更新状态 */
export async function updateMenuStatus(menuId: string, status: MenuApi.MenuItem['status']) {
  return requestClient.post(`${IAM_PREFIX}/menus/${menuId}/status`, { status });
}

/** 删除菜单 */
export async function deleteMenu(menuId: string) {
  return requestClient.post(`${IAM_PREFIX}/menus/${menuId}/delete`);
}

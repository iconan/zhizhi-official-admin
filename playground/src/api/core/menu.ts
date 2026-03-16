import type { RouteRecordStringComponent } from '@vben/types';

import { requestClient } from '#/api/request';

interface BackendMenuItem {
  children?: BackendMenuItem[];
  code: string;
  component?: null | string;
  external_url?: null | string;
  icon?: null | string;
  is_hidden?: boolean;
  menu_id: string;
  menu_type: 'button' | 'directory' | 'link' | 'menu';
  meta?: null | Record<string, any>;
  name: string;
  parent_id: null | string;
  path: string;
  permission_code?: null | string;
  sort?: null | number;
  status?: string;
}

function mapMenuTree(
  items: BackendMenuItem[] = [],
): RouteRecordStringComponent[] {
  return items
    .filter((item) => item.menu_type !== 'button')
    .map((item) => {
      const path = item.path === '/' ? `/${item.code}` : item.path;
      const component =
        item.component ?? (item.menu_type === 'directory' ? 'BasicLayout' : '');

      const record: RouteRecordStringComponent = {
        path,
        name: item.code || item.menu_id,
        component,
        meta: {
          title: item.name,
          icon: item.icon || undefined,
          hideMenu: item.is_hidden,
          permission: item.permission_code || undefined,
          ...item.meta,
        },
      };

      if (item.children && item.children.length > 0) {
        record.children = mapMenuTree(item.children);
      }
      return record;
    });
}

/**
 * 获取用户所有菜单（动态权限）
 */
export async function getAllMenusApi() {
  const res = await requestClient.get<{ data?: { items?: BackendMenuItem[] } }>(
    '/v1/admin/iam/menus/tree',
  );
  const items = (res as any)?.data?.items ?? (res as any)?.items ?? [];
  const routes = mapMenuTree(items);
  console.log('[menu] backend menu payload', res);
  console.log('[menu] backend menu items', items);
  console.log('[menu] mapped route records', routes);
  return routes;
}

import { requestClient } from '#/api/request';

const IAM_PREFIX = '/v1/admin/iam';

export type MenuStatus = 'active' | 'disabled';
export type MenuType = 'directory' | 'menu' | 'button' | 'link';

export interface IamMenu {
  menu_id: string;
  parent_id: string | null;
  name: string;
  code: string;
  path: string;
  component?: string | null;
  icon?: string | null;
  sort?: number | null;
  is_hidden?: boolean;
  status: MenuStatus;
  menu_type: MenuType;
  permission_code?: string | null;
  external_url?: string | null;
  meta?: Record<string, any> | null;
  children?: IamMenu[];
}

export interface SaveMenuInput {
  parent_id?: string | null;
  name: string;
  code: string;
  path: string;
  component?: string | null;
  icon?: string | null;
  sort?: number | null;
  is_hidden?: boolean;
  status?: MenuStatus;
  menu_type: MenuType;
  permission_code?: string | null;
  external_url?: string | null;
  meta?: Record<string, any> | null;
}

export async function fetchMenus(includeDisabled = false) {
  const res = await requestClient.get<{ items?: IamMenu[]; data?: any }>(
    `${IAM_PREFIX}/menus`,
    {
      params: { include_disabled: includeDisabled },
      timeout: 5000,
    },
  );
  return (res as any)?.items ?? (res as any)?.data?.items ?? (res as any)?.data ?? [];
}

export async function fetchMenuTree(includeDisabled = false) {
  const res = await requestClient.get<{ items?: IamMenu[]; data?: any }>(
    `${IAM_PREFIX}/menus/tree`,
    { params: { include_disabled: includeDisabled }, timeout: 5000 },
  );
  return (res as any)?.items ?? (res as any)?.data?.items ?? (res as any)?.data ?? [];
}

export async function createMenu(data: SaveMenuInput) {
  return requestClient.post(`${IAM_PREFIX}/menus`, data);
}

export async function updateMenu(menuId: string, data: SaveMenuInput) {
  return requestClient.post(`${IAM_PREFIX}/menus/${menuId}`, data);
}

export async function updateMenuStatus(menuId: string, status: MenuStatus) {
  return requestClient.post(`${IAM_PREFIX}/menus/${menuId}/status`, { status });
}

export async function deleteMenu(menuId: string) {
  return requestClient.post(`${IAM_PREFIX}/menus/${menuId}/delete`);
}

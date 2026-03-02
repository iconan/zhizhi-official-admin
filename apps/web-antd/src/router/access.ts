import type {
  ComponentRecordType,
  GenerateMenuAndRoutesOptions,
} from '@vben/types';

import { generateAccessible } from '@vben/access';
import { preferences } from '@vben/preferences';

import { message } from 'ant-design-vue';

import type { MenuApi } from '#/api';
import { fetchMenuTree } from '#/api';
import { BasicLayout, IFrameView } from '#/layouts';
import { $t } from '#/locales';

const forbiddenComponent = () => import('#/views/_core/fallback/forbidden.vue');

async function generateAccess(options: GenerateMenuAndRoutesOptions) {
  const pageMap: ComponentRecordType = import.meta.glob('../views/**/*.vue');

  const layoutMap: ComponentRecordType = {
    BasicLayout,
    IFrameView,
  };

  return await generateAccessible(preferences.app.accessMode, {
    ...options,
    fetchMenuListAsync: async () => {
      message.loading({
        content: `${$t('common.loadingMenu')}...`,
        duration: 1.5,
      });
      const menus = await fetchMenuTree();
      type MenuItemWithComponent = Omit<MenuApi.MenuItem, 'children' | 'component'> & {
        component: string;
        children?: MenuItemWithComponent[];
      };

      // 统一约定：后端传 component 为相对 views 目录的路径，不带开头斜杠，例如：
      //   system/menu/index.vue 或 system/menu/index
      // 特殊值：BasicLayout / IFrameView
      const normalizeComponent = (component?: string) => {
        if (!component) return 'BasicLayout';
        if (['BasicLayout', 'IFrameView'].includes(component)) return component;
        if (component.startsWith('../')) return component;
        return `../views/${component.replace(/^\//, '')}`;
      };

      const normalize = (list: MenuApi.MenuItem[]): MenuItemWithComponent[] =>
        list.map((item) => ({
          ...(item as Omit<MenuApi.MenuItem, 'component' | 'children'>),
          component: normalizeComponent(item.component),
          children: item.children ? normalize(item.children) : undefined,
        }));

      // 如果后端返回的是扁平结构（带 parent_id，children 为空），先组装成树
      const isFlat = menus.every((item) => !Array.isArray(item.children));
      const buildTree = (flat: MenuItemWithComponent[]) => {
        const idMap = new Map<string, MenuItemWithComponent>();
        flat.forEach((item) => idMap.set(item.menu_id, item));
        const roots: MenuItemWithComponent[] = [];
        flat.forEach((item) => {
          const parentId = (item as any).parent_id as string | null | undefined;
          if (parentId && idMap.has(parentId)) {
            const parent = idMap.get(parentId)!;
            parent.children = parent.children || [];
            parent.children.push(item);
          } else {
            roots.push(item);
          }
        });
        return roots;
      };

      const normalized = normalize(menus);
      return isFlat ? buildTree(normalized) : normalized;

      return normalize(menus);
    },
    // 可以指定没有权限跳转403页面
    forbiddenComponent,
    // 如果 route.meta.menuVisibleWithForbidden = true
    layoutMap,
    pageMap,
  });
}

export { generateAccess };

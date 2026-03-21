import type { Router } from 'vue-router';

import { LOGIN_PATH } from '@vben/constants';
import { preferences } from '@vben/preferences';
import { useAccessStore, useUserStore } from '@vben/stores';
import { startProgress, stopProgress } from '@vben/utils';

import { message } from 'ant-design-vue';

import { accessRoutes, coreRouteNames } from '#/router/routes';
import { useAuthStore } from '#/store';

import { generateAccess } from './access';

function getSafeDefaultHomePath() {
  return preferences.app.defaultHomePath === '/' ? '/workspace' : preferences.app.defaultHomePath;
}

function isUnsafeRedirectPath(path?: string) {
  return !path || path === '/' || path === '/auth' || path === LOGIN_PATH;
}

function findFirstMenuPath(
  menus: Array<{ children?: any[]; path?: string }>,
): string | undefined {
  for (const menu of menus) {
    if (menu.children && menu.children.length > 0) {
      const childPath = findFirstMenuPath(menu.children);
      if (childPath) {
        return childPath;
      }
    }
    if (menu.path && menu.path !== '/') {
      return menu.path;
    }
  }
  return undefined;
}

function hasMenuPath(
  menus: Array<{ children?: any[]; path?: string }>,
  targetPath?: string,
): boolean {
  if (!targetPath) {
    return false;
  }

  for (const menu of menus) {
    if (menu.path === targetPath) {
      return true;
    }
    if (
      menu.children &&
      menu.children.length > 0 &&
      hasMenuPath(menu.children, targetPath)
    ) {
      return true;
    }
  }

  return false;
}

function resolveAuthenticatedRedirectPath({
  firstAccessibleMenuPath,
  redirect,
  targetPath,
  userHomePath,
  visibleMenus,
}: {
  firstAccessibleMenuPath?: string;
  redirect?: string;
  targetPath?: string;
  userHomePath?: string;
  visibleMenus: Array<{ children?: any[]; path?: string }>;
}) {
  if (!isUnsafeRedirectPath(redirect) && hasMenuPath(visibleMenus, redirect)) {
    return redirect;
  }

  if (!isUnsafeRedirectPath(userHomePath) && hasMenuPath(visibleMenus, userHomePath)) {
    return userHomePath;
  }

  if (!isUnsafeRedirectPath(targetPath) && hasMenuPath(visibleMenus, targetPath)) {
    return targetPath;
  }

  const safeDefaultHomePath = getSafeDefaultHomePath();
  if (!isUnsafeRedirectPath(safeDefaultHomePath) && hasMenuPath(visibleMenus, safeDefaultHomePath)) {
    return safeDefaultHomePath;
  }

  if (firstAccessibleMenuPath && !isUnsafeRedirectPath(firstAccessibleMenuPath)) {
    return firstAccessibleMenuPath;
  }

  return safeDefaultHomePath;
}

/**
 * 通用守卫配置
 * @param router
 */
function setupCommonGuard(router: Router) {
  // 记录已经加载的页面
  const loadedPaths = new Set<string>();

  router.beforeEach((to) => {
    to.meta.loaded = loadedPaths.has(to.path);

    // 页面加载进度条
    if (!to.meta.loaded && preferences.transition.progress) {
      void startProgress();
    }
    return true;
  });

  router.afterEach((to) => {
    // 记录页面是否加载,如果已经加载，后续的页面切换动画等效果不在重复执行
    loadedPaths.add(to.path);

    // 关闭页面加载进度条
    if (preferences.transition.progress) {
      void stopProgress();
    }
  });
}

/**
 * 权限访问守卫配置
 * @param router
 */
function setupAccessGuard(router: Router) {
  router.beforeEach(async (to, from) => {
    const accessStore = useAccessStore();
    const userStore = useUserStore();
    const authStore = useAuthStore();
    const isFallbackNotFoundRoute = to.matched.some(
      (route) => route.name === 'FallbackNotFound',
    );
    // 基本路由，这些路由不需要进入权限拦截
    if (coreRouteNames.includes(to.name as string)) {
      if (to.path === LOGIN_PATH && accessStore.accessToken) {
        if (!accessStore.isAccessChecked) {
          return true;
        }

        const firstAccessibleMenuPath = findFirstMenuPath(accessStore.accessMenus as Array<{ children?: any[]; path?: string }>);
        const redirect = decodeURIComponent(
          (to.query?.redirect as string) || getSafeDefaultHomePath(),
        );
        const redirectPath = resolveAuthenticatedRedirectPath({
          firstAccessibleMenuPath,
          redirect,
          targetPath: undefined,
          userHomePath: userStore.userInfo?.homePath,
          visibleMenus: accessStore.accessMenus as Array<{ children?: any[]; path?: string }>,
        });
        return isUnsafeRedirectPath(redirectPath) ? getSafeDefaultHomePath() : redirectPath;
      }
      return true;
    }

    // accessToken 检查
    if (!accessStore.accessToken) {
      // 明确声明忽略权限访问权限，则可以访问
      if (to.meta.ignoreAccess) {
        return true;
      }

      // 没有访问权限，跳转登录页面
      if (to.fullPath !== LOGIN_PATH) {
        return {
          path: LOGIN_PATH,
          // 如不需要，直接删除 query
          query:
            to.fullPath === getSafeDefaultHomePath() || isUnsafeRedirectPath(to.fullPath)
              ? {}
              : { redirect: encodeURIComponent(to.fullPath) },
          // 携带当前跳转的页面，登录后重新跳转该页面
          replace: true,
        };
      }
      return to;
    }

    // 是否已经生成过动态路由
    if (accessStore.isAccessChecked && !isFallbackNotFoundRoute) {
      return true;
    }

    // 生成路由表
    // 当前登录用户拥有的角色标识列表
    try {
      const userInfo = userStore.userInfo || (await authStore.fetchUserInfo());
      const userRoles = userInfo.roles ?? [];

      // 生成菜单和路由
      const { accessibleMenus, accessibleRoutes } = await generateAccess({
        roles: userRoles,
        router,
        // 则会在菜单中显示，但是访问会被重定向到403
        routes: accessRoutes,
      });

      // 保存菜单信息和路由信息
      accessStore.setAccessMenus(accessibleMenus);
      accessStore.setAccessRoutes(accessibleRoutes);
      accessStore.setIsAccessChecked(true);

      const firstAccessibleMenuPath = findFirstMenuPath(accessibleMenus);
      const redirectPath = resolveAuthenticatedRedirectPath({
        firstAccessibleMenuPath,
        redirect: from.query.redirect as string | undefined,
        targetPath: to.path,
        userHomePath: userInfo.homePath,
        visibleMenus: accessibleMenus,
      });
      const resolvedRedirect = router.resolve(
        decodeURIComponent(redirectPath || getSafeDefaultHomePath()),
      );
      if (resolvedRedirect.fullPath === to.fullPath && !isFallbackNotFoundRoute) {
        return true;
      }

      return {
        ...resolvedRedirect,
        replace: true,
      };
    } catch (error) {
      console.error('[router] access guard init failed', error);
      accessStore.setAccessToken(null);
      accessStore.setRefreshToken(null);
      accessStore.setAccessMenus([]);
      accessStore.setAccessRoutes([]);
      accessStore.setIsAccessChecked(false);
      userStore.setUserInfo(null);

      if (to.path !== LOGIN_PATH) {
        message.error('登录状态已失效，请重新登录');
        return {
          path: LOGIN_PATH,
          query: isUnsafeRedirectPath(to.fullPath)
            ? {}
            : { redirect: encodeURIComponent(to.fullPath) },
          replace: true,
        };
      }

      return true;
    }
  });
}

/**
 * 项目守卫配置
 * @param router
 */
function createRouterGuard(router: Router) {
  /** 通用 */
  setupCommonGuard(router);
  /** 权限访问 */
  setupAccessGuard(router);
}

export { createRouterGuard };

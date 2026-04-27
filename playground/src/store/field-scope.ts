import { ref } from 'vue';

import { defineStore } from 'pinia';

import { requestClient } from '#/api/request';

const IAM_PREFIX = '/v1/admin/iam';

interface MePermissionsResponse {
  permissions: string[];
  roles: Array<{ code: string; name: string }>;
  visible_fields?: Record<string, string[]>;
}

/**
 * 字段级权限派生 store。
 *
 * 数据来源：后端 `/me/permissions` 返回的 `visible_fields`，形如：
 *   { admin_user: ['email', 'name', ...] }
 *
 * 使用方式：
 *   - 在视图 onMounted 内 `await store.ensureLoaded()` 后再计算列定义；
 *   - 列定义里给敏感列标 `sensitive: true`，并用 `store.filterColumns(cols, 'admin_user')`
 *     过滤；
 *   - 表单/单元格条件渲染则直接用 `store.isFieldVisible(resource, field)`。
 *
 * 资源未在后端注册（visibleFields 中没有该 key）时默认放行所有字段，避免误隐藏。
 */
export const useFieldScopeStore = defineStore('field-scope', () => {
  const visibleFields = ref<Record<string, string[]>>({});
  const loaded = ref(false);
  let inflight: null | Promise<void> = null;

  function setVisibleFields(v: Record<string, string[]> | undefined | null) {
    visibleFields.value = v ?? {};
    loaded.value = true;
  }

  async function ensureLoaded(): Promise<void> {
    if (loaded.value) return;
    if (!inflight) {
      inflight = (async () => {
        try {
          const res = await requestClient.get<MePermissionsResponse>(
            `${IAM_PREFIX}/me/permissions`,
          );
          setVisibleFields(res?.visible_fields);
        } finally {
          inflight = null;
        }
      })();
    }
    await inflight;
  }

  function isFieldVisible(resource: string, field: string): boolean {
    // 未加载时默认放行，避免初次渲染时误隐藏列；调用方应在挂载时 await ensureLoaded()。
    if (!loaded.value) return true;
    const list = visibleFields.value[resource];
    // 资源未在后端注册时不做控制
    if (!list) return true;
    return list.includes(field);
  }

  function filterColumns<T extends { field?: string; sensitive?: boolean }>(
    columns: T[],
    resource: string,
  ): T[] {
    return columns.filter((c) => {
      if (!c.sensitive) return true;
      if (!c.field) return true;
      return isFieldVisible(resource, c.field);
    });
  }

  function $reset() {
    visibleFields.value = {};
    loaded.value = false;
    inflight = null;
  }

  return {
    visibleFields,
    loaded,
    ensureLoaded,
    setVisibleFields,
    isFieldVisible,
    filterColumns,
    $reset,
  };
});

<script lang="ts" setup>
import type { OnActionClickFn, VxeTableGridOptions } from '#/adapter/vxe-table';

import { Page, useVbenDrawer } from '@vben/common-ui';
import { Modal, Select, Tag, Tooltip, message } from 'ant-design-vue';
import type { SelectValue } from 'ant-design-vue/es/select';
import { Copy } from 'lucide-vue-next';
import dayjs from 'dayjs';
import { useDebounceFn } from '@vueuse/core';
import { computed, nextTick, onMounted, ref, shallowRef } from 'vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  batchArchiveArticles,
  batchParseArticles,
  batchPublishArticles,
  batchRestoreArticles,
  fetchArticles,
  publishArticle,
  transitionArticleStatus,
  type ArticleListItem,
  type ArticleStatus,
} from '#/api/etl/articles';
import { fetchTenants, type IamTenant } from '#/api/iam/tenant';
import { fetchWebSources, type EtlWebSourceItem } from '#/api/etl/sources';

import ArticleDetailDrawer from './modules/detail-drawer.vue';
import ArticlePreviewDrawer from './modules/preview-drawer.vue';

const statusLabelMap: Record<ArticleStatus, string> = {
  crawled: '已抓取',
  parsed: '已解析',
  published: '已发布',
  archived: '已归档',
};

const statusColorMap: Record<ArticleStatus, string> = {
  crawled: 'default',
  parsed: 'blue',
  published: 'green',
  archived: 'red',
};

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    message.success('已复制到剪贴板');
  } catch {
    message.error('复制失败');
  }
}

const columns: VxeTableGridOptions['columns'] = [
  {
    type: 'checkbox',
    width: 60,
    fixed: 'left',
  },
  {
    field: 'id',
    title: '文章 ID',
    minWidth: 120,
    slots: { default: 'article-id' },
  },
  { field: 'title', title: '标题', minWidth: 200, showOverflow: 'tooltip' },
  {
    field: 'tenant_schema',
    title: '所属区域',
    width: 200,
    formatter: ({ cellValue }: { cellValue?: string }) => {
      const tenant = tenantMap.value[cellValue ?? ''];
      if (tenant) {
        // · ${tenant.schema_name}
        return `${tenant.name}`;
      }
      return cellValue || '--';
    },
  },
  {
    field: 'source_name',
    title: '来源',
    width: 120,
    formatter: ({ cellValue }: { cellValue: string }) => {
      const source = sourceOptions.value.find((s) => s.value === cellValue);
      return source?.label || cellValue;
    },
  },
  { field: 'author', title: '作者', width: 100 },
  { field: 'publish_date', title: '发布日期', width: 110 },
  { field: 'status', title: '状态', width: 90, slots: { default: 'status' } },
  { field: 'word_count', title: '字数', width: 80 },
  { field: 'annotations_count', title: '批注数', width: 80 },
  { field: 'fallback_count', title: 'Fallback', width: 90 },
  { field: 'issue_info', title: '期号信息', minWidth: 150, showOverflow: 'tooltip' },
  { field: 'created_at', title: '创建时间', minWidth: 150 },
  { field: 'updated_at', title: '更新时间', minWidth: 150 },
  {
    title: '操作',
    field: 'operation',
    width: 280,
    fixed: 'right',
    showOverflow: false,
    cellRender: {
      attrs: { onClick: onActionClick },
      name: 'CellOperation',
      options: [
        { code: 'preview', text: '预览' },
        { code: 'detail', text: '详情' },
        {
          code: 'parse',
          text: '解析',
          disabled: (row: ArticleListItem) => row.status !== 'crawled',
          popconfirm: true,
          confirmMessage: '确认解析该文章？将生成 AST 结构和批注。',
        },
        {
          code: 'publish',
          text: '发布',
          disabled: (row: ArticleListItem) => row.status !== 'parsed',
          popconfirm: true,
          confirmMessage: '确认发布该文章？',
        },
        {
          code: 'archive',
          text: '归档',
          disabled: (row: ArticleListItem) => row.status !== 'published',
          popconfirm: true,
          confirmTitle: '确认归档',
          confirmMessage: '确认归档该文章？',
        },
        {
          code: 'restore',
          text: '恢复',
          disabled: (row: ArticleListItem) => row.status !== 'archived',
          popconfirm: true,
          confirmTitle: '确认恢复',
          confirmMessage: '确认将文章恢复为已发布状态？',
        },
      ],
    },
  },
];

const sourceOptions = ref<{ label: string; value: string }[]>([]);
const tenantOptions = ref<{ label: string; value: string }[]>([]);
const tenants = ref<IamTenant[]>([]);
const tenantMap = ref<Record<string, IamTenant>>({});
const selectedTenant = ref<string>();
const loadingTenants = ref(false);
const selectedRows = shallowRef<ArticleListItem[]>([]);

// 批量操作 loading 状态（防止重复提交）
const batchProcessing = ref(false);

// 防抖函数：优化频繁触发时选中行状态更新（15ms 约 600fps，快速响应同时避免卡顿）
const debouncedSetSelectedRows = useDebounceFn((records: ArticleListItem[]) => {
  selectedRows.value = records || [];
}, 15);

// 批量操作可用性计算（操作时禁用按钮防止重复提交）
const canBatchParse = computed(() => {
  return !batchProcessing.value && selectedRows.value.length > 0 && selectedRows.value.every((row) => row.status === 'crawled');
});

const canBatchPublish = computed(() => {
  return !batchProcessing.value && selectedRows.value.length > 0 && selectedRows.value.every((row) => row.status === 'parsed');
});

const canBatchArchive = computed(() => {
  return !batchProcessing.value && selectedRows.value.length > 0 && selectedRows.value.every((row) => row.status === 'published');
});

const canBatchRestore = computed(() => {
  return !batchProcessing.value && selectedRows.value.length > 0 && selectedRows.value.every((row) => row.status === 'archived');
});

// 批量操作禁用原因提示
const batchParseDisabledReason = computed(() => {
  if (selectedRows.value.length === 0) return '请先选择文章';
  const nonCrawled = selectedRows.value.filter((r) => r.status !== 'crawled');
  if (nonCrawled.length > 0) return `包含 ${nonCrawled.length} 篇非已抓取状态文章`;
  return '';
});

const batchPublishDisabledReason = computed(() => {
  if (selectedRows.value.length === 0) return '请先选择文章';
  const nonParsed = selectedRows.value.filter((r) => r.status !== 'parsed');
  if (nonParsed.length > 0) return `包含 ${nonParsed.length} 篇非已解析状态文章`;
  return '';
});

const batchArchiveDisabledReason = computed(() => {
  if (selectedRows.value.length === 0) return '请先选择文章';
  const nonPublished = selectedRows.value.filter((r) => r.status !== 'published');
  if (nonPublished.length > 0) return `包含 ${nonPublished.length} 篇非已发布状态文章`;
  return '';
});

const batchRestoreDisabledReason = computed(() => {
  if (selectedRows.value.length === 0) return '请先选择文章';
  const nonArchived = selectedRows.value.filter((r) => r.status !== 'archived');
  if (nonArchived.length > 0) return `包含 ${nonArchived.length} 篇非已归档状态文章`;
  return '';
});

const [DetailDrawer, detailDrawerApi] = useVbenDrawer({
  connectedComponent: ArticleDetailDrawer,
  destroyOnClose: true,
});

const [PreviewDrawer, previewDrawerApi] = useVbenDrawer({
  connectedComponent: ArticlePreviewDrawer,
  destroyOnClose: true,
});

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: {
    columns,
    height: 'auto',
    keepSource: true,
    pagerConfig: { enabled: true, pageSize: 20, pageSizes: [10, 20, 50, 100] },
    proxyConfig: {
      enabled: true,
      autoLoad: true,
      ajax: {
        query: async ({ page }: any, formValues: any) => {
          const limit = page?.pageSize || 20;
          const offset = ((page?.currentPage || 1) - 1) * limit;
          const dateRange = formValues?.date_range;
          const queryParams = {
            status: formValues?.status || undefined,
            source_name: formValues?.source_name || undefined,
            keyword: formValues?.keyword || undefined,
            date_from: dateRange?.[0] ? dayjs(dateRange[0]).format('YYYY-MM-DD') : undefined,
            date_to: dateRange?.[1] ? dayjs(dateRange[1]).format('YYYY-MM-DD') : undefined,
            limit,
            offset,
          };

          try {
            // 没有选择区域时，并行查询所有租户
            if (!selectedTenant.value) {
              if (tenants.value.length === 0) {
                return { items: [], total: 0 };
              }
              // 限制每个租户查询数量，避免过多数据
              const perTenantLimit = Math.min(20, Math.ceil(limit / tenants.value.length));
              const results = await Promise.all(
                tenants.value
                  .filter((t) => t.schema_name)
                  .map(async (tenant) => {
                    const result = await fetchArticles({
                      tenant_schema: tenant.schema_name,
                      ...queryParams,
                      limit: perTenantLimit,
                    }).catch(() => ({ items: [], total: 0, has_more: false }));
                    return result;
                  }),
              );
              // 合并所有结果
              const allItems = results.flatMap((r) => r.items);
              // 按更新时间排序
              allItems.sort((a, b) => {
                const dateA = new Date(a.updated_at || a.created_at).getTime();
                const dateB = new Date(b.updated_at || b.created_at).getTime();
                return dateB - dateA;
              });
              // 分页处理
              const paginatedItems = allItems.slice(offset, offset + limit);
              return {
                items: paginatedItems,
                total: allItems.length,
                has_more: allItems.length > offset + limit,
              } as any;
            } else {
              // 查询单个租户
              const { items, total, has_more } = await fetchArticles({
                tenant_schema: selectedTenant.value,
                ...queryParams,
              });
              return { items, total, has_more } as any;
            }
          } catch (error) {
            message.error('加载文章列表失败，请稍后重试');
            return { items: [], total: 0 };
          }
        },
      },
    },
    rowConfig: { keyField: 'id' },
    toolbarConfig: { custom: true, export: false, refresh: true, zoom: true },
    checkboxConfig: {
      highlight: true,
      range: true,
      // 优化：使用默认触发方式，减少不必要的更新
      trigger: 'default',
      // 优化：启用虚拟滚动时保持选中状态
      reserve: true,
    },
  },
  // vxe-grid 事件配置 - 使用防抖优化频繁触发
  gridEvents: {
    checkboxChange: ({ records }: { records: ArticleListItem[] }) => {
      debouncedSetSelectedRows(records);
    },
    checkboxAll: ({ records }: { records: ArticleListItem[] }) => {
      debouncedSetSelectedRows(records);
    },
  },
  formOptions: {
    submitOnChange: true,
    schema: [
      {
        component: 'Input',
        fieldName: 'keyword',
        label: '关键词',
        componentProps: { allowClear: true, placeholder: '标题/内容搜索' },
      },
      {
        component: 'Select',
        fieldName: 'status',
        label: '状态',
        componentProps: {
          allowClear: true,
          options: [
            { label: '已抓取', value: 'crawled' },
            { label: '已解析', value: 'parsed' },
            { label: '已发布', value: 'published' },
            { label: '已归档', value: 'archived' },
          ],
          style: { width: '100%' },
        },
      },
      {
        component: 'Select',
        fieldName: 'source_name',
        label: '来源',
        componentProps: {
          allowClear: true,
          options: sourceOptions,
          showSearch: true,
          optionFilterProp: 'label',
          style: { width: '100%' },
        },
      },
      {
        component: 'RangePicker',
        fieldName: 'date_range',
        label: '发布日期',
        componentProps: {
          allowClear: true,
          style: { width: '100%' },
        },
      },
    ],
  },
});

// 模板 ref 用于访问 Grid 组件
const gridRef = ref<InstanceType<typeof Grid>>();

// 在组件挂载后初始化数据
onMounted(async () => {
  await nextTick();
  await Promise.all([loadSources(), loadTenants()]);
  // 租户加载完成后自动查询数据
  await gridApi.query();
});

async function loadSources() {
  try {
    const { items } = await fetchWebSources();
    sourceOptions.value = items.map((s: EtlWebSourceItem) => ({
      label: s.display_name || s.key,
      value: s.key,
    }));
  } catch (error) {
  }
}

async function loadTenants() {
  loadingTenants.value = true;
  try {
    const { items } = await fetchTenants({
      limit: 200,
      offset: 0,
      status: 'active',
    });
    tenants.value = items.filter((t) => t.schema_name);
    // 建立 schema_name -> tenant 的映射
    tenantMap.value = items
      .filter((t) => t.schema_name)
      .reduce((acc, t) => {
        acc[t.schema_name] = t;
        return acc;
      }, {} as Record<string, IamTenant>);
    tenantOptions.value = items
      .filter((t) => t.schema_name)
      .map((t) => ({
        label: `${t.name} · ${t.schema_name}`,
        value: t.schema_name,
      }));
  } catch (error) {
    message.error('加载区域列表失败');
  } finally {
    loadingTenants.value = false;
  }
}

async function onActionClick({ code, row }: Parameters<OnActionClickFn<ArticleListItem>>[0]) {
  const tenantSchema = row.tenant_schema;
  if (!tenantSchema) {
    message.warning('无法确定文章所属区域');
    return;
  }

  const actionMap = {
    preview: () => {
      previewDrawerApi.setData({ articleId: row.id, tenantSchema }).open();
    },
    detail: () => {
      detailDrawerApi.setData({ articleId: row.id, tenantSchema }).open();
    },
    parse: async () => {
      await transitionArticleStatus(row.id, {
        tenant_schema: tenantSchema,
        target_status: 'parsed',
        reason: '手动解析',
      });
      message.success('文章解析成功');
    },
    publish: async () => {
      await publishArticle(row.id, tenantSchema);
      message.success('文章发布成功');
    },
    archive: async () => {
      await transitionArticleStatus(row.id, {
        tenant_schema: tenantSchema,
        target_status: 'archived',
        reason: '运营归档',
      });
      message.success('文章已归档');
    },
    restore: async () => {
      await transitionArticleStatus(row.id, {
        tenant_schema: tenantSchema,
        target_status: 'published',
        reason: '恢复文章',
      });
      message.success('文章已恢复为已发布状态');
    },
  } as const;

  const action = actionMap[code as keyof typeof actionMap];
  if (!action) return;

  try {
    await action();
    if (code !== 'preview' && code !== 'detail') {
      await gridApi.query();
    }
  } catch (error: any) {
    // 错误提示由全局拦截器统一处理
    console.error('[Content] action failed', error);
  }
}

function handleTenantChange(value: SelectValue) {
  selectedTenant.value = value as string;
  // 自动刷新列表
  gridApi.query();
}

// 按租户 schema 分组文章
function groupByTenant(rows: ArticleListItem[]): Map<string, ArticleListItem[]> {
  const groups = new Map<string, ArticleListItem[]>();
  for (const row of rows) {
    const schema = row.tenant_schema;
    if (!groups.has(schema)) {
      groups.set(schema, []);
    }
    groups.get(schema)!.push(row);
  }
  return groups;
}

// 批量解析（仅 crawled -> parsed）
async function handleBatchParse() {
  if (!canBatchParse.value || batchProcessing.value) return;

  // 按租户分组
  const groups = groupByTenant(selectedRows.value);

  Modal.confirm({
    title: '确认批量解析',
    content: `已选择 ${selectedRows.value.length} 篇已抓取文章（涉及 ${groups.size} 个区域），确认批量解析？将生成 AST 结构和批注。`,
    onOk: async () => {
      batchProcessing.value = true;
      let totalSuccess = 0;
      let totalFailed = 0;
      const allFailures: { article_id: string; error: string }[] = [];

      try {
        // 按租户分组并行处理
        const promises: Promise<void>[] = [];
        for (const [tenantSchema, rows] of groups) {
          promises.push(
            (async () => {
              try {
                const result = await batchParseArticles({
                  tenant_schema: tenantSchema,
                  article_ids: rows.map((row) => row.id),
                  reason: '批量解析',
                });
                totalSuccess += result.success_count;
                totalFailed += result.failed_count;
                if (result.failures?.length > 0) {
                  allFailures.push(...result.failures);
                }
              } catch (error: any) {
                totalFailed += rows.length;
                allFailures.push(
                  ...rows.map((row) => ({
                    article_id: row.id,
                    error: '批量解析请求失败',
                  })),
                );
              }
            })(),
          );
        }
        await Promise.all(promises);

        // 统一消息提示逻辑
        if (totalSuccess > 0 && totalFailed > 0) {
          message.warning(`批量解析完成：成功 ${totalSuccess} 篇，失败 ${totalFailed} 篇`);
        } else if (totalSuccess > 0) {
          message.success(`成功解析 ${totalSuccess} 篇文章`);
        } else if (totalFailed > 0) {
          message.error(`批量解析失败：${totalFailed} 篇全部失败`);
        }
        if (allFailures.length > 0) {
          // 展示详细失败原因
          const failureReasons = allFailures
            .map((f) => `${f.article_id?.slice(0, 8)}: ${f.error}`)
            .join('\n');
          message.warning(`部分文章解析失败:\n${failureReasons}`, 5);
        }

        selectedRows.value = [];
        // 清除 vxe-grid 复选框选中状态 - 使用多种方式确保清除成功
        await nextTick();
        const vxeGrid = (gridRef.value as any)?.getTableInstance?.() || (gridApi.grid as any);
        if (vxeGrid?.clearCheckboxRow) {
          await vxeGrid.clearCheckboxRow();
        } else if (vxeGrid?.setCheckboxRow) {
          await vxeGrid.setCheckboxRow([], false);
        }
        await nextTick();
        await gridApi.query();
      } catch (error: any) {
        // 错误提示由全局拦截器统一处理
        console.error('[Content] batch parse failed', error);
      } finally {
        batchProcessing.value = false;
      }
    },
  });
}

// 批量发布
async function handleBatchPublish() {
  if (!canBatchPublish.value || batchProcessing.value) return;

  // 按租户分组
  const groups = groupByTenant(selectedRows.value);

  Modal.confirm({
    title: '确认批量发布',
    content: `已选择 ${selectedRows.value.length} 篇文章（涉及 ${groups.size} 个区域），确认批量发布？`,
    onOk: async () => {
      batchProcessing.value = true;
      let totalSuccess = 0;
      let totalFailed = 0;
      const allFailures: { article_id: string; error: string }[] = [];

      try {
        // 按租户分组并行处理
        const promises: Promise<void>[] = [];
        for (const [tenantSchema, rows] of groups) {
          promises.push(
            (async () => {
              try {
                const result = await batchPublishArticles({
                  tenant_schema: tenantSchema,
                  article_ids: rows.map((row) => row.id),
                  reason: '批量发布',
                });
                totalSuccess += result.success_count;
                totalFailed += result.failed_count;
                if (result.failures?.length > 0) {
                  allFailures.push(...result.failures);
                }
              } catch (error: any) {
                totalFailed += rows.length;
                allFailures.push(
                  ...rows.map((row) => ({
                    article_id: row.id,
                    error: '批量发布请求失败',
                  })),
                );
              }
            })(),
          );
        }
        await Promise.all(promises);

        // 统一消息提示逻辑
        if (totalSuccess > 0 && totalFailed > 0) {
          message.warning(`批量发布完成：成功 ${totalSuccess} 篇，失败 ${totalFailed} 篇`);
        } else if (totalSuccess > 0) {
          message.success(`成功发布 ${totalSuccess} 篇文章`);
        } else if (totalFailed > 0) {
          message.error(`批量发布失败：${totalFailed} 篇全部失败`);
        }
        if (allFailures.length > 0) {
          // 展示详细失败原因
          const failureReasons = allFailures
            .map((f) => `${f.article_id?.slice(0, 8)}: ${f.error}`)
            .join('\n');
          message.warning(`部分文章发布失败:\n${failureReasons}`, 5);
        }

        selectedRows.value = [];
        // 清除 vxe-grid 复选框选中状态 - 使用多种方式确保清除成功
        await nextTick();
        const vxeGrid = (gridRef.value as any)?.getTableInstance?.() || (gridApi.grid as any);
        if (vxeGrid?.clearCheckboxRow) {
          await vxeGrid.clearCheckboxRow();
        } else if (vxeGrid?.setCheckboxRow) {
          await vxeGrid.setCheckboxRow([], false);
        }
        await nextTick();
        await gridApi.query();
      } catch (error: any) {
        // 错误提示由全局拦截器统一处理
        console.error('[Content] batch publish failed', error);
      } finally {
        batchProcessing.value = false;
      }
    },
  });
}

// 批量归档
async function handleBatchArchive() {
  if (!canBatchArchive.value || batchProcessing.value) return;

  // 按租户分组
  const groups = groupByTenant(selectedRows.value);

  Modal.confirm({
    title: '确认批量归档',
    content: `已选择 ${selectedRows.value.length} 篇已发布文章（涉及 ${groups.size} 个区域），确认批量归档？`,
    okType: 'danger',
    onOk: async () => {
      batchProcessing.value = true;
      let totalSuccess = 0;
      let totalFailed = 0;
      const allFailures: { article_id: string; error: string }[] = [];

      try {
        // 按租户分组并行处理
        const promises: Promise<void>[] = [];
        for (const [tenantSchema, rows] of groups) {
          promises.push(
            (async () => {
              try {
                const result = await batchArchiveArticles({
                  tenant_schema: tenantSchema,
                  article_ids: rows.map((row) => row.id),
                  reason: '批量归档',
                });
                totalSuccess += result.success_count;
                totalFailed += result.failed_count;
                if (result.failures?.length > 0) {
                  allFailures.push(...result.failures);
                }
              } catch (error: any) {
                totalFailed += rows.length;
                allFailures.push(
                  ...rows.map((row) => ({
                    article_id: row.id,
                    error: '批量归档请求失败',
                  })),
                );
              }
            })(),
          );
        }
        await Promise.all(promises);

        // 统一消息提示逻辑
        if (totalSuccess > 0 && totalFailed > 0) {
          message.warning(`批量归档完成：成功 ${totalSuccess} 篇，失败 ${totalFailed} 篇`);
        } else if (totalSuccess > 0) {
          message.success(`成功归档 ${totalSuccess} 篇文章`);
        } else if (totalFailed > 0) {
          message.error(`批量归档失败：${totalFailed} 篇全部失败`);
        }
        if (allFailures.length > 0) {
          // 展示详细失败原因
          const failureReasons = allFailures
            .map((f) => `${f.article_id?.slice(0, 8)}: ${f.error}`)
            .join('\n');
          message.warning(`部分文章归档失败:\n${failureReasons}`, 5);
        }

        selectedRows.value = [];
        // 清除 vxe-grid 复选框选中状态 - 使用多种方式确保清除成功
        await nextTick();
        const vxeGrid = (gridRef.value as any)?.getTableInstance?.() || (gridApi.grid as any);
        if (vxeGrid?.clearCheckboxRow) {
          await vxeGrid.clearCheckboxRow();
        } else if (vxeGrid?.setCheckboxRow) {
          await vxeGrid.setCheckboxRow([], false);
        }
        await nextTick();
        await gridApi.query();
      } catch (error: any) {
        // 错误提示由全局拦截器统一处理
        console.error('[Content] batch archive failed', error);
      } finally {
        batchProcessing.value = false;
      }
    },
  });
}

// 批量恢复
async function handleBatchRestore() {
  if (!canBatchRestore.value || batchProcessing.value) return;

  // 按租户分组
  const groups = groupByTenant(selectedRows.value);

  Modal.confirm({
    title: '确认批量恢复',
    content: `已选择 ${selectedRows.value.length} 篇已归档文章（涉及 ${groups.size} 个区域），确认批量恢复为已发布状态？`,
    onOk: async () => {
      batchProcessing.value = true;
      let totalSuccess = 0;
      let totalFailed = 0;
      const allFailures: { article_id: string; error: string }[] = [];

      try {
        // 按租户分组并行处理
        const promises: Promise<void>[] = [];
        for (const [tenantSchema, rows] of groups) {
          promises.push(
            (async () => {
              try {
                const result = await batchRestoreArticles({
                  tenant_schema: tenantSchema,
                  article_ids: rows.map((row) => row.id),
                  reason: '批量恢复',
                });
                totalSuccess += result.success_count;
                totalFailed += result.failed_count;
                if (result.failures?.length > 0) {
                  allFailures.push(...result.failures);
                }
              } catch (error: any) {
                totalFailed += rows.length;
                allFailures.push(
                  ...rows.map((row) => ({
                    article_id: row.id,
                    error: '批量恢复请求失败',
                  })),
                );
              }
            })(),
          );
        }
        await Promise.all(promises);

        // 统一消息提示逻辑
        if (totalSuccess > 0 && totalFailed > 0) {
          message.warning(`批量恢复完成：成功 ${totalSuccess} 篇，失败 ${totalFailed} 篇`);
        } else if (totalSuccess > 0) {
          message.success(`成功恢复 ${totalSuccess} 篇文章`);
        } else if (totalFailed > 0) {
          message.error(`批量恢复失败：${totalFailed} 篇全部失败`);
        }
        if (allFailures.length > 0) {
          // 展示详细失败原因
          const failureReasons = allFailures
            .map((f) => `${f.article_id?.slice(0, 8)}: ${f.error}`)
            .join('\n');
          message.warning(`部分文章恢复失败:\n${failureReasons}`, 5);
        }

        selectedRows.value = [];
        // 清除 vxe-grid 复选框选中状态 - 使用多种方式确保清除成功
        await nextTick();
        const vxeGrid = (gridRef.value as any)?.getTableInstance?.() || (gridApi.grid as any);
        if (vxeGrid?.clearCheckboxRow) {
          await vxeGrid.clearCheckboxRow();
        } else if (vxeGrid?.setCheckboxRow) {
          await vxeGrid.setCheckboxRow([], false);
        }
        await nextTick();
        await gridApi.query();
      } catch (error: any) {
        // 错误提示由全局拦截器统一处理
        console.error('[Content] batch restore failed', error);
      } finally {
        batchProcessing.value = false;
      }
    },
  });
}
</script>

<style scoped>
/* stylelint-disable-next-line selector-class-pattern */
/* 批量操作按钮统一样式 */
.batch-btn {
  @apply px-3 py-1 text-xs rounded border transition-all duration-200 cursor-not-allowed opacity-60;
  @apply bg-gray-100 border-gray-300 text-gray-500;
}

.batch-btn:hover {
  @apply opacity-80 border-gray-400;
}

/* 批量解析 - 蓝色 */
.batch-btn-parse {
  @apply cursor-pointer opacity-100 font-medium bg-blue-50 border-blue-500 text-blue-600;
}
.batch-btn-parse:hover {
  @apply bg-blue-100 border-blue-600 shadow-sm;
}

/* 批量发布 - 绿色 */
.batch-btn-publish {
  @apply cursor-pointer opacity-100 font-medium bg-green-50 border-green-500 text-green-600;
}
.batch-btn-publish:hover {
  @apply bg-green-100 border-green-600 shadow-sm;
}

/* 批量归档 - 红色 */
.batch-btn-archive {
  @apply cursor-pointer opacity-100 font-medium bg-red-50 border-red-500 text-red-600;
}
.batch-btn-archive:hover {
  @apply bg-red-100 border-red-600 shadow-sm;
}

/* 批量恢复 - 橙色 */
.batch-btn-restore {
  @apply cursor-pointer opacity-100 font-medium bg-orange-50 border-orange-500 text-orange-600;
}
.batch-btn-restore:hover {
  @apply bg-orange-100 border-orange-600 shadow-sm;
}
</style>

<template>
  <Page auto-content-height>
    <DetailDrawer @success="gridApi.query" />
    <PreviewDrawer />
    <Grid ref="gridRef" table-title="文章管理">
      <template #toolbar-tools>
        <div class="flex items-center gap-4">
          <!-- 区域选择 -->
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-500">所属区域:</span>
            <Select
              v-model:value="selectedTenant"
              :loading="loadingTenants"
              :options="tenantOptions"
              allow-clear
              placeholder="选择所属区域"
              show-search
              option-filter-prop="label"
              style="width: 280px"
              @change="handleTenantChange"
            />
          </div>

          <!-- 分隔线 -->
          <div class="h-6 w-px bg-gray-300"></div>

          <!-- 批量操作按钮 -->
          <div class="flex items-center gap-2">
            <span v-if="selectedRows.length > 0" class="text-sm font-medium text-primary">
              已选择 {{ selectedRows.length }} 项
            </span>
            <span v-else class="text-sm text-gray-400">
              批量操作
            </span>
            <Tooltip :title="canBatchParse ? '将已抓取文章解析为 AST' : batchParseDisabledReason">
              <button
                :class="['batch-btn', 'batch-btn-parse', { 'batch-btn--active': canBatchParse }]"
                :disabled="!canBatchParse"
                @click="handleBatchParse"
              >
                批量解析
              </button>
            </Tooltip>
            <Tooltip :title="canBatchPublish ? '发布已解析文章' : batchPublishDisabledReason">
              <button
                :class="['batch-btn', 'batch-btn-publish', { 'batch-btn--active': canBatchPublish }]"
                :disabled="!canBatchPublish"
                @click="handleBatchPublish"
              >
                批量发布
              </button>
            </Tooltip>
            <Tooltip :title="canBatchArchive ? '归档已发布文章' : batchArchiveDisabledReason">
              <button
                :class="['batch-btn', 'batch-btn-archive', { 'batch-btn--active': canBatchArchive }]"
                :disabled="!canBatchArchive"
                @click="handleBatchArchive"
              >
                批量归档
              </button>
            </Tooltip>
            <Tooltip :title="canBatchRestore ? '恢复归档文章为已发布' : batchRestoreDisabledReason">
              <button
                :class="['batch-btn', 'batch-btn-restore', { 'batch-btn--active': canBatchRestore }]"
                :disabled="!canBatchRestore"
                @click="handleBatchRestore"
              >
                批量恢复
              </button>
            </Tooltip>
          </div>
        </div>
      </template>
      <template #article-id="{ row }">
        <Tooltip :title="row.id">
          <span
            class="cursor-pointer text-primary hover:underline"
            @click="copyToClipboard(row.id)"
          >
            {{ row.id?.slice(0, 8) }}...
            <Copy class="ml-1 inline-block h-3 w-3" />
          </span>
        </Tooltip>
      </template>
      <template #status="{ row }">
        <Tag :color="statusColorMap[row.status as ArticleStatus] ?? 'default'">
          {{ statusLabelMap[row.status as ArticleStatus] ?? row.status ?? '--' }}
        </Tag>
      </template>
    </Grid>
  </Page>
</template>

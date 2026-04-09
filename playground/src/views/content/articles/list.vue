<script lang="ts" setup>
import type { OnActionClickFn, VxeTableGridOptions } from '#/adapter/vxe-table';

import { Page, useVbenDrawer } from '@vben/common-ui';
import { Modal, Select, Tag, Tooltip, message } from 'ant-design-vue';
import type { SelectValue } from 'ant-design-vue/es/select';
import { Copy } from 'lucide-vue-next';
import dayjs from 'dayjs';
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  batchArchiveArticles,
  batchParseArticles,
  batchPublishArticles,
  batchRestoreArticles,
  deleteArticle,
  fetchArticles,
  fetchArticlesAggregate,
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
  archived: 'orange',
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
  { field: 'author', title: '作者/责编', width: 100 },
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
    width: 360,
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
          confirmTitle: '确认解析',
          confirmMessage: '确认解析该文章？将生成 AST 结构和批注。',
        },
        {
          code: 'publish',
          text: '发布',
          disabled: (row: ArticleListItem) => row.status !== 'parsed',
          popconfirm: true,
          confirmTitle: '确认发布',
          confirmMessage: '确认发布该文章？',
          class: (row: ArticleListItem) => row.status === 'parsed' ? 'text-green-500 hover:text-green-600' : '',
        },
        {
          code: 'archive',
          text: '归档',
          disabled: (row: ArticleListItem) => row.status !== 'published',
          popconfirm: true,
          confirmTitle: '确认归档',
          confirmMessage: '确认归档该文章？',
          class: (row: ArticleListItem) => row.status === 'published' ? 'text-orange-500 hover:text-orange-600' : '',
        },
        {
          code: 'restore',
          text: '恢复',
          disabled: (row: ArticleListItem) => row.status !== 'archived',
          popconfirm: true,
          confirmTitle: '确认恢复',
          confirmMessage: '确认将文章恢复为已发布状态？',
          class: (row: ArticleListItem) => row.status === 'archived' ? 'text-teal-500 hover:text-teal-600' : '',
        },
        {
          code: 'delete',
          text: '删除',
          disabled: (row: ArticleListItem) => row.status !== 'archived' && row.status !== 'parsed',
          confirmTitle: '确认永久删除',
          confirmMessage: '确认永久删除该文章？删除后将同时清理关联素材和标注，且无法恢复。',
          class: (row: ArticleListItem) => (row.status === 'archived' || row.status === 'parsed') ? 'text-red-500 hover:text-red-600' : '',
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
type SelectedArticleRow = Pick<ArticleListItem, 'id' | 'tenant_schema' | 'status'>;
let tenantQueryFrame: number | null = null;
let deferredClearTimer: ReturnType<typeof setTimeout> | null = null;
let latestQueryToken = 0;
const HOLD_CONFIRM_MODAL_OPEN: Promise<never> = new Promise(() => {});
let pendingBatchResult: {
  type: 'error' | 'success' | 'warning';
  content: string;
  duration: number;
} | null = null;

// 批量操作 loading 状态（防止重复提交）
const batchProcessing = ref(false);

// 批量操作可用性计算（操作时禁用按钮防止重复提交）
const canBatchParse = computed(() => {
  return !batchProcessing.value && !!selectedTenant.value;
});

const canBatchPublish = computed(() => {
  return !batchProcessing.value && !!selectedTenant.value;
});

const canBatchArchive = computed(() => {
  return !batchProcessing.value && !!selectedTenant.value;
});

const canBatchRestore = computed(() => {
  return !batchProcessing.value && !!selectedTenant.value;
});

// 批量操作禁用原因提示
const batchParseDisabledReason = computed(() => {
  if (!selectedTenant.value) return '请先选择所属区域';
  if (batchProcessing.value) return '批量任务执行中';
  return '';
});

const batchPublishDisabledReason = computed(() => {
  if (!selectedTenant.value) return '请先选择所属区域';
  if (batchProcessing.value) return '批量任务执行中';
  return '';
});

const batchArchiveDisabledReason = computed(() => {
  if (!selectedTenant.value) return '请先选择所属区域';
  if (batchProcessing.value) return '批量任务执行中';
  return '';
});

const batchRestoreDisabledReason = computed(() => {
  if (!selectedTenant.value) return '请先选择所属区域';
  if (batchProcessing.value) return '批量任务执行中';
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
      autoLoad: false,
      ajax: {
        query: async ({ page }: any, formValues: any) => {
          const queryToken = ++latestQueryToken;
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
            const { items, total, has_more } = await loadArticleList(queryParams);
            if (queryToken !== latestQueryToken) {
              return { items: [], total: 0, has_more: false } as any;
            }
            return { items, total, has_more } as any;
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
      checkMethod: () => Boolean(selectedTenant.value),
      // 优化：使用默认触发方式，减少不必要的更新
      trigger: 'default',
      // 优化：启用虚拟滚动时保持选中状态
      reserve: true,
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

onBeforeUnmount(() => {
  if (tenantQueryFrame !== null) {
    cancelAnimationFrame(tenantQueryFrame);
    tenantQueryFrame = null;
  }
  if (deferredClearTimer !== null) {
    clearTimeout(deferredClearTimer);
    deferredClearTimer = null;
  }
});

async function loadArticleList(queryParams: {
  status?: ArticleStatus;
  source_name?: string;
  keyword?: string;
  date_from?: string;
  date_to?: string;
  limit: number;
  offset: number;
}) {
  if (!selectedTenant.value) {
    return await fetchArticlesAggregate(queryParams);
  }

  return await fetchArticles({
    tenant_schema: selectedTenant.value,
    ...queryParams,
  });
}

async function clearGridSelection() {
  await nextTick();
  const vxeGrid = (gridRef.value as any)?.getTableInstance?.() || (gridApi.grid as any);
  if (vxeGrid?.clearCheckboxRow) {
    await vxeGrid.clearCheckboxRow();
  } else if (vxeGrid?.setCheckboxRow) {
    await vxeGrid.setCheckboxRow([], false);
  }
  if (typeof vxeGrid?.clearCheckboxReserve === 'function') {
    await vxeGrid.clearCheckboxReserve();
  }
}

function clearGridSelectionDeferred() {
  if (deferredClearTimer !== null) {
    clearTimeout(deferredClearTimer);
  }
  deferredClearTimer = setTimeout(() => {
    deferredClearTimer = null;
    void clearGridSelection();
  }, 0);
}

function showBatchResult(type: 'error' | 'success' | 'warning', content: string, duration = 6) {
  if (batchProcessing.value) {
    pendingBatchResult = { type, content, duration };
    return;
  }
  message.open({
    type,
    content,
    duration,
  });
}

function flushPendingBatchResult() {
  if (!pendingBatchResult) return;
  const result = pendingBatchResult;
  pendingBatchResult = null;
  message.open({
    type: result.type,
    content: result.content,
    duration: result.duration,
  });
}

function scheduleGridQuery() {
  void gridApi.query();
}

function runBatchTaskInModal(
  modalRef: { destroy: () => void; update: (config: Record<string, any>) => void } | null,
  task: () => Promise<void>,
) {
  if (batchProcessing.value) {
    return Promise.resolve();
  }
  modalRef?.update({
    okText: '批量执行中',
    okButtonProps: {
      loading: true,
    },
    cancelButtonProps: {
      disabled: true,
    },
  });

  return Promise.resolve()
    .then(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 0);
      });
      batchProcessing.value = true;
      await task();
    })
    .then(() => {
      modalRef?.destroy();
      flushPendingBatchResult();
      setTimeout(() => {
        clearGridSelectionDeferred();
        scheduleGridQuery();
      }, 150);
    })
    .catch((error) => {
      modalRef?.update({
        okText: '确定',
        okButtonProps: {
          loading: false,
        },
        cancelButtonProps: {
          disabled: false,
        },
      });
      return Promise.reject(error);
    })
    .finally(() => {
      batchProcessing.value = false;
    });
}

async function clearSelectionAndReload() {
  await gridApi.query();
  clearGridSelectionDeferred();
}

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
    delete: async () => {
      await deleteArticle(row.id, {
        tenant_schema: tenantSchema,
        reason: '手动删除',
      });
      message.success('文章已永久删除');
    },
  } as const;

  const action = actionMap[code as keyof typeof actionMap];
  if (!action) return;

  try {
    await action();
    if (code !== 'preview' && code !== 'detail') {
      scheduleGridQuery();
    }
  } catch (error: any) {
    // 错误提示由全局拦截器统一处理
    console.error('[Content] action failed', error);
  }
}

function handleTenantChange(value: SelectValue) {
  selectedTenant.value = (value as string) || undefined;

  if (tenantQueryFrame !== null) {
    cancelAnimationFrame(tenantQueryFrame);
  }

  tenantQueryFrame = requestAnimationFrame(async () => {
    try {
      await clearSelectionAndReload();
    } finally {
      tenantQueryFrame = null;
    }
  });
}

function getSelectedRowsSnapshot(): SelectedArticleRow[] {
  const vxeGrid = (gridRef.value as any)?.getTableInstance?.() || (gridApi.grid as any);
  const currentRecords: ArticleListItem[] =
    typeof vxeGrid?.getCheckboxRecords === 'function' ? vxeGrid.getCheckboxRecords() : [];
  const reserveRecords: ArticleListItem[] =
    typeof vxeGrid?.getCheckboxReserveRecords === 'function'
      ? vxeGrid.getCheckboxReserveRecords()
      : [];
  const merged = [...(currentRecords || []), ...(reserveRecords || [])];
  const uniqueRows = new Map<string, SelectedArticleRow>();
  for (const row of merged) {
    if (!row?.id) continue;
    uniqueRows.set(row.id, {
      id: row.id,
      tenant_schema: row.tenant_schema,
      status: row.status,
    });
  }
  return [...uniqueRows.values()];
}

function countStatusMismatch(rows: SelectedArticleRow[], expectedStatus: ArticleStatus) {
  let mismatch = 0;
  for (const row of rows) {
    if (row.status !== expectedStatus) {
      mismatch += 1;
    }
  }
  return mismatch;
}

// 批量解析（仅 crawled -> parsed）
async function handleBatchParse() {
  if (!canBatchParse.value || batchProcessing.value) return;
  if (!selectedTenant.value) {
    message.warning('请先选择所属区域');
    return;
  }
  const tenantSchema = selectedTenant.value;

  const selectedRows = getSelectedRowsSnapshot();
  if (selectedRows.length === 0) {
    message.warning('请先选择文章');
    return;
  }

  const mismatchCount = countStatusMismatch(selectedRows, 'crawled');
  if (mismatchCount > 0) {
    message.warning(`包含 ${mismatchCount} 篇非已抓取状态文章`);
    return;
  }

  let modalRef: ReturnType<typeof Modal.confirm> | null = null;
  modalRef = Modal.confirm({
    title: '确认批量解析',
    content: `已选择 ${selectedRows.length} 篇已抓取文章，确认批量解析？将生成 AST 结构和批注。`,
    transitionName: '',
    maskTransitionName: '',
    onOk: () => {
      void runBatchTaskInModal(modalRef, async () => {
        let totalSuccess = 0;
        let totalFailed = 0;
        const allFailures: { article_id: string; error: string }[] = [];

        const result = await batchParseArticles({
          tenant_schema: tenantSchema,
          article_ids: selectedRows.map((row) => row.id),
          reason: '批量解析',
        });
        totalSuccess += result.success_count;
        totalFailed += result.failed_count;
        if (result.failures?.length > 0) {
          allFailures.push(...result.failures);
        }

        if (totalSuccess > 0 && totalFailed > 0) {
          showBatchResult('warning', `批量解析完成：成功 ${totalSuccess} 篇，失败 ${totalFailed} 篇`);
        } else if (totalSuccess > 0) {
          showBatchResult('success', `成功解析 ${totalSuccess} 篇文章`);
        } else if (totalFailed > 0) {
          showBatchResult('error', `批量解析失败：${totalFailed} 篇全部失败`);
        }
        if (allFailures.length > 0) {
          const failureReasons = allFailures
            .map((f) => `${f.article_id?.slice(0, 8)}: ${f.error}`)
            .join('\n');
          message.warning(`部分文章解析失败:\n${failureReasons}`, 5);
        }
      });
      return HOLD_CONFIRM_MODAL_OPEN;
    },
  });
}

// 批量发布
async function handleBatchPublish() {
  if (!canBatchPublish.value || batchProcessing.value) return;
  if (!selectedTenant.value) {
    message.warning('请先选择所属区域');
    return;
  }
  const tenantSchema = selectedTenant.value;

  const selectedRows = getSelectedRowsSnapshot();
  if (selectedRows.length === 0) {
    message.warning('请先选择文章');
    return;
  }

  const mismatchCount = countStatusMismatch(selectedRows, 'parsed');
  if (mismatchCount > 0) {
    message.warning(`包含 ${mismatchCount} 篇非已解析状态文章`);
    return;
  }

  let modalRef: ReturnType<typeof Modal.confirm> | null = null;
  modalRef = Modal.confirm({
    title: '确认批量发布',
    content: `已选择 ${selectedRows.length} 篇文章，确认批量发布？`,
    transitionName: '',
    maskTransitionName: '',
    onOk: () => {
      void runBatchTaskInModal(modalRef, async () => {
        let totalSuccess = 0;
        let totalFailed = 0;
        const allFailures: { article_id: string; error: string }[] = [];

        const result = await batchPublishArticles({
          tenant_schema: tenantSchema,
          article_ids: selectedRows.map((row) => row.id),
          reason: '批量发布',
        });
        totalSuccess += result.success_count;
        totalFailed += result.failed_count;
        if (result.failures?.length > 0) {
          allFailures.push(...result.failures);
        }

        if (totalSuccess > 0 && totalFailed > 0) {
          showBatchResult('warning', `批量发布完成：成功 ${totalSuccess} 篇，失败 ${totalFailed} 篇`);
        } else if (totalSuccess > 0) {
          showBatchResult('success', `成功发布 ${totalSuccess} 篇文章`);
        } else if (totalFailed > 0) {
          showBatchResult('error', `批量发布失败：${totalFailed} 篇全部失败`);
        }
        if (allFailures.length > 0) {
          const failureReasons = allFailures
            .map((f) => `${f.article_id?.slice(0, 8)}: ${f.error}`)
            .join('\n');
          message.warning(`部分文章发布失败:\n${failureReasons}`, 5);
        }
      });
      return HOLD_CONFIRM_MODAL_OPEN;
    },
  });
}

// 批量归档
async function handleBatchArchive() {
  if (!canBatchArchive.value || batchProcessing.value) return;
  if (!selectedTenant.value) {
    message.warning('请先选择所属区域');
    return;
  }
  const tenantSchema = selectedTenant.value;

  const selectedRows = getSelectedRowsSnapshot();
  if (selectedRows.length === 0) {
    message.warning('请先选择文章');
    return;
  }

  const mismatchCount = countStatusMismatch(selectedRows, 'published');
  if (mismatchCount > 0) {
    message.warning(`包含 ${mismatchCount} 篇非已发布状态文章`);
    return;
  }

  let modalRef: ReturnType<typeof Modal.confirm> | null = null;
  modalRef = Modal.confirm({
    title: '确认批量归档',
    content: `已选择 ${selectedRows.length} 篇已发布文章，确认批量归档？`,
    okType: 'danger',
    transitionName: '',
    maskTransitionName: '',
    onOk: () => {
      void runBatchTaskInModal(modalRef, async () => {
        let totalSuccess = 0;
        let totalFailed = 0;
        const allFailures: { article_id: string; error: string }[] = [];

        const result = await batchArchiveArticles({
          tenant_schema: tenantSchema,
          article_ids: selectedRows.map((row) => row.id),
          reason: '批量归档',
        });
        totalSuccess += result.success_count;
        totalFailed += result.failed_count;
        if (result.failures?.length > 0) {
          allFailures.push(...result.failures);
        }

        if (totalSuccess > 0 && totalFailed > 0) {
          showBatchResult('warning', `批量归档完成：成功 ${totalSuccess} 篇，失败 ${totalFailed} 篇`);
        } else if (totalSuccess > 0) {
          showBatchResult('success', `成功归档 ${totalSuccess} 篇文章`);
        } else if (totalFailed > 0) {
          showBatchResult('error', `批量归档失败：${totalFailed} 篇全部失败`);
        }
        if (allFailures.length > 0) {
          const failureReasons = allFailures
            .map((f) => `${f.article_id?.slice(0, 8)}: ${f.error}`)
            .join('\n');
          message.warning(`部分文章归档失败:\n${failureReasons}`, 5);
        }
      });
      return HOLD_CONFIRM_MODAL_OPEN;
    },
  });
}

// 批量恢复
async function handleBatchRestore() {
  if (!canBatchRestore.value || batchProcessing.value) return;
  if (!selectedTenant.value) {
    message.warning('请先选择所属区域');
    return;
  }
  const tenantSchema = selectedTenant.value;

  const selectedRows = getSelectedRowsSnapshot();
  if (selectedRows.length === 0) {
    message.warning('请先选择文章');
    return;
  }

  const mismatchCount = countStatusMismatch(selectedRows, 'archived');
  if (mismatchCount > 0) {
    message.warning(`包含 ${mismatchCount} 篇非已归档状态文章`);
    return;
  }

  let modalRef: ReturnType<typeof Modal.confirm> | null = null;
  modalRef = Modal.confirm({
    title: '确认批量恢复',
    content: `已选择 ${selectedRows.length} 篇已归档文章，确认批量恢复为已发布状态？`,
    transitionName: '',
    maskTransitionName: '',
    onOk: () => {
      void runBatchTaskInModal(modalRef, async () => {
        let totalSuccess = 0;
        let totalFailed = 0;
        const allFailures: { article_id: string; error: string }[] = [];

        const result = await batchRestoreArticles({
          tenant_schema: tenantSchema,
          article_ids: selectedRows.map((row) => row.id),
          reason: '批量恢复',
        });
        totalSuccess += result.success_count;
        totalFailed += result.failed_count;
        if (result.failures?.length > 0) {
          allFailures.push(...result.failures);
        }

        if (totalSuccess > 0 && totalFailed > 0) {
          showBatchResult('warning', `批量恢复完成：成功 ${totalSuccess} 篇，失败 ${totalFailed} 篇`);
        } else if (totalSuccess > 0) {
          showBatchResult('success', `成功恢复 ${totalSuccess} 篇文章`);
        } else if (totalFailed > 0) {
          showBatchResult('error', `批量恢复失败：${totalFailed} 篇全部失败`);
        }
        if (allFailures.length > 0) {
          const failureReasons = allFailures
            .map((f) => `${f.article_id?.slice(0, 8)}: ${f.error}`)
            .join('\n');
          message.warning(`部分文章恢复失败:\n${failureReasons}`, 5);
        }
      });
      return HOLD_CONFIRM_MODAL_OPEN;
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

/* 批量归档 - 橙色（与详情页归档按钮颜色一致） */
.batch-btn-archive {
  @apply cursor-pointer opacity-100 font-medium bg-orange-50 border-orange-500 text-orange-600;
}
.batch-btn-archive:hover {
  @apply bg-orange-100 border-orange-600 shadow-sm;
}

/* 批量恢复 - 青绿色 */
.batch-btn-restore {
  @apply cursor-pointer opacity-100 font-medium bg-teal-50 border-teal-500 text-teal-600;
}
.batch-btn-restore:hover {
  @apply bg-teal-100 border-teal-600 shadow-sm;
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
            <span class="text-sm text-gray-400">
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

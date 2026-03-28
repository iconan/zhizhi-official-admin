<script lang="ts" setup>
import type { OnActionClickFn, VxeTableGridOptions } from '#/adapter/vxe-table';

import { Page, useVbenDrawer } from '@vben/common-ui';
import { Select, Tag, Tooltip, message } from 'ant-design-vue';
import type { SelectValue } from 'ant-design-vue/es/select';
import { Copy } from 'lucide-vue-next';
import dayjs from 'dayjs';
import { computed, nextTick, onMounted, ref } from 'vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
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
  published: 'success',
  archived: 'warning',
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
          code: 'publish',
          text: '发布',
          disabled: (row: ArticleListItem) => row.status !== 'parsed',
          popconfirm: true,
          confirmMessage: '确认发布该文章？',
        },
        {
          code: 'archive',
          text: '归档',
          disabled: (row: ArticleListItem) => !['crawled', 'parsed', 'published'].includes(row.status),
          popconfirm: true,
          confirmMessage: '确认归档该文章？',
        },
        {
          code: 'restore',
          text: '恢复',
          disabled: (row: ArticleListItem) => row.status !== 'archived',
          popconfirm: true,
          confirmMessage: '确认将文章恢复为已抓取状态？',
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

const currentTenantSchema = computed(() => {
  if (!selectedTenant.value) return null;
  return selectedTenant.value;
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
                    // 为每个文章添加 tenant_schema
                    result.items = result.items.map((item) => ({
                      ...item,
                      tenant_schema: tenant.schema_name,
                    }));
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
              // 为每个文章添加 tenant_schema
              const itemsWithSchema = items.map((item) => ({
                ...item,
                tenant_schema: selectedTenant.value,
              }));
              return { items: itemsWithSchema, total, has_more } as any;
            }
          } catch (error) {
            console.error('[Content] fetch articles failed', error);
            message.error('加载文章列表失败，请稍后重试');
            return { items: [], total: 0 };
          }
        },
      },
    },
    rowConfig: { keyField: 'id' },
    toolbarConfig: { custom: true, export: false, refresh: true, zoom: true },
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

async function loadSources() {
  try {
    const { items } = await fetchWebSources();
    sourceOptions.value = items.map((s: EtlWebSourceItem) => ({
      label: s.display_name || s.key,
      value: s.key,
    }));
  } catch (error) {
    console.error('[Content] load sources failed', error);
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
    console.error('[Content] load tenants failed', error);
    message.error('加载区域列表失败');
  } finally {
    loadingTenants.value = false;
  }
}

async function onActionClick({ code, row }: Parameters<OnActionClickFn<ArticleListItem>>[0]) {
  const tenantSchema = row.tenant_schema || currentTenantSchema.value || '';
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
        target_status: 'crawled',
        reason: '恢复文章',
      });
      message.success('文章已恢复为已抓取状态');
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
    console.error('[Content] article action failed', code, error);
    const messageText = error?.response?.data?.message || error?.message || '';
    if (messageText.includes('40901')) {
      message.warning('当前状态不可操作，请刷新后重试');
    } else if (messageText.includes('40401')) {
      message.warning('文章不存在或已被删除');
    } else if (messageText.includes('50010')) {
      message.warning('下游依赖异常，请稍后重试');
    } else {
      message.error('操作失败，请稍后重试');
    }
  }
}

function handleTenantChange(value: SelectValue) {
  selectedTenant.value = value as string;
  // 自动刷新列表
  gridApi.query();
}

onMounted(async () => {
  await nextTick();
  await Promise.all([loadSources(), loadTenants()]);
  // 租户加载完成后自动查询数据
  await gridApi.query();
});
</script>

<template>
  <Page auto-content-height>
    <DetailDrawer @success="gridApi.query" />
    <PreviewDrawer />
    <Grid table-title="文章管理">
      <template #toolbar-tools>
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

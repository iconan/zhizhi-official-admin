<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';

import { Page, useVbenDrawer } from '@vben/common-ui';
import { Button, Tag, Tooltip, message } from 'ant-design-vue';
import { Copy } from 'lucide-vue-next';
import { nextTick, onBeforeUnmount, onMounted } from 'vue';
import { useRouter } from 'vue-router';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { fetchJobs } from '#/api/seed_discovery';

import RunDrawer from './modules/run-drawer.vue';

const POLL_INTERVAL = 10_000;
const router = useRouter();
let pollTimer: null | ReturnType<typeof setInterval> = null;

const [RunDrawerView, runDrawerApi] = useVbenDrawer({
  connectedComponent: RunDrawer,
  destroyOnClose: true,
});

const STATUS_LABEL: Record<string, string> = {
  queued: '排队中',
  running: '执行中',
  succeeded: '已完成',
  failed: '失败',
};
const STATUS_COLOR: Record<string, string> = {
  queued: 'processing',
  running: 'blue',
  succeeded: 'success',
  failed: 'error',
};

const SOURCE_LABEL: Record<string, string> = {
  banyuetan: '半月谈',
  xinhua: '新华社',
  xuexiqiangguo: '学习强国',
  people_daily: '人民日报',
  qiushi: '求是',
};

function formatSources(sources?: string[]) {
  if (!sources?.length) return '--';
  return sources.map((s) => SOURCE_LABEL[s] ?? s).join('、');
}

function copyToClipboard(text?: string) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => message.success('已复制'));
}

const columns: VxeTableGridOptions['columns'] = [
  { field: 'tenant_schema', title: '关联区域', minWidth: 140 },
  {
    field: 'sources',
    title: '官媒',
    minWidth: 180,
    formatter: ({ cellValue }) => formatSources(cellValue as string[]),
  },
  {
    field: 'topics',
    title: '考点',
    minWidth: 220,
    formatter: ({ cellValue }) => (cellValue as string[])?.join('、') || '--',
  },
  {
    field: 'date_from',
    title: '日期区间',
    minWidth: 200,
    formatter: ({ row }) => `${row.date_from ?? '--'} ~ ${row.date_to ?? '--'}`,
  },
  { field: 'limit_per_source', title: '单家上限', width: 100 },
  { field: 'seed_count', title: '已发现', width: 100 },
  { field: 'status', title: '状态', width: 100, slots: { default: 'status' } },
  { field: 'enqueued_at', title: '入队时间', minWidth: 180 },
  { field: 'started_at', title: '开始时间', minWidth: 180 },
  { field: 'ended_at', title: '结束时间', minWidth: 180 },
  {
    field: 'job_id',
    title: '任务 ID',
    minWidth: 180,
    slots: { default: 'job-id' },
  },
  {
    title: '操作',
    field: 'operation',
    width: 220,
    fixed: 'right',
    showOverflow: false,
    slots: { default: 'operation' },
  },
];

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
        query: async ({ page }: any) => {
          try {
            const limit = page?.pageSize || 20;
            const offset = ((page?.currentPage || 1) - 1) * limit;
            const { items, total } = await fetchJobs({ limit, offset });
            return { items, total } as any;
          } catch (error) {
            console.error('[SeedDiscovery] fetch jobs failed', error);
            message.error('加载任务列表失败');
            return { items: [], total: 0 } as any;
          }
        },
      },
    },
    rowConfig: { keyField: 'job_id' },
    toolbarConfig: { custom: false, export: false, refresh: true, zoom: true },
  },
});

function openRunDrawer() {
  runDrawerApi.setData({}).open();
}

function viewSeeds(row: Record<string, any>) {
  router.push({
    path: '/seed-discovery/seeds',
    query: { job_id: row.job_id },
  });
}

async function refresh() {
  await gridApi.query();
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (!document.hidden) refresh();
  }, POLL_INTERVAL);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function handleVisibilityChange() {
  if (!document.hidden) refresh();
}

onMounted(async () => {
  await nextTick();
  await refresh();
  startPolling();
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onBeforeUnmount(() => {
  stopPolling();
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});
</script>

<template>
  <Page auto-content-height>
    <RunDrawerView @success="refresh" />
    <Grid table-title="种子发现任务">
      <template #toolbar-tools>
        <Button type="primary" @click="openRunDrawer">触发发现任务</Button>
      </template>
      <template #status="{ row }">
        <Tag :color="STATUS_COLOR[row.status ?? ''] ?? 'default'">
          {{ STATUS_LABEL[row.status ?? ''] ?? row.status ?? '--' }}
        </Tag>
      </template>
      <template #job-id="{ row }">
        <Tooltip :title="row.job_id">
          <span
            class="cursor-pointer text-primary hover:underline"
            @click="copyToClipboard(row.job_id)"
          >
            {{ row.job_id?.slice(0, 16) }}...
            <Copy class="ml-1 inline-block h-3 w-3" />
          </span>
        </Tooltip>
      </template>
      <template #operation="{ row }">
        <Button size="small" type="link" @click="viewSeeds(row)">查看候选 URL</Button>
      </template>
    </Grid>
  </Page>
</template>

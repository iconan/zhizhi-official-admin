<script lang="ts" setup>
import type { OnActionClickFn, VxeTableGridOptions } from '#/adapter/vxe-table';

import { Page, useVbenDrawer } from '@vben/common-ui';
import { Button, Card, Col, Modal, Row, Statistic, Tag, Tooltip, message } from 'ant-design-vue';
import { Copy } from 'lucide-vue-next';
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  cancelJob,
  fetchJobs,
  fetchMetricsSummary,
  replayDeadLetter,
  replayEmbedding,
  replayJob,
  resumeJob,
  type JobItem,
  type JobStatus,
  type MetricsSummary,
} from '#/api/etl/jobs';
import { fetchWebSources, type EtlWebSourceItem } from '#/api/etl/sources';
import { fetchTenants, type IamTenant } from '#/api/iam/tenant';

import CreateDrawer from './modules/create-drawer.vue';

const POLL_INTERVAL = 10_000;
const metrics = ref<MetricsSummary | null>(null);
const tenantMap = ref<Record<string, IamTenant>>({});
const tenantOptions = ref<{ label: string; value: string }[]>([]);
const sourceMap = ref<Record<string, string>>({});
let pollTimer: null | ReturnType<typeof setInterval> = null;
const [CreateDrawerView, createDrawerApi] = useVbenDrawer({
  connectedComponent: CreateDrawer,
  destroyOnClose: true,
});

const statusLabelMap: Record<string, string> = {
  canceled: '已取消',
  deferred: '延迟中',
  failed: '失败',
  finished: '已完成',
  queued: '排队中',
  started: '执行中',
  stopped: '已停止',
};

const statusColorMap: Record<string, string> = {
  canceled: 'default',
  deferred: 'gold',
  failed: 'error',
  finished: 'success',
  queued: 'processing',
  started: 'blue',
  stopped: 'warning',
};

const alertLabelMap: Record<string, string> = {
  critical: '严重',
  normal: '正常',
  warning: '告警',
};

const jobTypeLabelMap: Record<string, string> = {
  article_batch_parse: '文章批量解析',
  web_collect: '网页采集',
};

function formatPercent(value?: number) {
  if (value === null || value === undefined) return '--';
  return `${(value * 100).toFixed(1)}%`;
}

function formatProgress(row: JobItem): string {
  // 网页采集：优先显示当前阶段的 x/y；进入 ingest 阶段后附带新增/更新计数
  if (row.job_type === 'web_collect') {
    const stage = row.web_collect_stage;
    const fetchDone = row.web_collect_fetch_completed;
    const fetchTotal = row.web_collect_fetch_total;
    const ingestDone = row.web_collect_ingest_completed;
    const ingestTotal = row.web_collect_ingest_total;
    const ins = row.inserted_articles;
    const upd = row.updated_articles;

    const insUpdSuffix =
      ins != null || upd != null ? ` · 新增${ins ?? 0}/更新${upd ?? 0}` : '';

    if (stage === 'fetching' && fetchTotal != null) {
      return `抓取 ${fetchDone ?? 0}/${fetchTotal}`;
    }
    if (stage === 'ingesting' && ingestTotal != null) {
      return `解析 ${ingestDone ?? 0}/${ingestTotal}${insUpdSuffix}`;
    }
    // 终态：优先显示解析总数，其次抓取总数
    if (ingestTotal != null) {
      return `解析 ${ingestDone ?? 0}/${ingestTotal}${insUpdSuffix}`;
    }
    if (fetchTotal != null) {
      return `抓取 ${fetchDone ?? 0}/${fetchTotal}`;
    }
    return '--';
  }

  // 文章批量解析：沿用已有 batch_parse_* 字段
  if (row.job_type === 'article_batch_parse') {
    const total = (row as any).batch_parse_total;
    const done = (row as any).batch_parse_processed_count;
    if (total != null) return `解析 ${done ?? 0}/${total}`;
  }

  return '--';
}

function canCancel(status?: JobStatus | string) {
  return ['queued', 'deferred', 'started'].includes(status ?? '');
}

function canResume(status?: JobStatus | string) {
  return ['queued', 'deferred', 'failed', 'canceled', 'stopped'].includes(status ?? '');
}

function canReplay(status?: JobStatus | string) {
  return status === 'failed';
}

function canReplayEmbedding(row: JobItem) {
  return !!(row.inserted_materials || row.embedded_materials || row.embedding_job_id);
}

const columns: VxeTableGridOptions['columns'] = [
  {
    field: 'tenant_schema',
    title: '所属区域',
    minWidth: 130,
    formatter: ({ cellValue }: { cellValue?: string }) => {
      const tenant = tenantMap.value[cellValue ?? ''];
      if (tenant) {
        return `${tenant.name}`;
      }
      return cellValue || '--';
    },
  },
  {
    field: 'source_name',
    title: '来源名称',
    minWidth: 140,
    formatter: ({ cellValue }: { cellValue?: string }) => {
      const displayName = sourceMap.value[cellValue ?? ''];
      return displayName || cellValue || '--';
    },
  },
  { field: 'chunk_size', title: '分块大小', width: 100 },
  {
    field: 'extractor_strategy',
    title: '提取策略',
    minWidth: 140,
    formatter: ({ cellValue }: { cellValue?: string }) => {
      const strategyMap: Record<string, string> = {
        hybrid: '混合策略',
        managed_first: '托管优先',
        rules_only: '仅规则解析',
      };
      return strategyMap[cellValue ?? ''] || cellValue || '--';
    },
  },
  {
    field: 'job_type',
    title: '任务类型',
    minWidth: 160,
    formatter: ({ cellValue }) => {
      return jobTypeLabelMap[cellValue ?? ''] || cellValue || '--';
    },
  },
  {
    field: 'job_source',
    title: '任务来源',
    width: 120,
    formatter: ({ cellValue }: { cellValue?: string }) => {
      const sourceMap: Record<string, string> = {
        excel_import: 'Excel导入',
        manual_create: '手动创建',
        schedule_run: '调度执行',
        seed_discovery: '种子发现',
      };
      return sourceMap[cellValue ?? ''] || cellValue || '--';
    },
  },
  { field: 'status', title: '状态', width: 100, slots: { default: 'status' } },
  { field: 'progress', title: '进度', width: 220, slots: { default: 'progress' } },
  { field: 'alert_level', title: '风险等级', width: 100, slots: { default: 'alertLevel' } },
  { field: 'quality_score_avg', title: '质量均分', width: 100 },
  { field: 'low_quality_ratio', title: '低质占比', width: 100, slots: { default: 'lowQualityRatio' } },
  {
    field: 'embedding_dead_letter_ratio',
    title: '死信占比',
    width: 100,
    slots: { default: 'deadLetterRatio' },
  },
  { field: 's2_annotations_count', title: 'S2 批注数', width: 100 },
  { field: 's2_invalid_ratio', title: 'S2 无效率', width: 100, slots: { default: 's2InvalidRatio' } },
  {
    field: 's2_deduplicated_ratio',
    title: 'S2 去重率',
    width: 100,
    slots: { default: 's2DeduplicatedRatio' },
  },
  { field: 'enqueued_at', title: '入队时间', minWidth: 150 },
  { field: 'started_at', title: '开始时间', minWidth: 150 },
  { field: 'ended_at', title: '结束时间', minWidth: 150 },
  {
    field: 'job_id',
    title: '任务 ID',
    minWidth: 150,
    slots: { default: 'job-id' },
  },
  {
    title: '操作',
    field: 'operation',
    width: 360,
    fixed: 'right',
    showOverflow: false,
    cellRender: {
      attrs: {
        onClick: onActionClick,
      },
      name: 'CellOperation',
      options: [
        {
          code: 'cancel',
          text: '取消任务',
          disabled: (row: JobItem) => !canCancel(row.status),
          popconfirm: true,
          confirmMessage: '确认取消当前任务？',
        },
        {
          code: 'resume',
          text: '恢复任务',
          disabled: (row: JobItem) => !canResume(row.status),
        },
        {
          code: 'replay',
          text: '重跑任务',
          disabled: (row: JobItem) => !canReplay(row.status),
        },
        {
          code: 'replayEmbedding',
          text: '重跑 Embedding',
          disabled: (row: JobItem) => !canReplayEmbedding(row),
        },
      ],
    },
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
        query: async ({ page }: any, formValues: any) => {
          try {
            const limit = page?.pageSize || 20;
            const offset = ((page?.currentPage || 1) - 1) * limit;
            const { items, total } = await fetchJobs({
              alert_level: formValues?.alert_level || undefined,
              has_dead_letter:
                formValues?.has_dead_letter === undefined || formValues?.has_dead_letter === null
                  ? undefined
                  : formValues.has_dead_letter,
              job_type: formValues?.job_type || undefined,
              limit,
              offset,
              quality_score_lt: formValues?.quality_score_lt || undefined,
              status: formValues?.status || undefined,
              tenant_schema: formValues?.tenant_schema || undefined,
              keyword: formValues?.keyword || undefined,
            });
            return { items, total } as any;
          } catch (error) {
            console.error('[ETK] fetch jobs failed', error);
            message.error('加载任务列表失败，请稍后重试');
            return { items: [], total: 0 } as any;
          }
        },
      },
    },
    rowConfig: { keyField: 'job_id' },
    toolbarConfig: { custom: true, export: false, refresh: true, zoom: true },
  },
  formOptions: {
    submitOnChange: true,
    schema: [
      {
        component: 'Input',
        fieldName: 'keyword',
        label: '关键词',
        componentProps: { allowClear: true, placeholder: '任务 ID' },
      },
      {
        component: 'Select',
        fieldName: 'tenant_schema',
        label: '所属区域',
        componentProps: {
          allowClear: true,
          options: tenantOptions,
          showSearch: true,
          optionFilterProp: 'label',
          placeholder: '选择所属区域',
          style: { width: '100%' },
        },
      },
      {
        component: 'Select',
        fieldName: 'status',
        label: '状态',
        componentProps: {
          allowClear: true,
          options: [
            { label: '排队中', value: 'queued' },
            { label: '执行中', value: 'started' },
            { label: '延迟中', value: 'deferred' },
            { label: '失败', value: 'failed' },
            { label: '已完成', value: 'finished' },
            { label: '已取消', value: 'canceled' },
            { label: '已停止', value: 'stopped' },
          ],
          style: { width: '100%' },
        },
      },
      {
        component: 'Select',
        fieldName: 'job_type',
        label: '任务类型',
        componentProps: {
          allowClear: true,
          options: [
            { label: '网页采集', value: 'web_collect' },
          ],
          style: { width: '100%' },
        },
      },
      {
        component: 'Select',
        fieldName: 'has_dead_letter',
        label: '存在死信',
        componentProps: {
          allowClear: true,
          options: [
            { label: '是', value: true },
            { label: '否', value: false },
          ],
          style: { width: '100%' },
        },
      },
      {
        component: 'Input',
        fieldName: 'quality_score_lt',
        label: '质量阈值 <',
        componentProps: { allowClear: true, placeholder: '例如 45' },
      },
      {
        component: 'Select',
        fieldName: 'alert_level',
        label: '风险等级',
        componentProps: {
          allowClear: true,
          options: [
            { label: '正常', value: 'normal' },
            { label: '告警', value: 'warning' },
            { label: '严重', value: 'critical' },
          ],
          style: { width: '100%' },
        },
      },
    ],
  },
});

async function loadSources() {
  try {
    const { items } = await fetchWebSources();
    sourceMap.value = items.reduce(
      (acc, item: EtlWebSourceItem) => {
        acc[item.key] = item.display_name;
        return acc;
      },
      {} as Record<string, string>,
    );
  } catch (error) {
    console.error('[ETK] load sources failed', error);
  }
}

async function loadTenants() {
  try {
    const { items } = await fetchTenants({
      limit: 200,
      offset: 0,
      status: 'active',
    });
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
    console.error('[ETK] load tenants failed', error);
  }
}

async function loadMetrics() {
  try {
    metrics.value = await fetchMetricsSummary();
  } catch (error) {
    console.error('[ETK] fetch metrics failed', error);
  }
}

async function refreshAll() {
  await Promise.all([loadMetrics(), gridApi.query()]);
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (document.hidden) return;
    refreshAll();
  }, POLL_INTERVAL);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function openCreateDrawer() {
  createDrawerApi.setData({}).open();
}

function handleVisibilityChange() {
  if (!document.hidden) {
    refreshAll();
  }
}

async function triggerReplayDeadLetter() {
  Modal.confirm({
    title: '确认批量重放死信？',
    okType: 'danger',
    onOk: async () => {
      const hide = message.loading({ content: '正在重放死信...', duration: 0 });
      try {
        const res = await replayDeadLetter();
        const data = (res as any)?.data ?? res;
        const payload = data?.data ?? data ?? {};
        message.success(`已触发重放：${payload?.replayed_jobs ?? 0} 个任务，涉及 ${payload?.total_dead_letter_materials ?? 0} 条素材`);
        await refreshAll();
      } catch (error) {
        console.error('[ETK] replay dead letter failed', error);
      } finally {
        hide();
      }
    },
  });
}

function copyToClipboard(text: string | undefined) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    message.success('已复制到剪贴板');
  });
}

async function onActionClick({ code, row }: Parameters<OnActionClickFn<JobItem>>[0]) {
  const actionMap = {
    cancel: async () => {
      await cancelJob(row.job_id);
      message.success('取消成功');
    },
    replay: async () => {
      await replayJob(row.job_id);
      message.success('已触发重跑');
    },
    replayEmbedding: async () => {
      await replayEmbedding(row.job_id);
      message.success('已触发 Embedding 重跑');
    },
    resume: async () => {
      await resumeJob(row.job_id);
      message.success('恢复成功');
    },
  } as const;

  const action = actionMap[code as keyof typeof actionMap];
  if (!action) return;

  const hide = message.loading({ content: '处理中...', duration: 0 });
  try {
    await action();
    await refreshAll();
  } catch (error: any) {
    console.error('[ETK] job action failed', code, error);
  } finally {
    hide();
  }
}

onMounted(async () => {
  await nextTick();
  await Promise.all([loadSources(), loadTenants()]);
  await refreshAll();
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
    <CreateDrawerView @success="refreshAll" />
    <div class="mb-3">
      <Row :gutter="12">
        <Col :lg="4" :span="12">
          <Card size="small"><Statistic title="任务总数" :value="metrics?.total_jobs ?? 0" /></Card>
        </Col>
        <Col :lg="4" :span="12">
          <Card size="small"><Statistic title="告警任务" :value="metrics?.warning_jobs ?? 0" /></Card>
        </Col>
        <Col :lg="4" :span="12">
          <Card size="small"><Statistic title="严重任务" :value="metrics?.critical_jobs ?? 0" /></Card>
        </Col>
        <Col :lg="6" :span="12">
          <Card size="small"><Statistic title="平均质量分" :precision="1" :value="metrics?.avg_quality_score ?? 0" /></Card>
        </Col>
        <Col :lg="6" :span="24">
          <Card size="small">
            <Statistic title="平均死信占比" :value="formatPercent(metrics?.avg_dead_letter_ratio)" />
          </Card>
        </Col>
      </Row>
    </div>
    <Grid table-title="任务管理">
      <template #toolbar-tools>
        <Button danger ghost type="primary" @click="triggerReplayDeadLetter">批量死信重放</Button>
        <Button class="ml-2" type="primary" @click="openCreateDrawer">创建任务</Button>
      </template>
      <template #status="{ row }">
        <Tag :color="statusColorMap[row.status ?? ''] ?? 'default'">
          {{ statusLabelMap[row.status ?? ''] ?? row.status ?? '--' }}
        </Tag>
      </template>
      <template #progress="{ row }">
        {{ formatProgress(row) }}
      </template>
      <template #alertLevel="{ row }">
        <Tag
          v-if="row.alert_level"
          :class="{
            'bg-green-500 text-white border-green-500': row.alert_level === 'normal',
            'bg-yellow-500 text-white border-yellow-500': row.alert_level === 'warning',
            'bg-red-500 text-white border-red-500': row.alert_level === 'critical',
          }"
        >
          {{ alertLabelMap[row.alert_level] || row.alert_level }}
        </Tag>
        <span v-else>--</span>
      </template>
      <template #lowQualityRatio="{ row }">
        {{ formatPercent(row.low_quality_ratio) }}
      </template>
      <template #deadLetterRatio="{ row }">
        {{ formatPercent(row.embedding_dead_letter_ratio) }}
      </template>
      <template #s2InvalidRatio="{ row }">
        {{ formatPercent(row.s2_invalid_ratio) }}
      </template>
      <template #s2DeduplicatedRatio="{ row }">
        {{ formatPercent(row.s2_deduplicated_ratio) }}
      </template>
      <template #job-id="{ row }">
        <Tooltip :title="row.job_id">
          <span
            class="cursor-pointer text-primary hover:underline"
            @click="copyToClipboard(row.job_id)"
          >
            {{ row.job_id?.slice(0, 8) }}...
            <Copy class="ml-1 inline-block h-3 w-3" />
          </span>
        </Tooltip>
      </template>
    </Grid>
  </Page>
</template>

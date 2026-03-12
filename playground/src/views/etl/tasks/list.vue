<script lang="ts" setup>
import { Page } from '@vben/common-ui';
import { Button, Card, Col, Row, Statistic, message } from 'ant-design-vue';
import { nextTick, onMounted, ref } from 'vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { fetchJobs, fetchMetricsSummary, replayDeadLetter } from '#/api/etl/jobs';
import type { OnActionClickFn, VxeTableGridOptions } from '#/adapter/vxe-table';

interface EtkJob {
  job_id: string;
  name: string;
  status: string;
  source_type: 'csv' | 'web';
  last_run_at?: string;
  next_run_at?: string;
  created_at?: string;
}

interface MetricsSummary {
  total_jobs: number;
  running_jobs: number;
  failed_jobs: number;
  waiting_jobs: number;
}

const metrics = ref<MetricsSummary | null>(null);

const columns: VxeTableGridOptions['columns'] = [
  { field: 'name', title: '任务名称', minWidth: 200 },
  { field: 'status', title: '状态', minWidth: 120 },
  { field: 'source_type', title: '来源', minWidth: 120 },
  { field: 'last_run_at', title: '最近执行', minWidth: 180 },
  { field: 'next_run_at', title: '下次执行', minWidth: 180 },
  { field: 'created_at', title: '创建时间', minWidth: 180 },
  {
    title: '操作',
    field: 'operation',
    width: 180,
    fixed: 'right',
    cellRender: {
      name: 'CellOperation',
      options: ['edit', 'delete'],
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
              limit,
              offset,
              status: formValues?.status || undefined,
              source: formValues?.source_type || undefined,
              keyword: formValues?.keyword || undefined,
            });
            return { items, total } as any;
          } catch (error) {
            console.error('[ETK] fetch jobs failed', error);
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
        componentProps: { allowClear: true, placeholder: '任务名称/ID' },
      },
      {
        component: 'Select',
        fieldName: 'status',
        label: '状态',
        componentProps: {
          allowClear: true,
          options: [
            { label: '运行中', value: 'running' },
            { label: '等待', value: 'waiting' },
            { label: '失败', value: 'failed' },
            { label: '成功', value: 'success' },
          ],
          style: { width: '100%' },
        },
      },
      {
        component: 'Select',
        fieldName: 'source_type',
        label: '来源',
        componentProps: {
          allowClear: true,
          options: [
            { label: 'CSV 导入', value: 'csv' },
            { label: '网页采集', value: 'web' },
          ],
          style: { width: '100%' },
        },
      },
    ],
  },
});

async function loadMetrics() {
  try {
    const res = await fetchMetricsSummary();
    const data = (res as any)?.data ?? res;
    const payload = data?.data ?? data ?? {};
    metrics.value = {
      total_jobs: payload?.total_jobs ?? 0,
      running_jobs: payload?.running_jobs ?? 0,
      failed_jobs: payload?.failed_jobs ?? 0,
      waiting_jobs: payload?.waiting_jobs ?? 0,
    } as MetricsSummary;
  } catch (error) {
    console.error('[ETK] fetch metrics failed', error);
  }
}

async function replayDeadLetter() {
  const hide = message.loading({ content: '正在重放死信...', duration: 0 });
  try {
    await replayDeadLetter();
    message.success('触发重放成功');
    await gridApi.query();
  } catch (error) {
    console.error('[ETK] replay dead letter failed', error);
    message.error('重放失败');
  } finally {
    hide();
  }
}

onMounted(async () => {
  await Promise.all([loadMetrics(), nextTick()]);
  gridApi.query();
});
</script>

<template>
  <Page auto-content-height>
    <div class="mb-3">
      <Row :gutter="12">
        <Col :span="6">
          <Card size="small"><Statistic title="任务总数" :value="metrics?.total_jobs ?? 0" /></Card>
        </Col>
        <Col :span="6">
          <Card size="small"><Statistic title="运行中" :value="metrics?.running_jobs ?? 0" /></Card>
        </Col>
        <Col :span="6">
          <Card size="small"><Statistic title="等待" :value="metrics?.waiting_jobs ?? 0" /></Card>
        </Col>
        <Col :span="6">
          <Card size="small"><Statistic title="失败" :value="metrics?.failed_jobs ?? 0" /></Card>
        </Col>
      </Row>
    </div>
    <Grid table-title="任务管理">
      <template #toolbar-tools>
        <Button type="primary" danger ghost @click="replayDeadLetter">批量死信重放</Button>
        <Button type="primary" class="ml-2" @click="$router.push('/etl/tasks/create')">创建任务</Button>
      </template>
    </Grid>
  </Page>
</template>

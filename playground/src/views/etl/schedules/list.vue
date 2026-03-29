<script lang="tsx" setup>
import type { SelectProps } from 'ant-design-vue';

import { Page } from '@vben/common-ui';
import { Button, Modal, Tag, message } from 'ant-design-vue';
import { nextTick, onMounted, ref } from 'vue';

import { useVbenForm, z } from '#/adapter/form';
import { useVbenVxeGrid } from '#/adapter/vxe-table';
import type { OnActionClickFn, VxeTableGridOptions } from '#/adapter/vxe-table';
import {
  createSchedule,
  deleteSchedule,
  fetchSchedules,
  runScheduleNow,
  triggerDueSchedules,
  updateSchedule,
  type ScheduleInput,
  type ScheduleItem,
} from '#/api/etl/schedules';
import { fetchWebSources, type EtlWebSourceItem } from '#/api/etl/sources';
import type { ExtractorStrategy } from '#/api/etl/jobs';

const defaultChunkSize = 320;
const defaultSourceName = 'xinhua';
const extractorStrategyOptions = [
  { label: '混合策略（hybrid）', value: 'hybrid' },
  { label: '托管优先（managed_first）', value: 'managed_first' },
  { label: '仅规则解析（rules_only）', value: 'rules_only' },
];

const sourceOptions = ref<SelectProps['options']>([]);
const loadingSources = ref(false);

function parseSeedUrls(value?: string) {
  return (value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toSeedUrlsText(value?: string[]) {
  return value?.join('\n') || '';
}

function resolveDefaultSourceName() {
  return (sourceOptions.value?.[0]?.value as string) || defaultSourceName;
}

function normalizeSchedulePayload(values: Record<string, any>): ScheduleInput {
  return {
    chunk_size: Number(values.chunk_size || defaultChunkSize),
    enabled: values.enabled !== false,
    extractor_strategy: (values.extractor_strategy || 'hybrid') as ExtractorStrategy,
    interval_minutes: Number(values.interval_minutes || 60),
    name: values.name,
    seed_urls: parseSeedUrls(values.seed_urls_text),
    source_name: values.source_name || resolveDefaultSourceName(),
    tenant_schema: values.tenant_schema,
  };
}

async function loadSourceOptions() {
  loadingSources.value = true;
  try {
    const { items } = await fetchWebSources();
    sourceOptions.value = items.map((item: EtlWebSourceItem) => ({
      label: item.display_name,
      value: item.key,
    }));
  } catch (error) {
    console.error('[ETK] load web sources failed', error);
  } finally {
    loadingSources.value = false;
  }
}

async function ensureSourceOptionsLoaded() {
  if (!sourceOptions.value.length && !loadingSources.value) {
    await loadSourceOptions();
  }
}

const [ScheduleForm, scheduleFormApi] = useVbenForm({
  showDefaultActions: false,
  schema: [
    {
      component: 'Input',
      fieldName: 'name',
      label: '调度名称',
      rules: z.string({ required_error: '请输入名称' }).min(1, '请输入名称').max(200, '过长'),
    },
    {
      component: 'Input',
      fieldName: 'tenant_schema',
      label: '所属区域',
      rules: z.string({ required_error: '请输入所属区域' }).min(1, '请输入所属区域'),
    },
    {
      component: 'Select',
      fieldName: 'source_name',
      label: '来源名称',
      componentProps: {
        allowClear: false,
        loading: loadingSources,
        options: sourceOptions,
        placeholder: '请选择来源名称',
      },
      rules: z.string({ required_error: '请选择来源名称' }).min(1, '请选择来源名称'),
    },
    {
      component: 'Textarea',
      fieldName: 'seed_urls_text',
      label: '起始 URL 列表',
      componentProps: { rows: 4 },
      rules: z.string({ required_error: '请至少输入一条起始 URL' }).min(1, '请至少输入一条起始 URL'),
    },
    {
      component: 'Input',
      fieldName: 'chunk_size',
      label: '分块大小',
      componentProps: { type: 'number' },
      rules: z.coerce.number().min(80, '最小为 80').max(1200, '最大为 1200'),
    },
    {
      component: 'Select',
      fieldName: 'extractor_strategy',
      label: '提取策略',
      defaultValue: 'hybrid',
      componentProps: {
        options: extractorStrategyOptions,
      },
      rules: z.string({ required_error: '请选择提取策略' }),
    },
    {
      component: 'Input',
      fieldName: 'interval_minutes',
      label: '执行间隔（分钟）',
      componentProps: { type: 'number' },
      rules: z.coerce.number().min(1, '最小为 1').max(10080, '过大'),
    },
    {
      component: 'Select',
      fieldName: 'enabled',
      label: '启用状态',
      defaultValue: true,
      componentProps: {
        options: [
          { label: '启用', value: true },
          { label: '停用', value: false },
        ],
      },
      rules: z.boolean(),
    },
    {
      component: 'Input',
      fieldName: 'tip',
      label: '填写说明',
      componentProps: { disabled: true, placeholder: 'seed_urls 支持每行一个 URL，run/trigger-due 后可回到任务列表观察' },
      dependencies: {
        show: () => false,
        triggerFields: ['name'],
      },
    },
  ],
});

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: {
    columns: [
      { field: 'name', title: '调度名称', minWidth: 160 },
      { field: 'tenant_schema', title: '所属区域', minWidth: 130 },
      { field: 'source_name', title: '来源名称', minWidth: 120 },
      { field: 'chunk_size', title: '分块大小', width: 100 },
      { field: 'extractor_strategy', title: '提取策略', minWidth: 140 },
      { field: 'interval_minutes', title: '间隔(分钟)', width: 100 },
      {
        field: 'enabled',
        title: '状态',
        width: 100,
        slots: { default: 'enabled' },
      },
      { field: 'last_run_at', title: '最近执行', minWidth: 160 },
      { field: 'next_run_at', title: '下次执行', minWidth: 160 },
      { field: 'created_at', title: '创建时间', minWidth: 160 },
      {
        title: '操作',
        field: 'operation',
        width: 260,
        fixed: 'right',
        showOverflow: false,
        cellRender: {
          attrs: {
            onClick: onActionClick,
          },
          name: 'CellOperation',
          options: [
            { code: 'run', text: '立即运行' },
            { code: 'toggleEnabled', text: '切换启用' },
            'edit',
            'delete',
          ],
        },
      },
    ],
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
            const { items, total } = await fetchSchedules({ limit, offset });
            return { items, total } as any;
          } catch (error) {
            console.error('[ETK] fetch schedules failed', error);
            message.error('加载调度列表失败，请稍后重试');
            return { items: [], total: 0 } as any;
          }
        },
      },
    },
    rowConfig: { keyField: 'schedule_id' },
    toolbarConfig: { custom: true, export: false, refresh: true, zoom: true },
  } as VxeTableGridOptions,
});

async function onCreate() {
  await ensureSourceOptionsLoaded();
  scheduleFormApi.resetForm();
  scheduleFormApi.setValues({
    chunk_size: defaultChunkSize,
    enabled: true,
    extractor_strategy: 'hybrid',
    interval_minutes: 60,
    source_name: resolveDefaultSourceName(),
  });
  Modal.confirm({
    title: '新增调度',
    icon: null,
    content: () => <ScheduleForm layout="vertical" class="pt-2" />, // jsx
    okText: '保存',
    onOk: async () => {
      const { valid } = await scheduleFormApi.validate();
      if (!valid) return Promise.reject();
      const values = await scheduleFormApi.getValues<Record<string, any>>();
      await createSchedule(normalizeSchedulePayload(values));
      message.success('创建成功');
      await gridApi.query();
    },
    width: 720,
  });
}

async function onActionClick({ code, row }: Parameters<OnActionClickFn<ScheduleItem>>[0]) {
  switch (code) {
    case 'edit':
      await ensureSourceOptionsLoaded();
      scheduleFormApi.resetForm();
      scheduleFormApi.setValues({
        chunk_size: row.chunk_size ?? defaultChunkSize,
        enabled: row.enabled ?? true,
        extractor_strategy: row.extractor_strategy ?? 'hybrid',
        interval_minutes: row.interval_minutes ?? 60,
        name: row.name,
        seed_urls_text: toSeedUrlsText(row.seed_urls),
        source_name: row.source_name ?? resolveDefaultSourceName(),
        tenant_schema: row.tenant_schema,
      });
      Modal.confirm({
        title: '编辑调度',
        icon: null,
        content: () => <ScheduleForm layout="vertical" class="pt-2" />, // jsx
        okText: '保存',
        onOk: async () => {
          const { valid } = await scheduleFormApi.validate();
          if (!valid) return Promise.reject();
          const values = await scheduleFormApi.getValues<Record<string, any>>();
          await updateSchedule(row.schedule_id, normalizeSchedulePayload(values));
          message.success('更新成功');
          await gridApi.query();
        },
        width: 720,
      });
      break;
    case 'delete':
      Modal.confirm({
        title: '确认删除该调度？',
        okType: 'danger',
        onOk: async () => {
          await deleteSchedule(row.schedule_id);
          message.success('删除成功');
          await gridApi.query();
        },
      });
      break;
    case 'toggleEnabled':
      toggleEnabled(row);
      break;
    case 'run':
      runNow(row);
      break;
    default:
      break;
  }
}

async function toggleEnabled(row: ScheduleItem) {
  const hide = message.loading({ content: '切换状态中...', duration: 0 });
  try {
    await updateSchedule(row.schedule_id, { enabled: !row.enabled });
    message.success('状态已更新');
    await gridApi.query();
  } catch (error) {
    // 错误提示由全局拦截器统一处理
    console.error('[ETK] toggle schedule enabled failed', error);
  } finally {
    hide();
  }
}

async function runNow(row: ScheduleItem) {
  const hide = message.loading({ content: '正在触发运行...', duration: 0 });
  try {
    await runScheduleNow(row.schedule_id);
    message.success('已触发');
    await gridApi.query();
  } catch (error) {
    // 错误提示由全局拦截器统一处理
    console.error('[ETK] run schedule now failed', error);
  } finally {
    hide();
  }
}

async function triggerDue() {
  const hide = message.loading({ content: '正在触发到期任务...', duration: 0 });
  try {
    const res = await triggerDueSchedules(20);
    const data = (res as any)?.data ?? res;
    const payload = data?.data ?? data ?? {};
    message.success(`已触发 ${payload?.triggered ?? 0} 个到期调度`);
    await gridApi.query();
  } catch (error) {
    // 错误提示由全局拦截器统一处理
    console.error('[ETK] trigger due schedules failed', error);
  } finally {
    hide();
  }
}

onMounted(() => {
  void loadSourceOptions();
  nextTick(() => gridApi.query());
});
</script>

<template>
  <Page auto-content-height>
    <Grid table-title="定时采集">
      <template #toolbar-tools>
        <Button type="primary" @click="onCreate">新增调度</Button>
        <Button class="ml-2" @click="triggerDue">触发到期任务</Button>
      </template>
      <template #enabled="{ row }">
        <Tag :color="row.enabled ? 'green' : 'orange'">
          {{ row.enabled ? '已启用' : '已停用' }}
        </Tag>
      </template>
    </Grid>
  </Page>
</template>

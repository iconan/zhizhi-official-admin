<script lang="tsx" setup>
import { Page } from '@vben/common-ui';
import { Button, Modal, Tag, message } from 'ant-design-vue';
import { nextTick, onMounted } from 'vue';

import { useVbenForm, z } from '#/adapter/form';
import { useVbenVxeGrid } from '#/adapter/vxe-table';
import type { OnActionClickFn, VxeTableGridOptions } from '#/adapter/vxe-table';
import {
  createSchedule,
  deleteSchedule,
  fetchSchedules,
  runScheduleNow,
  switchScheduleStatus,
  updateSchedule,
} from '#/api/etl/schedules';

interface ScheduleItem {
  schedule_id: string;
  name: string;
  cron: string;
  status?: 'active' | 'paused';
  description?: string;
  created_at?: string;
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
      fieldName: 'cron',
      label: 'Cron 表达式',
      rules: z.string({ required_error: '请输入 Cron 表达式' }).min(1, '请输入 Cron 表达式').max(200, '过长'),
    },
    {
      component: 'Input',
      fieldName: 'description',
      label: '描述',
      componentProps: { type: 'textarea', rows: 3 },
      rules: z.string().max(500, '过长').optional(),
    },
  ],
});

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: {
    columns: [
      { field: 'name', title: '调度名称', minWidth: 200 },
      { field: 'cron', title: 'Cron', minWidth: 160 },
      { field: 'description', title: '描述', minWidth: 220 },
      {
        field: 'status',
        title: '状态',
        width: 120,
        slots: { default: 'status' },
      },
      { field: 'created_at', title: '创建时间', minWidth: 180 },
      {
        title: '操作',
        field: 'operation',
        width: 240,
        fixed: 'right',
        showOverflow: false,
        cellRender: {
          name: 'CellOperation',
          options: [
            { code: 'run', text: '立即运行' },
            { code: 'status', text: '切换状态' },
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
        query: async ({ page }: any, formValues: any) => {
          try {
            const limit = page?.pageSize || 20;
            const offset = ((page?.currentPage || 1) - 1) * limit;
            const { items, total } = await fetchSchedules({
              limit,
              offset,
              keyword: formValues?.keyword || undefined,
            });
            return { items, total } as any;
          } catch (error) {
            console.error('[ETK] fetch schedules failed', error);
            return { items: [], total: 0 } as any;
          }
        },
      },
    },
    rowConfig: { keyField: 'schedule_id' },
    toolbarConfig: { custom: true, export: false, refresh: true, zoom: true },
  } as VxeTableGridOptions,
  formOptions: {
    submitOnChange: true,
    schema: [
      {
        component: 'Input',
        fieldName: 'keyword',
        label: '关键词',
        componentProps: { allowClear: true, placeholder: '名称' },
      },
    ],
  },
});

function onCreate() {
  scheduleFormApi.resetForm();
  Modal.confirm({
    title: '新增调度',
    icon: null,
    content: () => <ScheduleForm layout="vertical" class="pt-2" />, // jsx
    okText: '保存',
    onOk: async () => {
      const { valid } = await scheduleFormApi.validate();
      if (!valid) return Promise.reject();
      const values = await scheduleFormApi.getValues<ScheduleItem>();
      await createSchedule({ name: values.name, cron: values.cron, description: values.description });
      message.success('创建成功');
      await gridApi.query();
    },
  });
}

const onActionClick: OnActionClickFn<ScheduleItem> = ({ code, row }) => {
  switch (code) {
    case 'edit':
      scheduleFormApi.resetForm();
      scheduleFormApi.setValues(row);
      Modal.confirm({
        title: '编辑调度',
        icon: null,
        content: () => <ScheduleForm layout="vertical" class="pt-2" />, // jsx
        okText: '保存',
        onOk: async () => {
          const { valid } = await scheduleFormApi.validate();
          if (!valid) return Promise.reject();
          const values = await scheduleFormApi.getValues<ScheduleItem>();
          await updateSchedule(row.schedule_id, { name: values.name, cron: values.cron, description: values.description });
          message.success('更新成功');
          await gridApi.query();
        },
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
    case 'status':
      toggleStatus(row);
      break;
    case 'run':
      runNow(row);
      break;
    default:
      break;
  }
};

async function toggleStatus(row: ScheduleItem) {
  const next = row.status === 'active' ? 'paused' : 'active';
  const hide = message.loading({ content: '切换状态中...', duration: 0 });
  try {
    await switchScheduleStatus(row.schedule_id, next);
    message.success('状态已更新');
    await gridApi.query();
  } finally {
    hide();
  }
}

async function runNow(row: ScheduleItem) {
  const hide = message.loading({ content: '正在触发运行...', duration: 0 });
  try {
    await runScheduleNow(row.schedule_id);
    message.success('已触发');
  } finally {
    hide();
  }
}

onMounted(() => {
  nextTick(() => gridApi.query());
});
</script>

<template>
  <Page auto-content-height>
    <Grid table-title="定时采集" @action-click="onActionClick">
      <template #toolbar-tools>
        <Button type="primary" @click="onCreate">新增调度</Button>
      </template>
      <template #status="{ row }">
        <Tag :color="row.status === 'active' ? 'green' : 'orange'">
          {{ row.status === 'active' ? '已启用' : '已暂停' }}
        </Tag>
      </template>
    </Grid>
  </Page>
</template>

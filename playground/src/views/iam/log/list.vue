<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';

import { computed, nextTick, onMounted, ref } from 'vue';

import { Page, useVbenDrawer } from '@vben/common-ui';

import { Button, Descriptions, DescriptionsItem, message, Tag } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { type AdminLogItem, fetchAdminLogs } from '#/api/iam/log';

const [DetailDrawer, detailDrawerApi] = useVbenDrawer({ destroyOnClose: true });
const currentLog = ref<AdminLogItem | null>(null);
const currentLogDetail = computed(() => currentLog.value?.detail ?? null);
const snapshotBefore = computed(() => pickDetailSection(currentLogDetail.value, 'before'));
const snapshotAfter = computed(() => pickDetailSection(currentLogDetail.value, 'after'));
const snapshotDiff = computed(() => pickDetailSection(currentLogDetail.value, 'diff'));
const snapshotMeta = computed(() => {
  const detail = currentLogDetail.value;
  if (!detail || typeof detail !== 'object') return null;
  return {
    intent: detail.intent,
    status: detail.status,
    error_message: detail.error_message,
    changes: detail.changes,
    request_id: detail.request_id,
  };
});

function openDetail(row: AdminLogItem) {
  currentLog.value = row;
  detailDrawerApi.open();
}

function getColumns() {
  return [
    { field: 'admin_name', title: '操作人', minWidth: 120 },
    { field: 'action', title: '操作动作', minWidth: 160, formatter: ({ row }: { row: AdminLogItem }) => row.permission_name || row.action },
    { field: 'target_type', title: '操作对象', minWidth: 140, formatter: ({ row }: { row: AdminLogItem }) => row.permission_name ? row.permission_name.split(' ')[0] : row.target_type },
    { field: 'target_id', title: '对象ID', minWidth: 200, showOverflow: true },
    { field: 'ip_address', title: 'IP地址', minWidth: 140 },
    { field: 'created_at', title: '操作时间', minWidth: 180, sortable: true },
    {
      title: '操作',
      field: 'operation',
      fixed: 'right',
      width: 100,
      slots: { default: 'ops' },
    },
  ];
}

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: {
    columns: getColumns(),
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
            const { items, total } = await fetchAdminLogs({
              limit,
              offset,
              keyword: formValues?.keyword || undefined,
              action: formValues?.action || undefined,
              target_type: formValues?.target_type || undefined,
            });
            return { items, total } as any;
          } catch (error) {
            console.error('[AdminLog] fetchAdminLogs failed', error);
            message.error('加载操作日志失败，请稍后重试');
            return { items: [], total: 0 } as any;
          }
        },
      },
    } as any,
    rowConfig: { keyField: 'id' },
    toolbarConfig: { custom: true, export: false, refresh: true, zoom: true },
  } as VxeTableGridOptions,
  formOptions: {
    submitOnChange: true,
    schema: [
      {
        component: 'Input',
        fieldName: 'keyword',
        label: '关键词',
        componentProps: { allowClear: true, placeholder: '操作人/动作/对象' },
      },
      {
        component: 'Input',
        fieldName: 'action',
        label: '操作动作',
        componentProps: { allowClear: true },
      },
      {
        component: 'Input',
        fieldName: 'target_type',
        label: '操作对象',
        componentProps: { allowClear: true },
      },
    ],
  },
});

onMounted(() => {
  nextTick(() => void gridApi.query());
});

function formatDetail(detail: Record<string, any> | null | undefined): string {
  if (!detail) return '-';
  try {
    return JSON.stringify(detail, null, 2);
  } catch {
    return String(detail);
  }
}

function pickDetailSection(detail: Record<string, any> | null | undefined, key: string) {
  if (!detail || typeof detail !== 'object') return null;
  const value = detail[key];
  return value && typeof value === 'object' ? value : null;
}

function hasStructuredSnapshot(detail: Record<string, any> | null | undefined) {
  return Boolean(pickDetailSection(detail, 'before') || pickDetailSection(detail, 'after') || pickDetailSection(detail, 'diff'));
}

function formatSnapshotValue(value: any): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
</script>

<template>
  <Page auto-content-height>
    <DetailDrawer title="日志详情">
      <Descriptions
        v-if="currentLog"
        bordered
        :column="1"
        class="mx-4"
        size="small"
      >
        <DescriptionsItem label="日志ID">{{ currentLog.id }}</DescriptionsItem>
        <DescriptionsItem label="操作人">
          {{ currentLog.admin_name || currentLog.admin_id || '-' }}
        </DescriptionsItem>
        <DescriptionsItem label="操作动作">
          <Tag color="blue">{{ currentLog.action }}</Tag>
        </DescriptionsItem>
        <DescriptionsItem label="操作对象">
          {{ currentLog.target_type || '-' }}
        </DescriptionsItem>
        <DescriptionsItem label="对象ID">
          {{ currentLog.target_id || '-' }}
        </DescriptionsItem>
        <DescriptionsItem label="IP地址">
          {{ currentLog.ip_address || '-' }}
        </DescriptionsItem>
        <DescriptionsItem label="操作时间">
          {{ currentLog.created_at || '-' }}
        </DescriptionsItem>
        <DescriptionsItem label="详细信息">
          <div v-if="hasStructuredSnapshot(currentLogDetail)" class="space-y-4">
            <div v-if="snapshotBefore">
              <div class="mb-2 text-xs font-medium text-gray-500">提交前</div>
              <pre class="whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs">{{ formatSnapshotValue(snapshotBefore) }}</pre>
            </div>
            <div v-if="snapshotAfter">
              <div class="mb-2 text-xs font-medium text-gray-500">提交后</div>
              <pre class="whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs">{{ formatSnapshotValue(snapshotAfter) }}</pre>
            </div>
            <div v-if="snapshotDiff">
              <div class="mb-2 text-xs font-medium text-gray-500">变更项</div>
              <pre class="whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs">{{ formatSnapshotValue(snapshotDiff) }}</pre>
            </div>
            <div v-if="snapshotMeta?.intent || snapshotMeta?.status || snapshotMeta?.error_message">
              <div class="mb-2 text-xs font-medium text-gray-500">附加信息</div>
              <pre class="whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs">{{ formatSnapshotValue(snapshotMeta) }}</pre>
            </div>
          </div>
          <pre v-else class="whitespace-pre-wrap text-xs">{{ formatDetail(currentLogDetail) }}</pre>
        </DescriptionsItem>
      </Descriptions>
    </DetailDrawer>

    <Grid table-title="操作日志">
      <template #ops="{ row }">
        <Button type="link" size="small" @click="openDetail(row)">
          详情
        </Button>
      </template>
    </Grid>
  </Page>
</template>

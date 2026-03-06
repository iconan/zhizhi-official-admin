<script lang="ts" setup>
import type { OnActionClickFn, VxeTableGridOptions } from '#/adapter/vxe-table';

import { Page, useVbenDrawer } from '@vben/common-ui';
import { Button, message, Tag } from 'ant-design-vue';
import { nextTick, onMounted, ref } from 'vue';

import { useVbenForm, z } from '#/adapter/form';
import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { createOrg, fetchOrgs, type IamOrg, updateOrg, updateOrgStatus } from '#/api/iam/org';

type OrgStatus = IamOrg['status'];

const [OrgDrawer, orgDrawerApi] = useVbenDrawer({ destroyOnClose: true });
const currentOrg = ref<IamOrg | null>(null);

const [OrgForm, orgFormApi] = useVbenForm({
  showDefaultActions: false,
  schema: [
    {
      component: 'Input',
      fieldName: 'name',
      label: '名称',
      rules: z.string().min(1, '请输入名称').max(100, '过长'),
    },
    {
      component: 'Input',
      fieldName: 'owner_id',
      label: '负责人ID',
      componentProps: { allowClear: true },
      rules: z.string().max(200, '过长').optional(),
    },
    {
      component: 'Input',
      fieldName: 'parent_id',
      label: '上级组织ID',
      componentProps: { allowClear: true },
      rules: z.string().max(200, '过长').optional(),
    },
    {
      component: 'Input',
      fieldName: 'credit_code',
      label: '统一社会信用代码',
      componentProps: { allowClear: true },
      rules: z.string().max(64, '过长').optional(),
    },
    {
      component: 'InputNumber',
      fieldName: 'max_members',
      label: '最大成员数',
      componentProps: { min: 0, max: 999999 },
    },
    {
      component: 'Input',
      fieldName: 'entitled_regions',
      label: '授权区域(逗号分隔)',
      componentProps: { allowClear: true },
      rules: z.string().max(500, '过长').optional(),
    },
  ],
});

const onActionClick: OnActionClickFn<IamOrg> = ({ code, row }) => {
  switch (code) {
    case 'edit':
      openDrawer(row);
      break;
    case 'status':
      toggleStatus(row);
      break;
    default:
      break;
  }
};

function getColumns(onActionClickFn: OnActionClickFn<IamOrg>) {
  return [
    { field: 'name', title: '名称', minWidth: 180 },
    { field: 'org_id', title: 'ID', minWidth: 200 },
    { field: 'parent_id', title: '上级ID', minWidth: 200 },
    { field: 'owner_id', title: '负责人ID', minWidth: 200 },
    { field: 'max_members', title: '最大成员', width: 120 },
    {
      field: 'status',
      title: '状态',
      width: 120,
      slots: { default: 'status' },
    },
    {
      title: '操作',
      field: 'operation',
      fixed: 'right',
      width: 220,
      showOverflow: false,
      cellRender: {
        name: 'CellOperation',
        options: [
          { code: 'status', text: '切换状态' },
          'edit',
        ],
        attrs: { onClick: onActionClickFn },
      },
    },
  ];
}

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: {
    columns: getColumns(onActionClick),
    height: 'auto',
    keepSource: true,
    pagerConfig: { enabled: false },
    proxyConfig: {
      enabled: true,
      autoLoad: false,
      ajax: {
        query: async () => {
          try {
            const items = await fetchOrgs();
            return items;
          } catch (error) {
            console.error('[IAM Org] fetchOrgs failed', error);
            return [];
          }
        },
      },
      response: { result: ({ response }: any) => response },
    } as any,
    rowConfig: { keyField: 'org_id' },
    toolbarConfig: { custom: true, export: false, refresh: true, zoom: true },
  } as VxeTableGridOptions,
});

onMounted(() => {
  nextTick(() => gridApi.query());
});

function openDrawer(row?: IamOrg) {
  currentOrg.value = row ?? null;
  orgDrawerApi.open();
  nextTick(() => {
    orgFormApi.resetForm();
    if (row) {
      const regions = Array.isArray(row.entitled_regions)
        ? row.entitled_regions.join(',')
        : (row as any).entitled_regions || '';
      orgFormApi.setValues({ ...row, entitled_regions: regions });
    }
  });
}

function onCreate() {
  openDrawer();
}

async function onSubmitOrg() {
  const { valid } = await orgFormApi.validate();
  if (!valid) return;
  orgDrawerApi.lock();
  const values = await orgFormApi.getValues<any>();
  const payload = { ...values } as any;
  if (typeof payload.entitled_regions === 'string') {
    payload.entitled_regions = payload.entitled_regions
      ? payload.entitled_regions.split(',').map((v: string) => v.trim()).filter(Boolean)
      : [];
  }
  try {
    if (currentOrg.value?.org_id) {
      await updateOrg(currentOrg.value.org_id, payload);
      message.success('更新成功');
    } else {
      await createOrg(payload as any);
      message.success('创建成功');
    }
    orgDrawerApi.close();
    gridApi.query();
  } finally {
    orgDrawerApi.unlock();
  }
}

function renderStatus(status: OrgStatus) {
  const map: Record<OrgStatus, { text: string; color: string }> = {
    active: { text: '已启用', color: 'green' },
    disabled: { text: '已禁用', color: 'red' },
  } as const;
  return map[status];
}

function toggleStatus(row: IamOrg) {
  const nextStatus: OrgStatus = row.status === 'active' ? 'disabled' : 'active';
  const hide = message.loading({ content: '正在更新状态', duration: 0 });
  updateOrgStatus(row.org_id, nextStatus)
    .then(() => {
      message.success('状态已更新');
      gridApi.query();
    })
    .finally(() => hide());
}
</script>

<template>
  <Page auto-content-height>
    <OrgDrawer :title="currentOrg ? '编辑组织' : '新增组织'">
      <OrgForm class="mx-4" layout="vertical" />
      <template #footer>
        <div class="flex justify-end gap-2 pr-4 pb-2">
          <Button @click="orgDrawerApi.close()">取消</Button>
          <Button type="primary" @click="onSubmitOrg">保存</Button>
        </div>
      </template>
    </OrgDrawer>

    <Grid>
      <template #toolbar-tools>
        <Button type="primary" @click="onCreate">新增组织</Button>
      </template>

      <template #status="{ row }">
        <Tag :color="renderStatus(row.status).color">
          {{ renderStatus(row.status).text }}
        </Tag>
      </template>
    </Grid>
  </Page>
</template>

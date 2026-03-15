<script lang="ts" setup>
import type { OnActionClickFn, VxeTableGridOptions } from '#/adapter/vxe-table';
import type { IamTenant, TenantStatus } from '#/api/iam/tenant';

import { nextTick, onMounted, ref } from 'vue';

import { Page, useVbenDrawer } from '@vben/common-ui';

import { Button, message, Tag } from 'ant-design-vue';

import { useVbenForm, z } from '#/adapter/form';
import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  createTenant,
  fetchTenants,
  reprovisionTenant,
  updateTenant,
  updateTenantStatus,
} from '#/api/iam/tenant';
import { getRegionTreeOptions } from '#/store/tree-data';

const [CreateDrawer, createDrawerApi] = useVbenDrawer({ destroyOnClose: true });
const [EditDrawer, editDrawerApi] = useVbenDrawer({ destroyOnClose: true });

const currentTenant = ref<IamTenant | null>(null);
const regionTreeOptions = ref<any[]>([]);

const [CreateForm, createFormApi] = useVbenForm({
  showDefaultActions: false,
  schema: [
    {
      component: 'TreeSelect',
      fieldName: 'tenant_code',
      label: '区域编码',
      defaultValue: null,
      componentProps: {
        allowClear: true,
        showSearch: true,
        treeDefaultExpandAll: false,
        treeData: regionTreeOptions,
        treeNodeFilterProp: 'label',
        fieldNames: { label: 'label', value: 'value', children: 'children' },
        placeholder: '请选择区域编码',
        style: { width: '100%' },
      },
      rules: z
        .string({ required_error: '请选择区域编码' })
        .min(1, '请选择区域编码')
        .max(100, '过长'),
    },
    {
      component: 'InputNumber',
      fieldName: 'es_pool',
      label: 'ES 索引',
      componentProps: { min: 0, max: 999_999, style: { width: '100%' } },
      rules: z.number().nullable().optional(),
    },
    {
      component: 'Input',
      fieldName: 'mark',
      label: '备注',
      componentProps: { allowClear: true, type: 'textarea', rows: 3 },
      rules: z.string().max(500, '过长').nullable().optional(),
    },
  ],
});

const [EditForm, editFormApi] = useVbenForm({
  showDefaultActions: false,
  schema: [
    {
      component: 'Input',
      fieldName: 'tenant_code',
      label: '区域编码',
      componentProps: { disabled: true },
    },
    {
      component: 'Input',
      fieldName: 'name',
      label: '租户名称',
      componentProps: { disabled: true },
    },
    {
      component: 'InputNumber',
      fieldName: 'es_pool',
      label: 'ES 索引',
      componentProps: { min: 0, max: 999_999, style: { width: '100%' } },
      rules: z.number().nullable().optional(),
    },
    {
      component: 'Input',
      fieldName: 'mark',
      label: '备注',
      componentProps: { allowClear: true, type: 'textarea', rows: 3 },
      rules: z.string().max(500, '过长').nullable().optional(),
    },
  ],
});

const onActionClick: OnActionClickFn<IamTenant> = ({ code, row }) => {
  switch (code) {
    case 'disable': {
      doUpdateStatus(row, 'disabled');
      break;
    }
    case 'edit': {
      openEditDrawer(row);
      break;
    }
    case 'enable': {
      doUpdateStatus(row, 'active');
      break;
    }
    case 'reprovision': {
      doReprovision(row);
      break;
    }
    default: {
      break;
    }
  }
};

function getColumns(onActionClickFn: OnActionClickFn<IamTenant>) {
  return [
    { field: 'tenant_code', title: '区域编码', minWidth: 160 },
    { field: 'name', title: '租户名称', minWidth: 180 },
    { field: 'schema_name', title: 'Schema', minWidth: 160 },
    { field: 'schema_version', title: 'Schema 版本', minWidth: 140 },
    {
      field: 'es_pool',
      title: 'ES 索引',
      minWidth: 120,
      formatter: ({ cellValue }: { cellValue: null | number | undefined }) =>
        cellValue === 0 ? 0 : (cellValue ?? '-'),
    },
    {
      field: 'mark',
      title: '备注',
      minWidth: 180,
      showOverflow: true,
      formatter: ({ cellValue }: { cellValue: null | string | undefined }) =>
        cellValue || '-',
    },
    {
      field: 'status',
      title: '状态',
      width: 150,
      slots: { default: 'status' },
    },
    {
      field: 'created_at',
      title: '创建时间',
      minWidth: 180,
    },
    {
      field: 'updated_at',
      title: '更新时间',
      minWidth: 180,
    },
    {
      title: '操作',
      field: 'operation',
      fixed: 'right',
      width: 240,
      showOverflow: false,
      cellRender: {
        name: 'CellOperation',
        options: [
          {
            code: 'disable',
            text: '禁用',
            type: 'link',
            danger: true,
            popconfirm: true,
            confirmTitle: '确认禁用？',
            confirmMessage: (row: IamTenant) => `确认禁用租户「${row.name}」？`,
            show: (row: IamTenant) => row.status === 'active',
          },
          {
            code: 'reprovision',
            text: '重新开通',
            show: (row: IamTenant) =>
              ['provisioning', 'provisioning_failed'].includes(row.status),
          },
          {
            code: 'enable',
            text: '启用',
            type: 'link',
            popconfirm: true,
            confirmTitle: '确认启用？',
            confirmMessage: (row: IamTenant) => `确认启用租户「${row.name}」？`,
            show: (row: IamTenant) => row.status === 'disabled',
          },
          'edit',
        ],
        attrs: { onClick: onActionClickFn },
      },
    },
  ];
}

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    submitOnChange: true,
    schema: [
      {
        component: 'TreeSelect',
        fieldName: 'tenant_code',
        label: '区域编码',
        defaultValue: null,
        componentProps: {
          allowClear: true,
          showSearch: true,
          treeDefaultExpandAll: false,
          treeData: regionTreeOptions,
          treeNodeFilterProp: 'label',
          fieldNames: { label: 'label', value: 'value', children: 'children' },
          placeholder: '请选择租户编码',
          style: { width: '100%' },
        },
      },
      {
        component: 'Select',
        fieldName: 'status',
        label: '状态',
        componentProps: {
          allowClear: true,
          placeholder: '全部状态',
          options: [
            { label: '开通中', value: 'provisioning' },
            { label: '已开通', value: 'active' },
            { label: '已禁用', value: 'disabled' },
            { label: '开通失败', value: 'provisioning_failed' },
          ],
          style: { width: '100%' },
        },
      },
    ],
  },
  gridOptions: {
    columns: getColumns(onActionClick),
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
            return await fetchTenants({
              limit,
              offset,
              tenant_code: formValues?.tenant_code || undefined,
              status: formValues?.status || undefined,
            });
          } catch (error) {
            console.error('[IAM Tenant] fetchTenants failed', error);
            return { items: [], total: 0 } as any;
          }
        },
      },
    } as any,
    rowConfig: { keyField: 'tenant_id' },
    toolbarConfig: { custom: true, export: false, refresh: true, zoom: true },
  } as VxeTableGridOptions,
});

onMounted(async () => {
  await loadRegionOptions();
  nextTick(() => gridApi.query());
});

async function loadRegionOptions() {
  try {
    regionTreeOptions.value = await getRegionTreeOptions();
  } catch (error) {
    console.error('[IAM Tenant] fetchRegions failed', error);
  }
}

function findTreeNodeLabel(value: string, nodes: any[]): null | string {
  for (const node of nodes ?? []) {
    if (node?.value === value) return node?.label ?? null;
    const child = findTreeNodeLabel(value, node?.children ?? []);
    if (child) return child;
  }
  return null;
}

function extractNameFromLabel(label?: null | string) {
  if (!label) return '';
  const idxCn = label.indexOf('（');
  const idxEn = label.indexOf('(');
  const idx = [idxCn, idxEn].filter((v) => v >= 0).toSorted((a, b) => a - b)[0];
  const base = idx === undefined ? label : label.slice(0, idx);
  return base.trim();
}

function renderStatus(status: TenantStatus) {
  const map: Record<TenantStatus, { color: string; text: string }> = {
    active: { color: 'green', text: '已开通' },
    disabled: { color: 'red', text: '已禁用' },
    provisioning: { color: 'processing', text: '开通中' },
    provisioning_failed: { color: 'orange', text: '开通失败' },
  };
  return map[status] ?? { color: 'default', text: status };
}

function openCreateDrawer() {
  createDrawerApi.open();
  nextTick(() => {
    createFormApi.resetForm();
  });
}

function openEditDrawer(row: IamTenant) {
  currentTenant.value = row;
  editDrawerApi.open();
  nextTick(() => {
    editFormApi.resetForm();
    editFormApi.setValues({
      tenant_code: row.tenant_code,
      schema_name: row.schema_name,
      name: row.name,
      es_pool: row.es_pool ?? null,
      mark: row.mark ?? null,
    });
  });
}

async function onSubmitCreate() {
  const { valid } = await createFormApi.validate();
  if (valid === false) return;
  createDrawerApi.lock();
  try {
    const values = await createFormApi.getValues<{
      es_pool?: null | number;
      mark?: null | string;
      tenant_code: string;
    }>();
    const tenantLabel = findTreeNodeLabel(
      values.tenant_code,
      regionTreeOptions.value,
    );
    const tenantName = extractNameFromLabel(tenantLabel) || values.tenant_code;
    await createTenant({
      es_pool: values.es_pool ?? null,
      name: tenantName,
      tenant_code: values.tenant_code,
      mark: values.mark ?? null,
    });
    message.success('创建成功');
    createDrawerApi.close();
    gridApi.query();
  } finally {
    createDrawerApi.unlock();
  }
}

async function onSubmitEdit() {
  if (!currentTenant.value?.tenant_id) return;
  const { valid } = await editFormApi.validate();
  if (!valid) return;
  editDrawerApi.lock();
  try {
    const values = await editFormApi.getValues<any>();
    await updateTenant(currentTenant.value.tenant_id, {
      name: values.name,
      es_pool: values.es_pool ?? null,
      mark: values.mark ?? null,
    });
    message.success('更新成功');
    editDrawerApi.close();
    gridApi.query();
  } finally {
    editDrawerApi.unlock();
  }
}

function doReprovision(row: IamTenant) {
  const hide = message.loading({
    content: `正在重新开通：${row.name}`,
    duration: 0,
  });
  reprovisionTenant(row.tenant_id)
    .then(() => {
      message.success('已提交重新开通');
      gridApi.query();
    })
    .catch((error) => {
      console.error('[IAM Tenant] reprovision failed', error);
    })
    .finally(() => hide());
}

async function doUpdateStatus(
  row: IamTenant,
  target: Extract<TenantStatus, 'active' | 'disabled'>,
) {
  if (!row?.tenant_id) return;
  const hide = message.loading({
    content:
      target === 'disabled' ? `正在禁用：${row.name}` : `正在启用：${row.name}`,
    duration: 0,
  });
  try {
    await updateTenantStatus(row.tenant_id, { status: target });
    message.success(target === 'disabled' ? '已禁用' : '已启用');
    gridApi.query();
  } catch (error: any) {
    const status = error?.response?.status;
    if (status === 409) {
      message.error('状态不可切换，请刷新后重试');
    } else {
      message.error('操作失败');
    }
    console.error('[IAM Tenant] update status failed', error);
  } finally {
    hide();
  }
}
</script>

<template>
  <Page auto-content-height>
    <CreateDrawer title="新增租户">
      <CreateForm class="mx-4" layout="vertical" />
      <template #footer>
        <div class="flex justify-end gap-2 pb-2 pr-4">
          <Button @click="createDrawerApi.close()">取消</Button>
          <Button type="primary" @click="onSubmitCreate">保存</Button>
        </div>
      </template>
    </CreateDrawer>

    <EditDrawer :title="`编辑租户 - ${currentTenant?.name ?? ''}`">
      <EditForm class="mx-4" layout="vertical" />
      <template #footer>
        <div class="flex justify-end gap-2 pb-2 pr-4">
          <Button @click="editDrawerApi.close()">取消</Button>
          <Button type="primary" @click="onSubmitEdit">保存</Button>
        </div>
      </template>
    </EditDrawer>

    <Grid table-title="租户列表">
      <template #toolbar-tools>
        <Button type="primary" @click="openCreateDrawer">新增租户</Button>
      </template>

      <template #status="{ row }">
        <Tag :color="renderStatus(row.status).color">
          {{ renderStatus(row.status).text }}
        </Tag>
      </template>
    </Grid>
  </Page>
</template>

<script lang="ts" setup>
import type { OnActionClickFn, VxeTableGridOptions } from '#/adapter/vxe-table';

import { Page, useVbenDrawer } from '@vben/common-ui';
import { Button, message } from 'ant-design-vue';
import { nextTick, onMounted, ref } from 'vue';

import { useVbenForm, z } from '#/adapter/form';
import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  createPermission,
  fetchPermissions,
  type IamPermission,
  updatePermission,
} from '#/api/iam/permission';

const [PermissionDrawer, permissionDrawerApi] = useVbenDrawer({ destroyOnClose: true });
const permissionDrawerTitle = ref('');
const currentPermissionId = ref<string | null>(null);

const [PermissionForm, permissionFormApi] = useVbenForm({
  showDefaultActions: false,
  schema: [
    {
      component: 'Input',
      fieldName: 'code',
      label: '权限码',
      rules: z.string().min(1, '请输入权限码').max(100, '过长'),
    },
    {
      component: 'Input',
      fieldName: 'resource',
      label: '资源',
      rules: z.string().min(1, '请输入资源').max(50, '过长'),
    },
    {
      component: 'Input',
      fieldName: 'action',
      label: '动作',
      rules: z.string().min(1, '请输入动作').max(50, '过长'),
    },
    {
      component: 'Input',
      fieldName: 'name',
      label: '名称',
      rules: z.string().min(1, '请输入名称').max(80, '过长'),
    },
    {
      component: 'Input',
      fieldName: 'description',
      label: '描述',
      componentProps: { type: 'textarea', rows: 3 },
      rules: z.string().max(200, '过长').optional(),
    },
  ],
});

const onActionClick: OnActionClickFn<IamPermission> = ({ code, row }) => {
  switch (code) {
    case 'edit':
      openDrawer(row);
      break;
    default:
      break;
  }
};

function getColumns(onActionClickFn: OnActionClickFn<IamPermission>) {
  return [
    { field: 'code', title: '权限码', minWidth: 200 },
    { field: 'resource', title: '资源', minWidth: 140 },
    { field: 'action', title: '动作', minWidth: 120 },
    { field: 'name', title: '名称', minWidth: 160 },
    { field: 'description', title: '描述', minWidth: 220 },
    {
      title: '操作',
      field: 'operation',
      fixed: 'right',
      width: 180,
      showOverflow: false,
      cellRender: {
        name: 'CellOperation',
        options: [{ code: 'edit', text: '编辑' }],
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
            const items = await fetchPermissions();
            return items;
          } catch (error) {
            console.error('[IAM Permission] fetchPermissions failed', error);
            return [];
          }
        },
      },
      response: {
        result: ({ response }: any) => response,
      },
    } as any,
    rowConfig: { keyField: 'permission_id' },
    toolbarConfig: {
      custom: true,
      export: false,
      refresh: true,
      zoom: true,
    },
  } as VxeTableGridOptions,
});

onMounted(() => {
  nextTick(() => gridApi.query());
});

function openDrawer(row?: IamPermission) {
  permissionDrawerTitle.value = row ? '编辑权限点' : '新增权限点';
  permissionDrawerApi.open();
  nextTick(() => {
    permissionFormApi.resetForm();
    permissionFormApi.setValues(row || {});
  });
  currentPermissionId.value = row?.permission_id ?? null;
}

async function onSubmitPermission() {
  const { valid } = await permissionFormApi.validate();
  if (!valid) return;
  permissionDrawerApi.lock();
  const values = await permissionFormApi.getValues<IamPermission>();
  try {
    if (currentPermissionId.value) {
      await updatePermission(currentPermissionId.value, values as any);
    } else {
      await createPermission(values as any);
    }
    message.success('保存成功');
    permissionDrawerApi.close();
    gridApi.query();
  } finally {
    permissionDrawerApi.unlock();
  }
}

function onCreate() {
  openDrawer();
}
</script>

<template>
  <Page auto-content-height>
    <PermissionDrawer :title="permissionDrawerTitle">
      <PermissionForm class="mx-4" layout="vertical" />
      <template #footer>
        <div class="flex justify-end gap-2 pr-4 pb-2">
          <Button @click="permissionDrawerApi.close()">取消</Button>
          <Button type="primary" @click="onSubmitPermission">保存</Button>
        </div>
      </template>
    </PermissionDrawer>

    <Grid table-title="权限列表">
      <template #toolbar-tools>
        <Button type="primary" @click="onCreate">新增权限点</Button>
      </template>
    </Grid>
  </Page>
</template>

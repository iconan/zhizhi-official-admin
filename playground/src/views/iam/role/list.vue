<script lang="ts" setup>
import type { OnActionClickFn, VxeTableGridOptions } from '#/adapter/vxe-table';

import { Page, useVbenDrawer } from '@vben/common-ui';
import { Button, Select, Tag, message } from 'ant-design-vue';
import { nextTick, onMounted, ref } from 'vue';

import { useVbenForm, z } from '#/adapter/form';
import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  bindRolePermissions,
  createRole,
  fetchRoleDetail,
  fetchRoles,
  type IamRole,
  updateRole,
  updateRoleStatus,
} from '#/api/iam/role';
import { fetchPermissions, type IamPermission } from '#/api/iam/permission';
import { getActiveOrgOptions, getActiveOrgTreeOptions, getAllOrgOptions } from '#/store/tree-data';

type RoleStatus = IamRole['status'];

const [FormDrawer, formDrawerApi] = useVbenDrawer({ destroyOnClose: true });
const [BindDrawer, bindDrawerApi] = useVbenDrawer({ destroyOnClose: true });

const currentRole = ref<IamRole | null>(null);
const bindTarget = ref<IamRole | null>(null);
const permissionOptions = ref<{ label: string; value: string }[]>([]);
const orgOptions = ref<{ label: string; value: string }[]>([]); // active orgs for forms
const orgOptionsAll = ref<{ label: string; value: string }[]>([]); // all orgs for label mapping
const orgTreeOptions = ref<any[]>([]);

const [RoleForm, roleFormApi] = useVbenForm({
  showDefaultActions: false,
  schema: [
    {
      component: 'Input',
      fieldName: 'name',
      label: '名称',
      rules: z.string().min(1, '请输入名称').max(80, '过长'),
    },
    {
      component: 'Input',
      fieldName: 'code',
      label: '编码',
      rules: z.string().min(1, '请输入编码').max(80, '过长'),
    },
    {
      component: 'Input',
      fieldName: 'description',
      label: '描述',
      componentProps: { type: 'textarea', rows: 3 },
      rules: z.string().max(200, '过长').optional(),
    },
    {
      component: 'TreeSelect',
      fieldName: 'org_id',
      label: '所属组织',
      defaultValue: null,
      componentProps: {
        allowClear: true,
        showSearch: true,
        treeDefaultExpandAll: true,
        treeData: orgTreeOptions,
        placeholder: '选择组织',
        style: { width: '100%' },
        dropdownMatchSelectWidth: false,
        filterTreeNode: (input: string, node: any) =>
          (node?.label as string)?.toLowerCase()?.includes(input.toLowerCase()),
      },
      rules: z.string({ required_error: '请选择所属组织' }).min(1, '请选择所属组织').max(200, '过长'),
    },
  ],
});

const [BindForm, bindFormApi] = useVbenForm({
  showDefaultActions: false,
  schema: [
    {
      component: 'Select',
      fieldName: 'permission_codes',
      label: '权限点',
      componentProps: {
        mode: 'multiple',
        options: permissionOptions,
        style: { width: '100%' },
        dropdownMatchSelectWidth: false,
        placeholder: '选择权限点编码',
        allowClear: true,
        showSearch: true,
        optionFilterProp: 'label',
      },
      rules: z.array(z.string()).min(1, '至少选择1个权限点'),
    },
  ],
});

const onActionClick: OnActionClickFn<IamRole> = ({ code, row }) => {
  switch (code) {
    case 'edit':
      openForm(row);
      break;
    case 'status':
      toggleStatus(row);
      break;
    case 'bind':
      openBind(row);
      break;
    default:
      break;
  }
};

function getColumns(onActionClickFn: OnActionClickFn<IamRole>) {
  return [
    { field: 'name', title: '角色名称', minWidth: 160 },
    { field: 'code', title: '编码', minWidth: 160 },
    { field: 'description', title: '描述', minWidth: 220 },
    {
      field: 'org_id',
      title: '所属组织',
      minWidth: 200,
      formatter: ({ cellValue }) => orgLabel(cellValue),
    },
    {
      field: 'permission_codes',
      title: '绑定权限',
      minWidth: 260,
      showOverflow: false,
      slots: { default: 'permissions' },
    },
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
      width: 240,
      showOverflow: false,
      cellRender: {
        name: 'CellOperation',
        options: [
          { code: 'bind', text: '绑定权限' },
          { code: 'status', text: '切换状态' },
          'edit',
        ],
        attrs: { onClick: onActionClickFn },
      },
    },
  ];
}

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    schema: [
      {
        component: 'Input',
        fieldName: 'keyword',
        label: '名称或编码',
        componentProps: {
          allowClear: true,
          placeholder: '名称或编码',
        },
      },
      {
        component: 'TreeSelect',
        fieldName: 'org_id',
        label: '所属组织',
        componentProps: {
          allowClear: true,
          showSearch: true,
          treeDefaultExpandAll: true,
          treeData: orgTreeOptions,
          placeholder: '选择组织',
          style: { width: '100%' },
          dropdownMatchSelectWidth: false,
          filterTreeNode: (input: string, node: any) =>
            (node?.label as string)?.toLowerCase()?.includes(input.toLowerCase()),
        },
      },
      {
        component: 'Select',
        fieldName: 'status',
        label: '状态',
        defaultValue: undefined,
        componentProps: {
          allowClear: true,
          placeholder: '全部状态',
          options: [
            { label: '已启用', value: 'active' },
            { label: '已禁用', value: 'disabled' },
          ],
          style: { width: '100%' },
        },
      },
    ],
    submitOnChange: true,
  },
  gridOptions: {
    columns: getColumns(onActionClick),
    height: 'auto',
    keepSource: true,
    pagerConfig: { enabled: false },
    proxyConfig: {
      enabled: true,
      autoLoad: false,
      ajax: {
        query: async (_params, formValues) => {
          try {
            const items = await fetchRoles({
              keyword: formValues?.keyword || undefined,
              org_id: formValues?.org_id || undefined,
              status: formValues?.status || undefined,
            });
            // fetch permissions for each role in parallel
            const withPermissions = await Promise.all(
              items.map(async (role) => {
                try {
                  const detail = await fetchRoleDetail(role.role_id);
                  return {
                    ...role,
                    permission_codes:
                      (detail as any)?.permission_codes || (detail as any)?.permissions,
                  };
                } catch (e) {
                  console.error('[IAM Role] fetchRoleDetail failed', role.role_id, e);
                  return role;
                }
              }),
            );
            return withPermissions;
          } catch (error) {
            console.error('[IAM Role] fetchRoles failed', error);
            return [];
          }
        },
      },
      response: {
        result: ({ response }: any) => response,
      },
    } as any,
    rowConfig: { keyField: 'role_id' },
    toolbarConfig: {
      custom: true,
      export: false,
      refresh: true,
      zoom: true,
    },
  } as VxeTableGridOptions,
});

onMounted(async () => {
  await Promise.all([loadPermissionOptions(), loadOrgOptions()]);
  nextTick(() => gridApi.query());
});

async function loadPermissionOptions() {
  try {
    const { items } = await fetchPermissions({ limit: 500, offset: 0 });
    permissionOptions.value = items.map((item: IamPermission) => ({
      label: `${item.code}（${item.name}）`,
      value: item.code,
    }));
  } catch (error) {
    console.error('[IAM Role] fetchPermissions failed', error);
  }
}

async function loadOrgOptions() {
  try {
    orgOptions.value = await getActiveOrgOptions();
    orgOptionsAll.value = await getAllOrgOptions();
    orgTreeOptions.value = await getActiveOrgTreeOptions();
  } catch (error) {
    console.error('[IAM Role] fetchOrgs failed', error);
  }
}

function orgLabel(id?: string | null) {
  if (!id) return '';
  return orgOptionsAll.value.find((item) => item.value === id)?.label ?? id;
}

function permissionLabel(item: any) {
  if (!item) return '';
  // backend may return string codes or objects like { code, name }
  const code = typeof item === 'string' ? item : item.code;
  const name = typeof item === 'string' ? undefined : item.name;
  const optionLabel = permissionOptions.value.find((opt) => opt.value === code)?.label;
  if (name && code) return `${code}（${name}）`;
  return optionLabel ?? code ?? '';
}

function onCreate() {
  openForm();
}

function openForm(row?: IamRole) {
  currentRole.value = row ?? null;
  formDrawerApi.open();
  nextTick(() => {
    roleFormApi.resetForm();
    if (row) roleFormApi.setValues(row);
  });
}

async function onSubmitRole() {
  const { valid } = await roleFormApi.validate();
  if (!valid) return;
  formDrawerApi.lock();
  const values = await roleFormApi.getValues<IamRole>();
  try {
    if (currentRole.value?.role_id) {
      await updateRole(currentRole.value.role_id, values as any);
      message.success('更新成功');
    } else {
      await createRole(values as any);
      message.success('创建成功');
    }
    formDrawerApi.close();
    gridApi.query();
  } finally {
    formDrawerApi.unlock();
  }
}

function renderStatus(status: RoleStatus) {
  const map: Record<RoleStatus, { text: string; color: string }> = {
    active: { text: '已启用', color: 'green' },
    disabled: { text: '已禁用', color: 'red' },
  } as const;
  return map[status];
}

function toggleStatus(row: IamRole) {
  const nextStatus: RoleStatus = row.status === 'active' ? 'disabled' : 'active';
  const hide = message.loading({ content: '正在更新状态', duration: 0 });
  updateRoleStatus(row.role_id, nextStatus)
    .then(() => {
      message.success('状态已更新');
      gridApi.query();
    })
    .finally(() => hide());
}

function openBind(row: IamRole) {
  bindTarget.value = row;
  bindDrawerApi.open();
  nextTick(() => {
    bindFormApi.resetForm();
    const codes = (row as any)?.permission_codes || (row as any)?.permissions || [];
    const normalized = (codes as any[]).map((item) =>
      typeof item === 'string' ? item : item.code,
    );
    bindFormApi.setValues({ permission_codes: normalized });
  });
}

async function onSubmitBind() {
  const { valid } = await bindFormApi.validate();
  if (!valid || !bindTarget.value) return;
  bindDrawerApi.lock();
  const values = await bindFormApi.getValues<{ permission_codes: string[] }>();
  try {
    await bindRolePermissions(bindTarget.value.role_id, values.permission_codes);
    message.success('绑定成功');
    bindDrawerApi.close();
    gridApi.query();
  } finally {
    bindDrawerApi.unlock();
  }
}
</script>

<template>
  <Page auto-content-height>
    <FormDrawer :title="currentRole ? '编辑角色' : '新增角色'">
      <RoleForm class="mx-4" layout="vertical" />
      <template #footer>
        <div class="flex justify-end gap-2 pr-4 pb-2">
          <Button @click="formDrawerApi.close()">取消</Button>
          <Button type="primary" @click="onSubmitRole">保存</Button>
        </div>
      </template>
    </FormDrawer>

    <BindDrawer :title="`绑定权限 - ${bindTarget?.name ?? ''}`">
      <BindForm class="mx-4" layout="vertical" />
      <template #footer>
        <div class="flex justify-end gap-2 pr-4 pb-2">
          <Button @click="bindDrawerApi.close()">取消</Button>
          <Button type="primary" @click="onSubmitBind">保存</Button>
        </div>
      </template>
    </BindDrawer>

    <Grid table-title="角色列表">
      <template #toolbar-tools>
        <Button type="primary" @click="onCreate">新增角色</Button>
      </template>

      <template #status="{ row }">
        <Tag :color="renderStatus(row.status).color">
          {{ renderStatus(row.status).text }}
        </Tag>
      </template>
      <template #permissions="{ row }">
        <div class="flex flex-wrap gap-1">
          <Tag
            v-if="!(row.permission_codes?.length) && !(row.permissions?.length)"
            color="default"
          >
            -
          </Tag>
          <Tag
            v-for="p in row.permission_codes || row.permissions || []"
            :key="typeof p === 'string' ? p : p.code"
            color="blue"
          >
            {{ permissionLabel(p) }}
          </Tag>
        </div>
      </template>
    </Grid>
  </Page>
</template>

<script lang="ts" setup>
import type { OnActionClickFn, VxeTableGridOptions } from '#/adapter/vxe-table';

import { Page, useVbenDrawer } from '@vben/common-ui';
import { Button, message, Tag } from 'ant-design-vue';
import { nextTick, onMounted, ref } from 'vue';

import { useVbenForm, z } from '#/adapter/form';
import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  bindRolesToAdminUser,
  createAdminUser,
  fetchAdminUsers,
  resetAdminUserPassword,
  type IamAdminUser,
  updateAdminUser,
  updateAdminUserStatus,
} from '#/api/iam/user';
import { fetchRoles, type IamRole } from '#/api/iam/role';

type ActiveStatus = boolean;

const [UserDrawer, userDrawerApi] = useVbenDrawer({ destroyOnClose: true });
const [RoleDrawer, roleDrawerApi] = useVbenDrawer({ destroyOnClose: true });
const [PasswordDrawer, passwordDrawerApi] = useVbenDrawer({ destroyOnClose: true });

const currentUser = ref<IamAdminUser | null>(null);
const targetUserForRoles = ref<IamAdminUser | null>(null);
const targetUserForPwd = ref<IamAdminUser | null>(null);
const roleOptions = ref<{ label: string; value: string }[]>([]);

const [UserForm, userFormApi] = useVbenForm({
  showDefaultActions: false,
  schema: [
    {
      component: 'Input',
      fieldName: 'email',
      label: '邮箱',
      rules: z.string().email('请输入合法邮箱').min(3).max(200),
    },
    {
      component: 'Input',
      fieldName: 'name',
      label: '姓名',
      rules: z.string().min(1, '请输入姓名').max(100, '过长'),
    },
    {
      component: 'InputPassword',
      fieldName: 'password',
      label: '密码',
      componentProps: { allowClear: true },
      rules: z
        .string()
        .min(6, '至少6位')
        .max(100, '过长')
        .optional()
        .or(z.literal('')),
      dependencies: {
        show: (values) => !currentUser.value?.admin_user_id,
        triggerFields: [],
      },
    },
    {
      component: 'Input',
      fieldName: 'org_id',
      label: '组织ID',
      componentProps: { allowClear: true },
      rules: z.string().max(200, '过长').optional(),
    },
  ],
});

const [RoleForm, roleFormApi] = useVbenForm({
  showDefaultActions: false,
  schema: [
    {
      component: 'Select',
      fieldName: 'role_codes',
      label: '角色编码',
      componentProps: {
        mode: 'multiple',
        options: roleOptions,
        showSearch: true,
        optionFilterProp: 'label',
        allowClear: true,
      },
      rules: z.array(z.string()).min(1, '至少选择1个角色'),
    },
  ],
});

const [PasswordForm, passwordFormApi] = useVbenForm({
  showDefaultActions: false,
  schema: [
    {
      component: 'InputPassword',
      fieldName: 'new_password',
      label: '新密码',
      rules: z.string().min(6, '至少6位').max(100, '过长'),
    },
  ],
});

const onActionClick: OnActionClickFn<IamAdminUser> = ({ code, row }) => {
  switch (code) {
    case 'edit':
      openUserDrawer(row);
      break;
    case 'status':
      toggleStatus(row);
      break;
    case 'role':
      openRoleDrawer(row);
      break;
    case 'pwd':
      openPasswordDrawer(row);
      break;
    default:
      break;
  }
};

function getColumns(onActionClickFn: OnActionClickFn<IamAdminUser>) {
  return [
    { field: 'name', title: '姓名', minWidth: 140 },
    { field: 'email', title: '邮箱', minWidth: 200 },
    { field: 'org_id', title: '组织ID', minWidth: 180 },
    {
      field: 'is_active',
      title: '状态',
      width: 120,
      slots: { default: 'status' },
    },
    {
      title: '操作',
      field: 'operation',
      fixed: 'right',
      width: 300,
      showOverflow: false,
      cellRender: {
        name: 'CellOperation',
        options: [
          { code: 'role', text: '绑定角色' },
          { code: 'pwd', text: '重置密码' },
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
            const items = await fetchAdminUsers();
            return items;
          } catch (error) {
            console.error('[IAM AdminUser] fetchAdminUsers failed', error);
            return [];
          }
        },
      },
      response: { result: ({ response }: any) => response },
    } as any,
    rowConfig: { keyField: 'admin_user_id' },
    toolbarConfig: { custom: true, export: false, refresh: true, zoom: true },
  } as VxeTableGridOptions,
});

onMounted(async () => {
  await loadRoleOptions();
  nextTick(() => gridApi.query());
});

async function loadRoleOptions() {
  try {
    const list = await fetchRoles({ limit: 200, offset: 0 });
    roleOptions.value = list.map((item: IamRole) => ({
      label: `${item.code}（${item.name}）`,
      value: item.code,
    }));
  } catch (error) {
    console.error('[IAM AdminUser] fetchRoles failed', error);
  }
}

function openUserDrawer(row?: IamAdminUser) {
  currentUser.value = row ?? null;
  userDrawerApi.open();
  nextTick(() => {
    userFormApi.resetForm();
    if (row) {
      userFormApi.setValues({ ...row, password: undefined });
    }
  });
}

function onCreate() {
  openUserDrawer();
}

async function onSubmitUser() {
  const { valid } = await userFormApi.validate();
  if (!valid) return;
  userDrawerApi.lock();
  const values = await userFormApi.getValues<any>();
  const payload = { ...values } as any;
  if (!payload.password) delete payload.password;
  try {
    if (currentUser.value?.admin_user_id) {
      await updateAdminUser(currentUser.value.admin_user_id, payload);
      message.success('更新成功');
    } else {
      await createAdminUser(payload as any);
      message.success('创建成功');
    }
    userDrawerApi.close();
    gridApi.query();
  } finally {
    userDrawerApi.unlock();
  }
}

function renderStatus(isActive: ActiveStatus) {
  return isActive
    ? { text: '已启用', color: 'green' }
    : { text: '已禁用', color: 'red' };
}

function toggleStatus(row: IamAdminUser) {
  const nextStatus: ActiveStatus = !row.is_active;
  const hide = message.loading({ content: '正在更新状态', duration: 0 });
  updateAdminUserStatus(row.admin_user_id, nextStatus)
    .then(() => {
      message.success('状态已更新');
      gridApi.query();
    })
    .finally(() => hide());
}

function openRoleDrawer(row: IamAdminUser) {
  targetUserForRoles.value = row;
  roleDrawerApi.open();
  nextTick(() => {
    roleFormApi.resetForm();
    roleFormApi.setValues({ role_codes: [] });
  });
}

async function onSubmitBindRoles() {
  const { valid } = await roleFormApi.validate();
  if (!valid || !targetUserForRoles.value) return;
  roleDrawerApi.lock();
  const values = await roleFormApi.getValues<{ role_codes: string[] }>();
  try {
    await bindRolesToAdminUser(targetUserForRoles.value.admin_user_id, values.role_codes);
    message.success('绑定成功');
    roleDrawerApi.close();
  } finally {
    roleDrawerApi.unlock();
  }
}

function openPasswordDrawer(row: IamAdminUser) {
  targetUserForPwd.value = row;
  passwordDrawerApi.open();
  nextTick(() => passwordFormApi.resetForm());
}

async function onSubmitResetPassword() {
  const { valid } = await passwordFormApi.validate();
  if (!valid || !targetUserForPwd.value) return;
  passwordDrawerApi.lock();
  const values = await passwordFormApi.getValues<{ new_password: string }>();
  try {
    await resetAdminUserPassword(targetUserForPwd.value.admin_user_id, values.new_password);
    message.success('已重置密码');
    passwordDrawerApi.close();
  } finally {
    passwordDrawerApi.unlock();
  }
}
</script>

<template>
  <Page auto-content-height>
    <UserDrawer :title="currentUser ? '编辑管理员' : '新增管理员'">
      <UserForm class="mx-4" layout="vertical" />
      <template #footer>
        <div class="flex justify-end gap-2 pr-4 pb-2">
          <Button @click="userDrawerApi.close()">取消</Button>
          <Button type="primary" @click="onSubmitUser">保存</Button>
        </div>
      </template>
    </UserDrawer>

    <RoleDrawer :title="`绑定角色 - ${targetUserForRoles?.name ?? ''}`">
      <RoleForm class="mx-4" layout="vertical" />
      <template #footer>
        <div class="flex justify-end gap-2 pr-4 pb-2">
          <Button @click="roleDrawerApi.close()">取消</Button>
          <Button type="primary" @click="onSubmitBindRoles">保存</Button>
        </div>
      </template>
    </RoleDrawer>

    <PasswordDrawer :title="`重置密码 - ${targetUserForPwd?.name ?? ''}`">
      <PasswordForm class="mx-4" layout="vertical" />
      <template #footer>
        <div class="flex justify-end gap-2 pr-4 pb-2">
          <Button @click="passwordDrawerApi.close()">取消</Button>
          <Button type="primary" @click="onSubmitResetPassword">保存</Button>
        </div>
      </template>
    </PasswordDrawer>

    <Grid table-title="用户列表">
      <template #toolbar-tools>
        <Button type="primary" @click="onCreate">新增管理员</Button>
      </template>

      <template #status="{ row }">
        <Tag :color="renderStatus(row.is_active).color">
          {{ renderStatus(row.is_active).text }}
        </Tag>
      </template>
    </Grid>
  </Page>
</template>

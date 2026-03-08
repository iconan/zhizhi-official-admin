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
  fetchAdminUserDetail,
  resetAdminUserPassword,
  type IamAdminUser,
  updateAdminUser,
  updateAdminUserStatus,
} from '#/api/iam/user';
import { fetchOrgs, type IamOrg } from '#/api/iam/org';
import { fetchRoles, type IamRole } from '#/api/iam/role';

type ActiveStatus = boolean;

const [UserDrawer, userDrawerApi] = useVbenDrawer({ destroyOnClose: true });
const [RoleDrawer, roleDrawerApi] = useVbenDrawer({ destroyOnClose: true });
const [PasswordDrawer, passwordDrawerApi] = useVbenDrawer({ destroyOnClose: true });

const currentUser = ref<IamAdminUser | null>(null);
const isEditing = ref(false);
const targetUserForRoles = ref<IamAdminUser | null>(null);
const targetUserForPwd = ref<IamAdminUser | null>(null);
const roleOptions = ref<{ label: string; value: string }[]>([]);
const roleMap = ref<Record<string, string>>({});
const orgOptions = ref<{ label: string; value: string }[]>([]);
const orgTreeOptions = ref<any[]>([]);

const userPasswordSchema = {
  component: 'InputPassword',
  fieldName: 'password',
  label: '密码',
  componentProps: { allowClear: true },
  rules: z.string().min(6, '至少6位').max(100, '过长'),
} as const;

const userBaseSchema = [
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
    component: 'TreeSelect',
    fieldName: 'org_id',
    label: '所属组织',
    componentProps: {
      allowClear: true,
      showSearch: true,
      treeData: orgTreeOptions,
      treeDefaultExpandAll: true,
      placeholder: '选择组织',
      style: { width: '100%' },
      dropdownMatchSelectWidth: false,
      filterTreeNode: (input: string, node: any) =>
        (node?.label as string)?.toLowerCase()?.includes(input.toLowerCase()),
      onChange: (value: string) => {
        loadRoleOptionsForOrg(value);
        // 清空已选角色，避免跨组织脏数据
        roleFormApi.setValues({ role_codes: [] });
        userFormApi.setValues({ role_codes: [] });
      },
    },
    rules: z
      .string({ required_error: '请选择所属组织' })
      .min(1, '请选择所属组织')
      .max(200, '过长'),
  },
  {
    component: 'Select',
    fieldName: 'role_codes',
    label: '角色名称',
    componentProps: {
      mode: 'multiple',
      options: roleOptions,
      showSearch: true,
      optionFilterProp: 'label',
      allowClear: false,
      style: { width: '100%' },
      dropdownMatchSelectWidth: false,
    },
    rules: z
      .array(z.string(), { required_error: '请选择至少1个角色' })
      .min(1, '请选择至少1个角色'),
  },
] as const;

const [UserForm, userFormApi] = useVbenForm({
  showDefaultActions: false,
  schema: [userBaseSchema[0], userBaseSchema[1], userPasswordSchema, userBaseSchema[2], userBaseSchema[3]],
});

const [RoleForm, roleFormApi] = useVbenForm({
  showDefaultActions: false,
  schema: [
    {
      component: 'Select',
      fieldName: 'role_codes',
      label: '角色名称',
      componentProps: {
        mode: 'multiple',
        options: roleOptions,
        showSearch: true,
        optionFilterProp: 'label',
        allowClear: true,
        style: { width: '100%' },
        dropdownMatchSelectWidth: false,
      },
      rules: z.array(z.string()).min(1, '请选择至少1个角色'),
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
    { field: 'name', title: '用户名称', minWidth: 140 },
    { field: 'email', title: '邮箱', minWidth: 200 },
    {
      field: 'org_id',
      title: '所属组织',
      minWidth: 180,
      formatter: ({ cellValue }) => orgLabel(cellValue),
    },
    {
      field: 'roles',
      title: '所属角色',
      minWidth: 220,
      showOverflow: false,
      slots: { default: 'roles' },
    },
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
            const enriched = await Promise.all(
              items.map(async (item) => {
                try {
                  const detail = await fetchAdminUserDetail(item.admin_user_id);
                  return { ...item, ...((detail as any) ?? {}) };
                } catch (error) {
                  console.error('[IAM AdminUser] fetch detail failed', item.admin_user_id, error);
                  return item;
                }
              }),
            );
            // Build role label map from detail roles if available
            enriched.forEach((u) => {
              const roles = (u as any)?.roles || (u as any)?.role_codes || [];
              (roles as any[]).forEach((r) => {
                const code = typeof r === 'string' ? r : r?.code;
                const name = typeof r === 'string' ? undefined : r?.name;
                if (code) roleMap.value[code] = name ? `${code}（${name}）` : roleMap.value[code] ?? code;
              });
            });
            return enriched;
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
  await Promise.all([loadRoleOptionsForOrg(), loadOrgOptions()]);
  nextTick(() => gridApi.query());
});

async function loadRoleOptionsForOrg(orgId?: string | null) {
  try {
    const list = await fetchRoles({ limit: 200, offset: 0, org_id: orgId || undefined });
    roleOptions.value = list.map((item: IamRole) => ({
      label: `${item.code}（${item.name}）`,
      value: item.code,
    }));
    list.forEach((item: IamRole) => {
      roleMap.value[item.code] = `${item.code}（${item.name}）`;
    });
  } catch (error) {
    console.error('[IAM AdminUser] fetchRoles failed', error);
  }
}

async function loadOrgOptions() {
  try {
    const list = await fetchOrgs({ limit: 200, offset: 0, status: 'active' });
    orgOptions.value = list.map((item: IamOrg) => ({
      label: `${item.name} (${item.org_id.slice(0, 8)})`,
      value: item.org_id,
    }));
    orgTreeOptions.value = buildOrgTree(list);
  } catch (error) {
    console.error('[IAM AdminUser] fetchOrgs failed', error);
  }
}

function orgLabel(id?: string | null) {
  if (!id) return '';
  return orgOptions.value.find((item) => item.value === id)?.label ?? id;
}

function roleLabel(code?: string) {
  if (!code) return '';
  return roleMap.value[code] ?? roleOptions.value.find((item) => item.value === code)?.label ?? code;
}

function buildOrgTree(list: IamOrg[]) {
  const nodes: Record<string, any> = {};
  list.forEach((item) => {
    nodes[item.org_id] = nodes[item.org_id] || {};
    nodes[item.org_id] = {
      value: item.org_id,
      label: `${item.name}`,
      children: nodes[item.org_id].children || [],
    };
  });
  const roots: any[] = [];
  list.forEach((item) => {
    const node = nodes[item.org_id];
    if (item.parent_id && nodes[item.parent_id]) {
      nodes[item.parent_id].children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function openUserDrawer(row?: IamAdminUser) {
  currentUser.value = row ?? null;
  isEditing.value = !!row?.admin_user_id;
  userDrawerApi.open();
  nextTick(async () => {
    userFormApi.setState({
      schema: row
        ? [userBaseSchema[0], userBaseSchema[1], userBaseSchema[2], userBaseSchema[3]]
        : [userBaseSchema[0], userBaseSchema[1], userPasswordSchema, userBaseSchema[2], userBaseSchema[3]],
    });
    await userFormApi.resetForm();
    if (row) {
      const roles = (row as any)?.roles || (row as any)?.role_codes || [];
      const normalizedRoles = (roles as any[]).map((item) =>
        typeof item === 'string' ? item : item?.code,
      );
      userFormApi.setValues({ ...row, password: undefined, role_codes: normalizedRoles });
    }
  });
  loadRoleOptionsForOrg(row?.org_id);
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
  const roleCodes: string[] = (payload.role_codes as any[]) || [];
  delete payload.role_codes;
  try {
    if (currentUser.value?.admin_user_id) {
      await updateAdminUser(currentUser.value.admin_user_id, payload);
      if (roleCodes.length) {
        await bindRolesToAdminUser(currentUser.value.admin_user_id, roleCodes);
      }
      message.success('更新成功');
    } else {
      const created: any = await createAdminUser(payload as any);
      const newId =
        currentUser.value?.admin_user_id ||
        created?.admin_user_id ||
        created?.data?.admin_user_id ||
        created?.data?.adminUserId;
      if (newId && roleCodes.length) {
        await bindRolesToAdminUser(newId, roleCodes);
      }
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
    const roles = (row as any)?.roles || (row as any)?.role_codes || [];
    const normalized = (roles as any[]).map((item) =>
      typeof item === 'string' ? item : item?.code,
    );
    roleFormApi.setValues({ role_codes: normalized });
  });
  // refresh role options scoped to user's org
  loadRoleOptionsForOrg(row.org_id);
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
    gridApi.query();
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
    gridApi.query();
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
      <template #roles="{ row }">
        <div class="flex flex-wrap gap-1">
          <Tag v-if="!(row.roles?.length) && !(row.role_codes?.length)" color="default">-</Tag>
          <Tag
            v-for="code in (row.roles || row.role_codes || [])"
            :key="typeof code === 'string' ? code : code?.code"
            color="blue"
          >
            {{ roleLabel(typeof code === 'string' ? code : code?.code) }}
          </Tag>
        </div>
      </template>
    </Grid>
  </Page>
</template>

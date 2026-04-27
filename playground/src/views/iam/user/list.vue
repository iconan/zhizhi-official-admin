<script lang="ts" setup>
import type { OnActionClickFn, VxeTableGridOptions } from '#/adapter/vxe-table';
import type { IamRole } from '#/api/iam/role';
import type { IamAdminUser } from '#/api/iam/user';

import { nextTick, onMounted, ref } from 'vue';

import { Page, useVbenDrawer } from '@vben/common-ui';

import { Button, message, Tag } from 'ant-design-vue';

import { useVbenForm, z } from '#/adapter/form';
import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { fetchRoles } from '#/api/iam/role';
import {
  bindRolesToAdminUser,
  createAdminUser,
  fetchAdminUserDetail,
  fetchAdminUsers,
  resetAdminUserPassword,
  updateAdminUser,
  updateAdminUserStatus,
} from '#/api/iam/user';
import { useFieldScopeStore } from '#/store/field-scope';
import {
  getActiveOrgOptions,
  getActiveOrgTreeOptions,
  getAllOrgOptions,
} from '#/store/tree-data';

const fieldScopeStore = useFieldScopeStore();

type ActiveStatus = boolean;

const [UserDrawer, userDrawerApi] = useVbenDrawer({ destroyOnClose: true });
const [RoleDrawer, roleDrawerApi] = useVbenDrawer({ destroyOnClose: true });
const [PasswordDrawer, passwordDrawerApi] = useVbenDrawer({
  destroyOnClose: true,
});

const currentUser = ref<IamAdminUser | null>(null);
const isEditing = ref(false);
const targetUserForRoles = ref<IamAdminUser | null>(null);
const targetUserForPwd = ref<IamAdminUser | null>(null);
const roleOptions = ref<{ label: string; value: string }[]>([]); // active roles for forms
const roleMap = ref<Record<string, string>>({}); // all roles for label mapping
const orgOptions = ref<{ label: string; value: string }[]>([]); // active orgs for forms
const orgOptionsAll = ref<{ label: string; value: string }[]>([]); // all orgs for label mapping
const orgTreeOptions = ref<any[]>([]);

const normalizeRoleCode = (val: any): string =>
  typeof val === 'string' ? val : ((val?.code as string | undefined) ?? '');

function getRowOrgId(row: any): null | string | undefined {
  return row?.org_id ?? row?.org?.org_id ?? row?.org?.id;
}

function getRowOrgName(row: any): string | undefined {
  return row?.org_name ?? row?.org?.name ?? row?.org?.label;
}

function getRowRoles(row: any): any[] {
  const roles = row?.roles ?? row?.role_codes ?? row?.role_names ?? [];
  return Array.isArray(roles) ? roles : [];
}

function normalizeRoleDisplay(item: any): { code: string; label: string } {
  if (typeof item === 'string') {
    return {
      code: item,
      label: roleMap.value[item] ?? item,
    };
  }

  const code = normalizeRoleCode(item);
  const name = item?.name as string | undefined;
  const label =
    name && code ? `${code}（${name}）` : (roleMap.value[code] ?? name ?? code);
  return { code, label };
}

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
    label: '用户名称',
    rules: z.string().min(1, '请输入用户名称').max(100, '过长'),
  },
  {
    component: 'TreeSelect',
    fieldName: 'org_id',
    label: '所属组织',
    defaultValue: null,
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
        void loadRoleOptionsForOrg(value);
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
  schema: [
    userBaseSchema[0],
    userBaseSchema[1],
    userPasswordSchema,
    userBaseSchema[2],
    userBaseSchema[3],
  ],
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
    case 'edit': {
      openUserDrawer(row);
      break;
    }
    case 'pwd': {
      openPasswordDrawer(row);
      break;
    }
    case 'role': {
      openRoleDrawer(row);
      break;
    }
    case 'status': {
      toggleStatus(row);
      break;
    }
    default: {
      break;
    }
  }
};

function getColumns(onActionClickFn: OnActionClickFn<IamAdminUser>) {
  const rawColumns = [
    { field: 'name', title: '用户名称', minWidth: 140 },
    // sensitive: 缺少 admin_user:field:email:view 时该列不渲染
    { field: 'email', title: '邮箱', minWidth: 200, sensitive: true },
    {
      field: 'org_id',
      title: '所属组织',
      minWidth: 180,
      formatter: ({ cellValue, row }: { cellValue: null | string; row: any }) =>
        orgLabel(cellValue ?? getRowOrgId(row), getRowOrgName(row)),
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
  return fieldScopeStore.filterColumns(rawColumns as any, 'admin_user');
}

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: {
    columns: getColumns(onActionClick),
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
            const { items, total } = await fetchAdminUsers({ limit, offset });
            const enriched = await Promise.all(
              items.map(async (item: IamAdminUser) => {
                try {
                  const detail = await fetchAdminUserDetail(item.admin_user_id);
                  return {
                    ...item,
                    ...(detail as any),
                    org_id:
                      getRowOrgId((detail as any) ?? item) ??
                      getRowOrgId(item) ??
                      null,
                    org_name:
                      getRowOrgName((detail as any) ?? item) ??
                      getRowOrgName(item),
                    roles:
                      getRowRoles((detail as any) ?? item).length > 0
                        ? getRowRoles((detail as any) ?? item)
                        : getRowRoles(item),
                  };
                } catch (error) {
                  console.error(
                    '[IAM AdminUser] fetch detail failed',
                    item.admin_user_id,
                    error,
                  );
                  return item;
                }
              }),
            );
            // Build role label map from detail roles if available
            enriched.forEach((u: any) => {
              const roles = getRowRoles(u);
              (roles as any[])
                .map((r: any) => normalizeRoleDisplay(r))
                .filter((r) => r.code || r.label)
                .forEach(({ code, label }) => {
                  if (code) {
                    roleMap.value[code] = label;
                  }
                });
            });
            return { items: enriched, total } as any;
          } catch (error) {
            console.error('[IAM AdminUser] fetchAdminUsers failed', error);
            message.error('加载用户列表失败，请稍后重试');
            return { items: [], total: 0 } as any;
          }
        },
      },
    } as any,
    rowConfig: { keyField: 'admin_user_id' },
    toolbarConfig: { custom: true, export: false, refresh: true, zoom: true },
  } as VxeTableGridOptions,
});

onMounted(async () => {
  // 先加载字段级权限映射，再重建列定义，避免敏感列闪烁
  await fieldScopeStore.ensureLoaded();
  gridApi.setGridOptions({ columns: getColumns(onActionClick) });
  await Promise.all([loadRoleOptionsForOrg(), loadOrgOptions()]);
  nextTick(() => void gridApi.query());
});

async function loadRoleOptionsForOrg(orgId?: null | string) {
  try {
    const { items: list } = await fetchRoles({
      limit: 200,
      offset: 0,
      org_id: orgId || undefined,
    });
    const activeList = list.filter((item: IamRole) => item.status === 'active');
    roleOptions.value = activeList.map((item: IamRole) => ({
      label: `${item.code}（${item.name}）`,
      value: item.code,
    }));
    list.forEach((item: IamRole) => {
      roleMap.value[item.code] = `${item.code}（${item.name}）`;
    });
  } catch (error) {
    console.error('[IAM AdminUser] fetchRoles failed', error);
    message.error('加载角色选项失败，请稍后重试');
  }
}

async function loadOrgOptions() {
  try {
    orgOptions.value = await getActiveOrgOptions();
    orgOptionsAll.value = await getAllOrgOptions();
    orgTreeOptions.value = await getActiveOrgTreeOptions();
  } catch (error) {
    console.error('[IAM AdminUser] fetchOrgs failed', error);
    message.error('加载组织选项失败，请稍后重试');
  }
}

function orgLabel(id?: null | string, fallbackName?: string) {
  if (!id) return fallbackName ?? '';
  return (
    orgOptionsAll.value.find((item) => item.value === id)?.label ??
    fallbackName ??
    id
  );
}

function openUserDrawer(row?: IamAdminUser) {
  currentUser.value = row ?? null;
  isEditing.value = !!row?.admin_user_id;
  userDrawerApi.open();
  nextTick(async () => {
    userFormApi.setState({
      schema: row
        ? [
            userBaseSchema[0],
            userBaseSchema[1],
            userBaseSchema[2],
            userBaseSchema[3],
          ]
        : [
            userBaseSchema[0],
            userBaseSchema[1],
            userPasswordSchema,
            userBaseSchema[2],
            userBaseSchema[3],
          ],
    });
    await userFormApi.resetForm();
    if (row) {
      const roles = getRowRoles(row);
      const normalizedRoles = (roles as any[])
        .map((item) => normalizeRoleDisplay(item).code)
        .filter(Boolean);
      userFormApi.setValues({
        ...row,
        org_id: getRowOrgId(row) ?? null,
        password: undefined,
        role_codes: normalizedRoles,
      });
    }
  });
  void loadRoleOptionsForOrg(getRowOrgId(row));
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
      if (roleCodes.length > 0) {
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
      if (newId && roleCodes.length > 0) {
        await bindRolesToAdminUser(newId, roleCodes);
      }
      message.success('创建成功');
    }
    userDrawerApi.close();
    void gridApi.query();
  } finally {
    userDrawerApi.unlock();
  }
}

function renderStatus(isActive: ActiveStatus) {
  return isActive
    ? { text: '已启用', color: 'green' }
    : { text: '已禁用', color: 'red' };
}

function normalizedRoleLabels(row: any): string[] {
  return getRowRoles(row)
    .map((item) => normalizeRoleDisplay(item))
    .filter((item) => item.code || item.label)
    .map((item) => item.label || item.code)
    .filter(Boolean);
}

function toggleStatus(row: IamAdminUser) {
  const nextStatus: ActiveStatus = !row.is_active;
  const hide = message.loading({ content: '正在更新状态', duration: 0 });
  updateAdminUserStatus(row.admin_user_id, nextStatus)
    .then(() => {
      message.success('状态已更新');
      void gridApi.query();
    })
    .catch((error) => {
      // 错误提示由全局拦截器统一处理
      console.error('[IAM AdminUser] update status failed', error);
    })
    .finally(() => hide());
}

function openRoleDrawer(row: IamAdminUser) {
  targetUserForRoles.value = row;
  roleDrawerApi.open();
  nextTick(() => {
    void roleFormApi.resetForm();
    const normalized = getRowRoles(row)
      .map((item) => normalizeRoleDisplay(item).code)
      .filter(Boolean);
    roleFormApi.setValues({ role_codes: normalized });
  });
  // refresh role options scoped to user's org
  void loadRoleOptionsForOrg(getRowOrgId(row));
}

async function onSubmitBindRoles() {
  const { valid } = await roleFormApi.validate();
  if (!valid || !targetUserForRoles.value) return;
  roleDrawerApi.lock();
  const values = await roleFormApi.getValues<{ role_codes: string[] }>();
  try {
    await bindRolesToAdminUser(
      targetUserForRoles.value.admin_user_id,
      values.role_codes,
    );
    message.success('绑定成功');
    roleDrawerApi.close();
    void gridApi.query();
  } finally {
    roleDrawerApi.unlock();
  }
}

function openPasswordDrawer(row: IamAdminUser) {
  targetUserForPwd.value = row;
  passwordDrawerApi.open();
  nextTick(() => void passwordFormApi.resetForm());
}

async function onSubmitResetPassword() {
  const { valid } = await passwordFormApi.validate();
  if (!valid || !targetUserForPwd.value) return;
  passwordDrawerApi.lock();
  const values = await passwordFormApi.getValues<{ new_password: string }>();
  try {
    await resetAdminUserPassword(
      targetUserForPwd.value.admin_user_id,
      values.new_password,
    );
    message.success('已重置密码');
    passwordDrawerApi.close();
    gridApi.query();
  } finally {
    passwordDrawerApi.unlock();
  }
}

function handleClickSubmitUser() {
  void onSubmitUser();
}

function handleClickBindRoles() {
  void onSubmitBindRoles();
}

function handleClickResetPassword() {
  void onSubmitResetPassword();
}
</script>

<template>
  <Page auto-content-height>
    <UserDrawer :title="currentUser ? '编辑管理员' : '新增管理员'">
      <UserForm class="mx-4" layout="vertical" />
      <template #footer>
        <div class="flex justify-end gap-2 pb-2 pr-4">
          <Button @click="userDrawerApi.close()">取消</Button>
          <Button type="primary" @click="handleClickSubmitUser">保存</Button>
        </div>
      </template>
    </UserDrawer>

    <RoleDrawer :title="`绑定角色 - ${targetUserForRoles?.name ?? ''}`">
      <RoleForm class="mx-4" layout="vertical" />
      <template #footer>
        <div class="flex justify-end gap-2 pb-2 pr-4">
          <Button @click="roleDrawerApi.close()">取消</Button>
          <Button type="primary" @click="handleClickBindRoles">保存</Button>
        </div>
      </template>
    </RoleDrawer>

    <PasswordDrawer :title="`重置密码 - ${targetUserForPwd?.name ?? ''}`">
      <PasswordForm class="mx-4" layout="vertical" />
      <template #footer>
        <div class="flex justify-end gap-2 pb-2 pr-4">
          <Button @click="passwordDrawerApi.close()">取消</Button>
          <Button type="primary" @click="handleClickResetPassword">保存</Button>
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
          <Tag v-if="normalizedRoleLabels(row).length === 0" color="default">
            -
          </Tag>
          <Tag
            v-for="label in normalizedRoleLabels(row)"
            :key="label"
            color="blue"
          >
            {{ label }}
          </Tag>
        </div>
      </template>
    </Grid>
  </Page>
</template>

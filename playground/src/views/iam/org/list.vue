<script lang="ts" setup>
import type { OnActionClickFn, VxeTableGridOptions } from '#/adapter/vxe-table';

import { Page, useVbenDrawer } from '@vben/common-ui';
import { Button, message, Tag } from 'ant-design-vue';
import { nextTick, onMounted, ref } from 'vue';

import { useVbenForm, z } from '#/adapter/form';
import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { createOrg, fetchOrgs, type IamOrg, updateOrg, updateOrgStatus } from '#/api/iam/org';
import { fetchAdminUsers, type IamAdminUser } from '#/api/iam/user';
import { getActiveOrgOptions, getActiveOrgTreeOptions, getAllOrgOptions } from '#/store/tree-data';

type OrgStatus = IamOrg['status'];

const [OrgDrawer, orgDrawerApi] = useVbenDrawer({ destroyOnClose: true });
const currentOrg = ref<IamOrg | null>(null);

const ownerOptions = ref<{ label: string; value: string }[]>([]);
const orgOptions = ref<{ label: string; value: string }[]>([]); // active orgs for form selects
const orgOptionsAll = ref<{ label: string; value: string }[]>([]); // all orgs for label mapping
const orgTreeOptions = ref<any[]>([]);

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
      component: 'Select',
      fieldName: 'owner_id',
      label: '负责人',
      componentProps: {
        allowClear: true,
        showSearch: true,
        optionFilterProp: 'label',
        options: ownerOptions,
        placeholder: '选择负责人',
        style: { width: '100%' },
        dropdownMatchSelectWidth: false,
      },
      rules: z.string().max(200, '过长').optional(),
    },
    {
      component: 'TreeSelect',
      fieldName: 'parent_id',
      label: '上级组织',
      componentProps: {
        allowClear: true,
        treeData: orgTreeOptions,
        fieldNames: { label: 'label', value: 'value', children: 'children' },
        showSearch: true,
        treeDefaultExpandAll: true,
        placeholder: '选择上级组织',
        filterTreeNode: true,
        style: { width: '100%' },
        dropdownMatchSelectWidth: false,
      },
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
      componentProps: { min: 0, max: 999999, style: { width: '100%' } },
    },
    {
      component: 'Select',
      fieldName: 'entitled_regions',
      label: '授权区域',
      componentProps: {
        mode: 'tags',
        allowClear: true,
        tokenSeparators: [',', '，', ' '],
        placeholder: '可输入或选择多个区域',
        style: { width: '100%' },
      },
      rules: z.array(z.string()).max(50, '过多').optional(),
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
    { field: 'name', title: '名称', minWidth: 180, treeNode: true },
    {
      field: 'parent_id',
      title: '上级组织',
      minWidth: 200,
      formatter: ({ cellValue }) => orgLabel(cellValue),
    },
    {
      field: 'owner_id',
      title: '负责人',
      minWidth: 200,
      formatter: ({ cellValue }) => ownerLabel(cellValue),
    },
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
    treeConfig: {
      rowField: 'org_id',
      parentField: 'parent_id',
      transform: true,
      expandAll: true,
    },
    toolbarConfig: { custom: true, export: false, refresh: true, zoom: true },
  } as VxeTableGridOptions,
});

onMounted(async () => {
  await loadSelectOptions();
  nextTick(() => gridApi.query());
});

function openDrawer(row?: IamOrg) {
  currentOrg.value = row ?? null;
  orgDrawerApi.open();
  nextTick(() => {
    orgFormApi.resetForm();
    if (row) {
      orgFormApi.setValues({ ...row });
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

async function loadSelectOptions() {
  try {
    const [admins, orgs] = await Promise.all([
      fetchAdminUsers({ limit: 200, offset: 0 }),
      fetchOrgs({ limit: 200, offset: 0 }),
    ]);
    ownerOptions.value = admins.map((item: IamAdminUser) => ({
      label: `${item.name || item.email} (${item.admin_user_id.slice(0, 8)})`,
      value: item.admin_user_id,
    }));
    orgOptions.value = await getActiveOrgOptions();
    orgOptionsAll.value = await getAllOrgOptions();
    orgTreeOptions.value = await getActiveOrgTreeOptions();
  } catch (error) {
    console.error('[IAM Org] load select options failed', error);
  }
}

function ownerLabel(id?: string | null) {
  if (!id) return '';
  return ownerOptions.value.find((item) => item.value === id)?.label ?? id;
}

function orgLabel(id?: string | null) {
  if (!id) return '';
  return orgOptionsAll.value.find((item) => item.value === id)?.label ?? id;
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

  const doUpdate = () => {
    const hide = message.loading({ content: '正在更新状态', duration: 0 });
    updateOrgStatus(row.org_id, nextStatus)
      .then(() => {
        message.success('状态已更新');
        gridApi.query();
      })
      .catch((error) => {
        console.error('[IAM Org] update status failed', error);
        message.error('更新失败');
      })
      .finally(() => hide());
  };

  doUpdate();
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

    <Grid table-title="组织列表">
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

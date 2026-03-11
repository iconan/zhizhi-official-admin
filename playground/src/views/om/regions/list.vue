<script lang="ts" setup>
import type { VxeTableGridOptions, OnActionClickFn } from '#/adapter/vxe-table';

import { Page, useVbenDrawer } from '@vben/common-ui';
import { Button, message, Modal, Tag } from 'ant-design-vue';
import { nextTick, onMounted, ref } from 'vue';

import { useVbenForm, z } from '#/adapter/form';
import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  createRegion,
  deleteRegion,
  fetchRegions,
  updateRegion,
  type RegionActiveStatus,
  type Region,
} from '#/api/om/region';

interface RegionOption {
  label: string;
  value: string;
}

type RegionStatus = RegionActiveStatus;

type ActionCode = 'edit' | 'delete' | 'status';

const regionOptions = ref<RegionOption[]>([]);
const regionMap = ref<Record<string, string>>({});
const regionTreeOptions = ref<any[]>([]);
const currentRegionId = ref<string | null>(null);

const [FormDrawer, formDrawerApi] = useVbenDrawer({ destroyOnClose: true });

const levelOptions = [
  { label: '全国(1)', value: 1 },
  { label: '省级(2)', value: 2 },
  { label: '市级(3)', value: 3 },
  { label: '区县(4)', value: 4 },
];

const levelLabelMap = levelOptions.reduce(
  (acc, item) => {
    acc[item.value] = item.label;
    return acc;
  },
  {} as Record<number, string>,
);

const [RegionForm, regionFormApi] = useVbenForm({
  showDefaultActions: false,
  schema: [
    {
      component: 'Input',
      fieldName: 'code',
      label: '区域编码',
      rules: z
        .string({ required_error: '请输入区域编码' })
        .min(6, '编码长度至少6位')
        .max(7, '编码长度不能超过7位'),
    },
    {
      component: 'Input',
      fieldName: 'name',
      label: '名称',
      rules: z.string({ required_error: '请输入名称' }).min(1, '请输入名称').max(100, '名称过长'),
    },
    {
      component: 'Select',
      defaultValue: null,
      fieldName: 'level',
      label: '级别',
      componentProps: {
        options: levelOptions,
        allowClear: false,
        placeholder: '请选择级别',
        style: { width: '100%' },
      },
      rules: z
        .union([
          z.number({ invalid_type_error: '请选择级别' }).min(1, '请选择级别').max(4, '级别过大'),
          z.null(),
          z.undefined(),
        ])
        .refine((value) => value !== null && value !== undefined, { message: '请选择级别' }),
    },
    {
      component: 'TreeSelect',
      fieldName: 'parent_code',
      label: '上级区域',
      componentProps: {
        allowClear: true,
        showSearch: true,
        treeDefaultExpandAll: false,
        treeData: regionTreeOptions,
        treeNodeFilterProp: 'label',
        fieldNames: { label: 'label', value: 'value', children: 'children' },
        placeholder: '可选择上级区域',
        style: { width: '100%' },
      },
      rules: z.string().max(32).optional(),
    },
    {
      component: 'Input',
      fieldName: 'full_name',
      label: '全称',
      componentProps: { allowClear: true },
      rules: z.string().max(200, '全称过长').optional(),
    },
    {
      component: 'Switch',
      fieldName: 'is_active',
      label: '启用状态',
      componentProps: {
        checkedValue: 1,
        unCheckedValue: -1,
      },
      defaultValue: 1,
    },
  ],
});

const initialLoading = ref(true);

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
        query: async ({ page }: any, formValues: any) => {
          try {
            const limit = page?.pageSize || 20;
            const offset = ((page?.currentPage || 1) - 1) * limit;
            const { items, total } = await fetchRegions({
              limit,
              offset,
              code: formValues?.code || undefined,
              keyword: formValues?.keyword || undefined,
              level: formValues?.level || undefined,
              is_active: formValues?.is_active || undefined,
            });
            return { items, total } as any;
          } catch (error) {
            console.error('[OM Regions] fetchRegions failed', error);
            return { items: [], total: 0 } as any;
          }
        },
      },
    } as any,
    rowConfig: { keyField: 'id' },
    toolbarConfig: { custom: true, export: false, refresh: true, zoom: true },
  } as VxeTableGridOptions,
  formOptions: {
    schema: [
      {
        component: 'Input',
        fieldName: 'code',
        label: '区域编码',
        componentProps: { allowClear: true, placeholder: '精确编码' },
      },
      {
        component: 'Input',
        fieldName: 'keyword',
        label: '关键词',
        componentProps: { allowClear: true, placeholder: '名称或编码' },
      },
      {
        component: 'Select',
        fieldName: 'level',
        label: '级别',
        componentProps: {
          options: levelOptions,
          allowClear: true,
          placeholder: '全部级别',
          style: { width: '100%' },
        },
      },
      {
        component: 'Select',
        fieldName: 'is_active',
        label: '状态',
        componentProps: {
          options: [
            { label: '已启用', value: 1 },
            { label: '已禁用', value: -1 },
          ],
          allowClear: true,
          style: { width: '100%' },
        },
      },
    ],
    submitOnChange: true,
  },
});

onMounted(async () => {
  initialLoading.value = true;
  gridApi.setLoading?.(true);
  try {
    await loadRegionOptions();
    await nextTick();
    await gridApi.query();
  } finally {
    initialLoading.value = false;
    gridApi.setLoading?.(false);
  }
});

async function loadRegionOptions() {
  try {
    const { items } = await fetchRegions({ limit: 10000, offset: 0 });
    const uniqItems = Array.from(new Map(items.map((i) => [i.code, i])).values());
    regionOptions.value = uniqItems.map((item) => ({ label: `${item.name} (${item.code})`, value: item.code }));
    regionMap.value = uniqItems.reduce((acc, cur) => {
      acc[cur.code] = `${cur.name}`;
      return acc;
    }, {} as Record<string, string>);

    // 构造父子树，供 TreeSelect 使用
    const nodeMap: Record<string, any> = {};
    uniqItems.forEach((item) => {
      nodeMap[item.code] = {
        title: `${item.name} (${item.code})`,
        label: `${item.name} (${item.code})`,
        value: item.code,
        key: item.code,
        children: [],
      };
    });
    const roots: any[] = [];
    uniqItems.forEach((item) => {
      const node = nodeMap[item.code];
      if (item.parent_code && nodeMap[item.parent_code]) {
        nodeMap[item.parent_code].children.push(node);
      } else {
        roots.push(node);
      }
    });
    regionTreeOptions.value = roots;
  } catch (error) {
    console.error('[OM Regions] loadRegionOptions failed', error);
  }
}

function onActionClick(params: Parameters<OnActionClickFn<Region>>[0]) {
  const { code, row } = params;
  switch (code as ActionCode) {
    case 'edit':
      openDrawer(row);
      break;
    case 'delete':
      confirmDelete(row);
      break;
    case 'status':
      toggleStatus(row);
      break;
    default:
      break;
  }
}

function getColumns(onActionClickFn: OnActionClickFn<Region>) {
  return [
    { field: 'code', title: '编码', width: 160 },
    { field: 'name', title: '名称', minWidth: 160 },
    { field: 'full_name', title: '全称', minWidth: 200 },
    {
      field: 'level',
      title: '级别',
      width: 110,
      formatter: ({ cellValue }: { cellValue: number }) => levelLabelMap[cellValue] || cellValue,
    },
    {
      field: 'parent_code',
      title: '上级区域',
      width: 200,
      formatter: ({ cellValue }: { cellValue: string }) => (cellValue ? regionMap.value[cellValue] || cellValue : ''),
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
      width: 240,
      showOverflow: false,
      cellRender: {
        name: 'CellOperation',
        options: [
          { code: 'status', text: '切换状态' },
          'edit',
          'delete',
        ],
        attrs: { onClick: onActionClickFn },
      },
    },
  ];
}

function onCreate() {
  openDrawer();
}

function openDrawer(row?: Region) {
  currentRegionId.value = row?.id ?? null;
  formDrawerApi.open();
  nextTick(async () => {
    await regionFormApi.resetForm();
    if (row) {
      const nextStatus: RegionActiveStatus = row.is_active === -1 ? -1 : 1;
      await regionFormApi.setValues({ ...row, is_active: nextStatus });
    } else {
      await regionFormApi.setValues({
        code: undefined,
        name: undefined,
        level: null,
        parent_code: undefined,
        full_name: undefined,
        is_active: 1,
      });
    }
  });
}

async function onSubmitRegion() {
  const { valid } = await regionFormApi.validate();
  if (!valid) return;
  formDrawerApi.lock();
  const values = await regionFormApi.getValues<Region>();
  const payload = {
    ...values,
    is_active: values.is_active === -1 ? -1 : 1,
  } as any;
  const isEdit = !!currentRegionId.value;
  try {
    if (isEdit) {
      await updateRegion(currentRegionId.value!, payload);
      message.success('更新成功');
    } else {
      await createRegion(payload as any);
      message.success('创建成功');
    }
    formDrawerApi.close();
    await gridApi.query();
    await loadRegionOptions();
  } finally {
    formDrawerApi.unlock();
  }
}

function confirmDelete(row: Region) {
  Modal.confirm({
    title: '确认删除该区域？',
    content: `删除后将无法恢复：${row.name} (${row.code})`,
    okText: '删除',
    cancelText: '取消',
    okButtonProps: { danger: true },
    onOk: async () => {
      const hide = message.loading({ content: '删除中...', duration: 0 });
      try {
        await deleteRegion(row.id || row.code);
        message.success('删除成功');
        await gridApi.query();
        await loadRegionOptions();
      } finally {
        hide();
      }
    },
  });
}

async function toggleStatus(row: Region) {
  const nextStatus: RegionStatus = row.is_active === 1 ? -1 : 1;
  const hide = message.loading({ content: '正在更新状态', duration: 0 });
  try {
    await updateRegion(row.id || row.code, { is_active: nextStatus });
    message.success('状态已更新');
    await gridApi.query();
  } finally {
    hide();
  }
}

function renderStatus(status: RegionStatus) {
  const map: Record<RegionStatus, { text: string; color: string }> = {
    1: { text: '已启用', color: 'green' },
    [-1]: { text: '已禁用', color: 'red' },
  } as const;
  return map[status === -1 ? -1 : 1];
}
</script>

<template>
  <Page auto-content-height>
    <FormDrawer title="行政区域" width="520px">
      <RegionForm class="px-4 pt-4" layout="vertical" />
      <template #footer>
        <div class="flex justify-end gap-2 pr-4 pb-3">
          <Button @click="formDrawerApi.close()">取消</Button>
          <Button type="primary" @click="onSubmitRegion">保存</Button>
        </div>
      </template>
    </FormDrawer>

    <Grid table-title="行政区域">
      <template #toolbar-tools>
        <Button type="primary" @click="onCreate">新增区域</Button>
      </template>

      <template #status="{ row }">
        <Tag :color="renderStatus(row.is_active).color">
          {{ renderStatus(row.is_active).text }}
        </Tag>
      </template>
    </Grid>
  </Page>
</template>

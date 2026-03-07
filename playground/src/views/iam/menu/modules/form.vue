<script lang="ts" setup>
import type { VbenFormSchema } from '#/adapter/form';

import { computed, onMounted, ref } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';
import { useVbenForm, z } from '#/adapter/form';
import { componentKeys } from '#/router/routes';

import { createMenu, fetchMenus, updateMenu } from '#/api/iam/menu';
import { fetchPermissions, type IamPermission } from '#/api/iam/permission';
import type { IamMenu } from '#/api/iam/menu';

import { getMenuTypeOptions } from '../data';

const emit = defineEmits<{ success: [] }>();
const formData = ref<IamMenu>();

const permissionOptions = ref<{ label: string; value: string }[]>([]);

const schema: VbenFormSchema[] = [
  {
    component: 'RadioGroup',
    fieldName: 'menu_type',
    label: '类型',
    defaultValue: 'directory',
    componentProps: {
      buttonStyle: 'solid',
      options: getMenuTypeOptions(),
      optionType: 'button',
    },
    formItemClass: 'col-span-2 md:col-span-2',
  },
  {
    component: 'Input',
    fieldName: 'name',
    label: '名称',
    rules: z.string().min(1, '请输入名称').max(50, '名称过长'),
  },
  {
    component: 'Input',
    fieldName: 'code',
    label: '编码',
    rules: z.string().min(1, '请输入编码').max(50, '编码过长'),
  },
  {
    component: 'ApiTreeSelect',
    fieldName: 'parent_id',
    label: '上级菜单',
    componentProps: {
      api: fetchMenus,
      valueField: 'menu_id',
      labelField: 'name',
      childrenField: 'children',
      treeDefaultExpandAll: true,
      allowClear: true,
      style: { width: '100%' },
    },
  },
  {
    component: 'Input',
    fieldName: 'path',
    label: '路径',
    dependencies: {
      show: (values) => values.menu_type !== 'button',
      triggerFields: ['menu_type'],
    },
    rules: z.string().min(1, '请输入路径').max(200, '路径过长'),
  },
  {
    component: 'Input',
    fieldName: 'external_url',
    label: '外链地址',
    dependencies: {
      show: (values) => values.menu_type === 'link',
      triggerFields: ['menu_type'],
    },
    rules: z.string().url('请输入合法的URL').optional(),
  },
  {
    component: 'AutoComplete',
    fieldName: 'component',
    label: '组件',
    dependencies: {
      show: (values) => values.menu_type === 'menu' || values.menu_type === 'directory',
      triggerFields: ['menu_type'],
    },
    componentProps: {
      allowClear: true,
      class: 'w-full',
      options: componentKeys.map((v) => ({ value: v })),
    },
  },
  {
    component: 'Input',
    fieldName: 'icon',
    label: '图标',
    componentProps: { allowClear: true },
  },
  {
    component: 'Select',
    fieldName: 'permission_code',
    label: '权限码',
    componentProps: {
      allowClear: true,
      showSearch: true,
      optionFilterProp: 'label',
      options: permissionOptions,
      placeholder: '从已有权限点选择',
    },
  },
  {
    component: 'InputNumber',
    fieldName: 'sort',
    label: '排序',
    componentProps: { min: 0, max: 99999 },
  },
  {
    component: 'Switch',
    fieldName: 'is_hidden',
    label: '菜单隐藏',
    defaultValue: false,
  },
  {
    component: 'RadioGroup',
    fieldName: 'status',
    label: '状态',
    defaultValue: 'active',
    componentProps: {
      buttonStyle: 'solid',
      options: [
        { label: '已启用', value: 'active' },
        { label: '已禁用', value: 'disabled' },
      ],
      optionType: 'button',
    },
  },
];

const [Form, formApi] = useVbenForm({
  schema,
  showDefaultActions: false,
  wrapperClass: 'grid-cols-2 gap-x-4',
  commonConfig: {
    colon: true,
    formItemClass: 'col-span-2 md:col-span-1',
  },
});

const [Drawer, drawerApi] = useVbenDrawer({
  onConfirm: onSubmit,
  onOpenChange(isOpen) {
    if (isOpen) {
      const data = drawerApi.getData<IamMenu>();
      loadPermissionOptions();
      if (data) {
        formData.value = data;
        formApi.setValues(data);
      } else {
        formData.value = undefined;
        formApi.resetForm();
      }
    }
  },
});

const drawerTitle = computed(() =>
  formData.value?.menu_id ? '编辑菜单' : '新增菜单',
);

onMounted(() => {
  loadPermissionOptions();
});

async function loadPermissionOptions() {
  try {
    const list = await fetchPermissions({ limit: 500, offset: 0 });
    permissionOptions.value = list.map((item: IamPermission) => ({
      label: `${item.code}（${item.name}）`,
      value: item.code,
    }));
  } catch (error) {
    console.error('[IAM Menu] fetchPermissions failed', error);
  }
}

async function onSubmit() {
  const { valid } = await formApi.validate();
  if (!valid) return;
  drawerApi.lock();
  const values = await formApi.getValues<IamMenu>();
  const payload = { ...values } as any;

  // external_url only for link, remove otherwise
  if (payload.menu_type !== 'link') {
    delete payload.external_url;
  }
  // 目录/按钮不需要组件
  if (payload.menu_type === 'directory' || payload.menu_type === 'button') {
    delete payload.component;
  }

  try {
    if (formData.value?.menu_id) {
      await updateMenu(formData.value.menu_id, payload);
    } else {
      await createMenu(payload as any);
    }
    drawerApi.close();
    emit('success');
  } finally {
    drawerApi.unlock();
  }
}
</script>

<template>
  <Drawer class="w-full max-w-[800px]" :title="drawerTitle">
    <Form class="mx-4" layout="horizontal" />
  </Drawer>
</template>

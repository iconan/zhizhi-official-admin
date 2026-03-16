<script lang="tsx" setup>
import { Page } from '@vben/common-ui';
import { Button, Modal, message } from 'ant-design-vue';
import { nextTick, onMounted } from 'vue';

import { useVbenForm, z } from '#/adapter/form';
import { useVbenVxeGrid } from '#/adapter/vxe-table';
import type { OnActionClickFn, VxeTableGridOptions } from '#/adapter/vxe-table';
import { createRule, deleteRule, fetchRules, updateRule } from '#/api/etl/rules';

interface RuleItem {
  rule_id: string;
  name: string;
  description?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

const [RuleForm, ruleFormApi] = useVbenForm({
  showDefaultActions: false,
  schema: [
    {
      component: 'Input',
      fieldName: 'name',
      label: '规则名称',
      rules: z.string({ required_error: '请输入规则名称' }).min(1, '请输入规则名称').max(200, '过长'),
    },
    {
      component: 'Input',
      fieldName: 'description',
      label: '描述',
      componentProps: { type: 'textarea', rows: 3 },
      rules: z.string().max(500, '过长').optional(),
    },
  ],
});

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: {
    columns: [
      { field: 'name', title: '规则名称', minWidth: 200 },
      { field: 'description', title: '描述', minWidth: 220 },
      { field: 'created_at', title: '创建时间', minWidth: 180 },
      {
        title: '操作',
        field: 'operation',
        width: 200,
        fixed: 'right',
        cellRender: {
          name: 'CellOperation',
          options: ['edit', 'delete'],
        },
      },
    ],
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
            const { items, total } = await fetchRules({
              limit,
              offset,
              keyword: formValues?.keyword || undefined,
            });
            return { items, total } as any;
          } catch (error) {
            console.error('[ETK] fetch rules failed', error);
            return { items: [], total: 0 } as any;
          }
        },
      },
    },
    rowConfig: { keyField: 'rule_id' },
    toolbarConfig: { custom: true, export: false, refresh: true, zoom: true },
  } as VxeTableGridOptions,
  formOptions: {
    submitOnChange: true,
    schema: [
      {
        component: 'Input',
        fieldName: 'keyword',
        label: '关键词',
        componentProps: { allowClear: true, placeholder: '规则名称' },
      },
    ],
  },
});

function onCreate() {
  ruleFormApi.resetForm();
  Modal.confirm({
    title: '新增规则',
    icon: null,
    content: () => <RuleForm layout="vertical" class="pt-2" />, // jsx
    okText: '保存',
    onOk: async () => {
      const { valid } = await ruleFormApi.validate();
      if (!valid) return Promise.reject();
      const values = await ruleFormApi.getValues<RuleItem>();
      await createRule({ name: values.name, description: values.description });
      message.success('创建成功');
      await gridApi.query();
    },
  });
}

const onActionClick: OnActionClickFn<RuleItem> = ({ code, row }) => {
  switch (code) {
    case 'edit':
      ruleFormApi.resetForm();
      ruleFormApi.setValues(row);
      Modal.confirm({
        title: '编辑规则',
        icon: null,
        content: () => <RuleForm layout="vertical" class="pt-2" />, // jsx
        okText: '保存',
        onOk: async () => {
          const { valid } = await ruleFormApi.validate();
          if (!valid) return Promise.reject();
          const values = await ruleFormApi.getValues<RuleItem>();
          await updateRule(row.rule_id, { name: values.name, description: values.description });
          message.success('更新成功');
          await gridApi.query();
        },
      });
      break;
    case 'delete':
      Modal.confirm({
        title: '确认删除该规则？',
        okType: 'danger',
        onOk: async () => {
          await deleteRule(row.rule_id);
          message.success('删除成功');
          await gridApi.query();
        },
      });
      break;
    default:
      break;
  }
};

onMounted(() => {
  nextTick(() => gridApi.query());
});
</script>

<template>
  <Page auto-content-height>
    <Grid table-title="抽取规则" @action-click="onActionClick">
      <template #toolbar-tools>
        <Button type="primary" @click="onCreate">新增规则</Button>
      </template>
    </Grid>
  </Page>
</template>

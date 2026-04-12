<script lang="tsx" setup>
import type { OnActionClickFn, VxeTableGridOptions } from '#/adapter/vxe-table';
import type { RuleInput, RuleItem } from '#/api/etl/rules';

import { nextTick, onMounted, ref } from 'vue';

import { Page, useVbenDrawer } from '@vben/common-ui';

import { Button, message, Modal, Tag } from 'ant-design-vue';

import { useVbenForm, z } from '#/adapter/form';
import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  createRule,
  deleteRule,
  fetchRules,
  updateRule,
} from '#/api/etl/rules';

const [RuleDrawer, ruleDrawerApi] = useVbenDrawer({ destroyOnClose: true });
const currentRule = ref<RuleItem | null>(null);

function parseLineValues(value?: string) {
  return (value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toTextValue(value?: string[]) {
  return value?.join('\n') || '';
}

function normalizeRulePayload(values: Record<string, any>): RuleInput {
  return {
    author_selectors: parseLineValues(values.author_selectors),
    content_selectors: parseLineValues(values.content_selectors),
    date_selectors: parseLineValues(values.date_selectors),
    enabled: values.enabled !== false,
    host_pattern: values.host_pattern,
    name: values.name,
    priority: Number(values.priority || 100),
    rollout_percent: Number(values.rollout_percent || 100),
    rollout_tenant_schemas: parseLineValues(values.rollout_tenant_schemas),
    source_selectors: parseLineValues(values.source_selectors),
    title_selectors: parseLineValues(values.title_selectors),
    version: Number(values.version || 1),
  };
}

const [RuleForm, ruleFormApi] = useVbenForm({
  showDefaultActions: false,
  schema: [
    {
      component: 'Input',
      fieldName: 'name',
      label: '规则名称',
      rules: z
        .string({ required_error: '请输入规则名称' })
        .min(1, '请输入规则名称')
        .max(200, '过长'),
    },
    {
      component: 'Input',
      fieldName: 'host_pattern',
      label: 'Host 匹配规则',
      rules: z
        .string({ required_error: '请输入 Host 匹配规则' })
        .min(1, '请输入 Host 匹配规则')
        .max(500, '过长'),
    },
    {
      component: 'Textarea',
      fieldName: 'title_selectors',
      label: '标题选择器',
      componentProps: { rows: 3 },
      rules: z.string().optional(),
    },
    {
      component: 'Textarea',
      fieldName: 'content_selectors',
      label: '正文选择器',
      componentProps: { rows: 3 },
      rules: z.string().optional(),
    },
    {
      component: 'Textarea',
      fieldName: 'date_selectors',
      label: '日期选择器',
      componentProps: { rows: 3 },
      rules: z.string().optional(),
    },
    {
      component: 'Textarea',
      fieldName: 'source_selectors',
      label: '来源选择器',
      componentProps: { rows: 3 },
      rules: z.string().optional(),
    },
    {
      component: 'Textarea',
      fieldName: 'author_selectors',
      label: '作者选择器',
      componentProps: { rows: 3 },
      rules: z.string().optional(),
    },
    {
      component: 'Input',
      fieldName: 'priority',
      label: '优先级',
      componentProps: { type: 'number' },
      rules: z.coerce.number().min(0, '不能小于 0').max(9999, '过大'),
    },
    {
      component: 'Select',
      fieldName: 'enabled',
      label: '启用状态',
      defaultValue: true,
      componentProps: {
        options: [
          { label: '启用', value: true },
          { label: '停用', value: false },
        ],
      },
      rules: z.boolean(),
    },
    {
      component: 'Input',
      fieldName: 'version',
      label: '版本号',
      componentProps: { type: 'number' },
      rules: z.coerce.number().min(1, '最小为 1').max(999, '过大'),
    },
    {
      component: 'Textarea',
      fieldName: 'rollout_tenant_schemas',
      label: '灰度租户',
      componentProps: { rows: 3 },
      rules: z.string().optional(),
    },
    {
      component: 'Input',
      fieldName: 'rollout_percent',
      label: '灰度百分比',
      componentProps: { type: 'number' },
      rules: z.coerce.number().min(1, '最小为 1').max(100, '最大为 100'),
    },
    {
      component: 'Input',
      fieldName: 'name_preview',
      label: '填写说明',
      componentProps: {
        disabled: true,
        placeholder: '选择器字段支持每行一个值',
      },
      dependencies: {
        show: () => false,
        triggerFields: ['name'],
      },
    },
  ],
});

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: {
    columns: [
      { field: 'name', title: '规则名称', minWidth: 200 },
      { field: 'host_pattern', title: 'Host 匹配规则', minWidth: 220 },
      { field: 'priority', title: '优先级', width: 100 },
      { field: 'version', title: '版本', width: 90 },
      { field: 'rollout_percent', title: '灰度%', width: 100 },
      {
        field: 'enabled',
        title: '状态',
        width: 100,
        slots: { default: 'enabled' },
      },
      {
        title: '操作',
        field: 'operation',
        width: 200,
        fixed: 'right',
        cellRender: {
          attrs: {
            onClick: onActionClick,
          },
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
        query: async ({ page }: any) => {
          try {
            const limit = page?.pageSize || 20;
            const offset = ((page?.currentPage || 1) - 1) * limit;
            const { items, total } = await fetchRules({ limit, offset });
            return { items, total } as any;
          } catch (error) {
            // 错误提示由全局拦截器统一处理
            console.error('[ETK] fetch rules failed', error);
            return { items: [], total: 0 } as any;
          }
        },
      },
    },
    rowConfig: { keyField: 'id' },
    toolbarConfig: { custom: true, export: false, refresh: true, zoom: true },
  } as VxeTableGridOptions,
});

function onCreate() {
  openForm();
}

function openForm(row?: RuleItem) {
  currentRule.value = row ?? null;
  ruleDrawerApi.open();
  nextTick(() => {
    ruleFormApi.resetForm();
    if (!row) {
      // 新增模式，设置默认值
      ruleFormApi.setValues({
        enabled: true,
        priority: 100,
        rollout_percent: 100,
        version: 1,
      });
    } else {
      // 编辑模式，填充数据
      ruleFormApi.setValues({
        author_selectors: toTextValue(row.author_selectors),
        content_selectors: toTextValue(row.content_selectors),
        date_selectors: toTextValue(row.date_selectors),
        enabled: row.enabled ?? true,
        host_pattern: row.host_pattern,
        name: row.name,
        priority: row.priority ?? 100,
        rollout_percent: row.rollout_percent ?? 100,
        rollout_tenant_schemas: toTextValue(row.rollout_tenant_schemas),
        source_selectors: toTextValue(row.source_selectors),
        title_selectors: toTextValue(row.title_selectors),
        version: row.version ?? 1,
      });
    }
  });
}

async function onSubmitRule() {
  const { valid } = await ruleFormApi.validate();
  if (!valid) return;
  ruleDrawerApi.lock();
  const values = await ruleFormApi.getValues<Record<string, any>>();
  try {
    if (currentRule.value?.id) {
      await updateRule(currentRule.value.id, normalizeRulePayload(values));
      message.success('更新成功');
    } else {
      await createRule(normalizeRulePayload(values));
      message.success('创建成功');
    }
    ruleDrawerApi.close();
    await gridApi.query();
  } finally {
    ruleDrawerApi.unlock();
  }
}

function onActionClick({ code, row }: Parameters<OnActionClickFn<RuleItem>>[0]) {
  switch (code) {
    case 'delete': {
      Modal.confirm({
        title: '确认删除该规则？',
        okType: 'danger',
        onOk: async () => {
          await deleteRule(row.id);
          message.success('删除成功');
          await gridApi.query();
        },
      });
      break;
    }
    case 'edit': {
      openForm(row);
      break;
    }
    default: {
      break;
    }
  }
}

onMounted(() => {
  nextTick(() => gridApi.query());
});
</script>

<template>
  <Page auto-content-height>
    <RuleDrawer :title="currentRule ? '编辑规则' : '新增规则'">
      <RuleForm class="mx-4" layout="vertical" />
      <template #footer>
        <div class="flex justify-end gap-2 pb-2 pr-4">
          <Button @click="ruleDrawerApi.close()">取消</Button>
          <Button type="primary" @click="onSubmitRule">保存</Button>
        </div>
      </template>
    </RuleDrawer>

    <Grid table-title="抽取规则">
      <template #toolbar-tools>
        <Button type="primary" @click="onCreate">新增规则</Button>
      </template>
      <template #enabled="{ row }">
        <Tag :color="row.enabled ? 'success' : 'default'">
          {{ row.enabled ? '启用' : '停用' }}
        </Tag>
      </template>
    </Grid>
  </Page>
</template>

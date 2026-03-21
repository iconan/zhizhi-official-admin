<script lang="ts" setup>
import type {
  OnActionClickParams,
  VxeTableGridOptions,
} from '#/adapter/vxe-table';
import type { IamMenu } from '#/api/iam/menu';

import { nextTick, onMounted } from 'vue';

import { Page, useVbenDrawer } from '@vben/common-ui';
import { Plus } from '@vben/icons';

import { Button, message, Tag } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { deleteMenu, fetchMenuTree } from '#/api/iam/menu';

import { renderStatus, useColumns } from './data';
import Form from './modules/form.vue';

const [FormDrawer, formDrawerApi] = useVbenDrawer({
  connectedComponent: Form,
  destroyOnClose: true,
});

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: {
    columns: useColumns(onActionClick),
    height: 'auto',
    keepSource: true,
    pagerConfig: { enabled: false },
    proxyConfig: {
      enabled: true,
      autoLoad: false,
      ajax: {
        query: async () => {
          try {
            const items = await fetchMenuTree(true);
            return items as any;
          } catch (error) {
            console.error('[IAM Menu] fetchMenus failed', error);
            message.error('加载菜单列表失败，请稍后重试');
            return [] as any;
          }
        },
      },
    },
    rowConfig: {
      keyField: 'menu_id',
    },
    toolbarConfig: {
      custom: true,
      export: false,
      refresh: true,
      zoom: true,
    },
    treeConfig: {
      parentField: 'parent_id',
      rowField: 'menu_id',
      childrenField: 'children',
      expandAll: true,
      // 后端已返回 children 树形结构，关闭 transform 直接渲染
      transform: false,
    },
  } as VxeTableGridOptions,
});

onMounted(async () => {
  nextTick(() => {
    gridApi.query();
  });
});

function onActionClick({ code, row }: OnActionClickParams<IamMenu>) {
  switch (code) {
    case 'append': {
      onAppend(row);
      break;
    }
    case 'delete': {
      onDelete(row);
      break;
    }
    case 'edit': {
      onEdit(row);
      break;
    }
    default: {
      break;
    }
  }
}

function onRefresh() {
  gridApi.query();
}

function onEdit(row: IamMenu) {
  formDrawerApi.setData(row).open();
}

function onCreate() {
  formDrawerApi.setData({}).open();
}

function onAppend(row: IamMenu) {
  formDrawerApi.setData({ parent_id: row.menu_id }).open();
}

function onDelete(row: IamMenu) {
  const hideLoading = message.loading({
    content: `正在删除：${row.name}`,
    duration: 0,
    key: 'iam_menu_delete',
  });
  deleteMenu(row.menu_id)
    .then(() => {
      message.success({
        content: `已删除：${row.name}`,
        key: 'iam_menu_delete',
      });
      onRefresh();
    })
    .catch((error) => {
      console.error('[IAM Menu] delete failed', error);
      message.error({
        content: `删除失败：${row.name}`,
        key: 'iam_menu_delete',
      });
    })
    .finally(() => hideLoading());
}
</script>

<template>
  <Page auto-content-height>
    <FormDrawer @success="onRefresh" />
    <Grid table-title="菜单列表">
      <template #toolbar-tools>
        <Button type="primary" @click="onCreate">
          <Plus class="size-5" /> 新增菜单
        </Button>
      </template>
      <template #status="{ row }">
        <Tag :color="renderStatus(row.status).color">
          {{ renderStatus(row.status).text }}
        </Tag>
      </template>
    </Grid>
  </Page>
</template>

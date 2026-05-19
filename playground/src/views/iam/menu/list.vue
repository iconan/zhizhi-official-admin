<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { IamMenu } from '#/api/iam/menu';

import { nextTick, onMounted } from 'vue';

import { Page, useVbenDrawer } from '@vben/common-ui';
import { Plus } from '@vben/icons';

import { Button, message, Modal, Tag } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { deleteMenu, fetchMenuTree, updateMenuStatus } from '#/api/iam/menu';

import { renderStatus, useColumns } from './data';
import Form from './modules/form.vue';

const [FormDrawer, formDrawerApi] = useVbenDrawer({
  connectedComponent: Form,
  destroyOnClose: true,
});

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: {
    columns: useColumns(),
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
            // 错误提示由全局拦截器统一处理
            console.error('[IAM Menu] fetchMenus failed', error);
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
      indent: 16,
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

function onDisable(row: IamMenu) {
  Modal.confirm({
    title: '确认禁用',
    content: `禁用后该菜单将不再显示，确认禁用"${row.name}"吗？`,
    okText: '确认',
    cancelText: '取消',
    okButtonProps: { danger: true },
    onOk: async () => {
      const hideLoading = message.loading({
        content: `正在禁用：${row.name}`,
        duration: 0,
        key: 'iam_menu_disable',
      });
      try {
        await deleteMenu(row.menu_id);
        message.success({
          content: `已禁用：${row.name}`,
          key: 'iam_menu_disable',
        });
        onRefresh();
      } catch (error) {
        console.error('[IAM Menu] disable failed', error);
      } finally {
        hideLoading();
      }
    },
  });
}

function onEnable(row: IamMenu) {
  Modal.confirm({
    title: '确认启用',
    content: `确认启用"${row.name}"吗？`,
    okText: '确认',
    cancelText: '取消',
    onOk: async () => {
      const hideLoading = message.loading({
        content: `正在启用：${row.name}`,
        duration: 0,
        key: 'iam_menu_enable',
      });
      try {
        await updateMenuStatus(row.menu_id, 'active');
        message.success({
          content: `已启用：${row.name}`,
          key: 'iam_menu_enable',
        });
        onRefresh();
      } catch (error) {
        console.error('[IAM Menu] enable failed', error);
      } finally {
        hideLoading();
      }
    },
  });
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
      <template #operation="{ row }">
        <Button type="link" size="small" @click="onAppend(row)">
          新增下级
        </Button>
        <Button type="link" size="small" @click="onEdit(row)">
          编辑
        </Button>
        <Button
          v-if="row.status === 'active'"
          type="link"
          size="small"
          danger
          @click="onDisable(row)"
        >
          禁用
        </Button>
        <Button
          v-else
          type="link"
          size="small"
          @click="onEnable(row)"
        >
          启用
        </Button>
      </template>
    </Grid>
  </Page>
</template>

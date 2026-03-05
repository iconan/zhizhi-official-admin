<script setup lang="tsx">
import { onMounted, reactive, ref, watch } from 'vue';
import {
  Button,
  Card,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  TreeSelect,
  Typography,
} from 'ant-design-vue';
import type { FormInstance } from 'ant-design-vue';
import {
  createMenu,
  deleteMenu,
  fetchMenuTree,
  fetchMenus,
  updateMenu,
  updateMenuStatus,
} from '#/api';
import type { MenuApi } from '#/api/core/menu';

const loading = ref(false);
const tableData = ref<MenuApi.MenuItem[]>([]);
const treeOptions = ref<MenuApi.MenuItem[]>([]);
const includeDisabled = ref(false);

const drawerVisible = ref(false);
const submitting = ref(false);
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();

const formModel = reactive({
  parent_id: null as string | null,
  name: '',
  code: '',
  menu_type: 'menu' as MenuApi.MenuItem['menu_type'],
  path: '',
  component: '',
  icon: '',
  sort: 1,
  is_hidden: false,
  status: 'active' as MenuApi.MenuItem['status'],
  permission_code: '',
  meta: ''
});

const rules = {
  name: [{ required: true, message: '请输入名称' }],
  code: [{ required: true, message: '请输入编码' }],
  menu_type: [{ required: true, message: '请选择类型' }],
  path: [{ required: true, message: '请输入路径' }],
  sort: [{ required: true, type: 'number', message: '请输入排序' }],
  status: [{ required: true, message: '请选择状态' }]
};

const typeOptions: { label: string; value: MenuApi.MenuItem['menu_type'] }[] = [
  { label: '目录', value: 'directory' },
  { label: '菜单', value: 'menu' },
  { label: '按钮', value: 'button' },
  { label: '外链', value: 'link' }
];

const typeLabelMap = new Map(typeOptions.map((opt) => [opt.value, opt.label] as const));

async function loadList() {
  loading.value = true;
  try {
    const res = await fetchMenus({ include_disabled: includeDisabled.value });
    const items = res?.items || [];
    tableData.value = items;
  } finally {
    loading.value = false;
  }
}

async function loadTree() {
  const tree = await fetchMenuTree({ include_disabled: includeDisabled.value });
  treeOptions.value = tree;
}

function resetForm(initial?: Partial<MenuApi.MenuItem>) {
  editingId.value = initial?.menu_id || null;
  formModel.parent_id = initial?.parent_id ?? null;
  formModel.name = initial?.name ?? '';
  formModel.code = initial?.code ?? '';
  formModel.menu_type = initial?.menu_type ?? 'menu';
  formModel.path = initial?.path ?? '';
  formModel.component = initial?.component ?? '';
  formModel.icon = initial?.icon ?? '';
  formModel.sort = initial?.sort ?? 1;
  formModel.is_hidden = initial?.is_hidden ?? false;
  formModel.status = initial?.status ?? 'active';
  formModel.permission_code = initial?.permission_code ?? '';
  formModel.meta = initial?.meta ? JSON.stringify(initial.meta) : '';
}

function openAdd() {
  resetForm();
  drawerVisible.value = true;
}

function openEdit(row: MenuApi.MenuItem) {
  resetForm(row);
  drawerVisible.value = true;
}

async function handleDelete(row: MenuApi.MenuItem) {
  Modal.confirm({
    title: '确定删除该菜单吗？',
    onOk: async () => {
      await deleteMenu(row.menu_id);
      message.success('删除成功');
      await loadList();
      await loadTree();
    }
  });
}

async function handleStatusChange(row: MenuApi.MenuItem, checked: boolean) {
  const target = checked ? 'active' : 'disabled';
  await updateMenuStatus(row.menu_id, target);
  message.success('状态已更新');
  await loadList();
}

async function submit() {
  try {
    await formRef.value?.validate();
    submitting.value = true;

    let parsedMeta: Record<string, any> | undefined;
    if (formModel.meta) {
      try {
        parsedMeta = JSON.parse(formModel.meta);
      } catch (e) {
        message.error('Meta JSON 无效');
        return;
      }
    }

    const payload: Partial<MenuApi.MenuItem> = {
      parent_id: formModel.parent_id,
      name: formModel.name,
      code: formModel.code,
      menu_type: formModel.menu_type,
      path: formModel.path,
      component: formModel.component,
      icon: formModel.icon,
      sort: formModel.sort,
      is_hidden: formModel.is_hidden,
      status: formModel.status,
      permission_code: formModel.permission_code,
      meta: parsedMeta
    };

    if (editingId.value) {
      await updateMenu(editingId.value, payload);
      message.success('更新成功');
    } else {
      await createMenu(payload);
      message.success('创建成功');
    }

    drawerVisible.value = false;
    await Promise.all([loadList(), loadTree()]);
  } finally {
    submitting.value = false;
  }
}

watch(includeDisabled, async () => {
  await loadList();
});

onMounted(async () => {
  await Promise.all([loadList(), loadTree()]);
});

const columns = [
  { title: '名称', dataIndex: 'name' },
  { title: '编码', dataIndex: 'code' },
  {
    title: '类型',
    dataIndex: 'menu_type',
    width: 120,
    customRender: ({ record }: { record: MenuApi.MenuItem }) =>
      typeLabelMap.get(record.menu_type) ?? record.menu_type
  },
  { title: '路径', dataIndex: 'path' },
  { title: '组件', dataIndex: 'component' },
  { title: '权限码', dataIndex: 'permission_code' },
  { title: '排序', dataIndex: 'sort', width: 80 },
  {
    title: '状态',
    dataIndex: 'status',
    width: 120,
    customRender: ({ record }: { record: MenuApi.MenuItem }) => (
      <Switch
        checked={record.status === 'active'}
        checkedChildren="已启用"
        unCheckedChildren="已禁用"
        onChange={(val: boolean) => handleStatusChange(record, val)}
      />
    )
  },
  {
    title: '操作',
    dataIndex: 'actions',
    width: 180,
    customRender: ({ record }: { record: MenuApi.MenuItem }) => (
      <Space>
        <Button type="link" onClick={() => openEdit(record)}>
          编辑
        </Button>
        <Button danger type="link" onClick={() => handleDelete(record)}>
          删除
        </Button>
      </Space>
    )
  }
];
</script>

<template>
  <div class="menu-page">
    <Card class="panel" :bordered="false">
      <div class="panel__header">
        <div>
          <Typography.Title level="4" class="panel__title">菜单管理</Typography.Title>
          <Typography.Text type="secondary">维护后台菜单结构、路由组件和权限码</Typography.Text>
        </div>
        <Space>
          <Switch v-model:checked="includeDisabled" checked-children="含禁用" un-checked-children="仅启用" />
          <Button type="primary" @click="openAdd">新增菜单</Button>
        </Space>
      </div>
    </Card>

    <Card class="panel" :bordered="false">
      <Table
        :columns="columns"
        :data-source="tableData"
        :loading="loading"
        :row-key="record => record.menu_id"
        bordered
        size="middle"
        :pagination="false"
      />
    </Card>

    <Drawer v-model:open="drawerVisible" width="520" title="菜单维护" destroyOnClose>
      <Form ref="formRef" :model="formModel" :rules="rules" layout="vertical">
        <Form.Item label="父级菜单" name="parent_id">
          <TreeSelect
            v-model:value="formModel.parent_id"
            :tree-data="treeOptions"
            allow-clear
            tree-default-expand-all
            :field-names="{ label: 'name', value: 'menu_id', children: 'children' }"
            placeholder="请选择父级"
          />
        </Form.Item>
        <Form.Item label="名称" name="name">
          <Input v-model:value="formModel.name" placeholder="请输入名称" />
        </Form.Item>
        <Form.Item label="编码" name="code">
          <Input v-model:value="formModel.code" placeholder="请输入编码" />
        </Form.Item>
        <Form.Item label="类型" name="menu_type">
          <Select
            v-model:value="formModel.menu_type"
            :options="typeOptions"
            placeholder="请选择类型"
          />
        </Form.Item>
        <Form.Item label="路径" name="path">
          <Input v-model:value="formModel.path" placeholder="/path" />
        </Form.Item>
        <Form.Item label="组件" name="component">
          <Input v-model:value="formModel.component" placeholder="system/menu/index" />
        </Form.Item>
        <Form.Item label="图标" name="icon">
          <Input v-model:value="formModel.icon" placeholder="lucide:home" />
        </Form.Item>
        <Form.Item label="排序" name="sort">
          <InputNumber v-model:value="formModel.sort" :min="1" class="w-full" />
        </Form.Item>
        <Form.Item label="隐藏" name="is_hidden">
          <Switch v-model:checked="formModel.is_hidden" checked-children="是" un-checked-children="否" />
        </Form.Item>
        <Form.Item label="状态" name="status">
          <Switch
            v-model:checked="formModel.status"
            :checked-value="'active'"
            :un-checked-value="'disabled'"
            checked-children="已启用"
            un-checked-children="已禁用"
          />
        </Form.Item>
        <Form.Item label="权限码" name="permission_code">
          <Input v-model:value="formModel.permission_code" placeholder="admin_menu:read" />
        </Form.Item>
        <Form.Item label="Meta(JSON)" name="meta">
          <Input.TextArea v-model:value="formModel.meta" rows="3" placeholder='{"keepAlive":true}' />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" :loading="submitting" @click="submit">确认</Button>
            <Button @click="drawerVisible = false">取消</Button>
          </Space>
        </Form.Item>
      </Form>
    </Drawer>
  </div>
</template>

<style scoped>
.menu-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel {
  border-radius: 12px;
  box-shadow: 0 6px 24px rgba(15, 23, 42, 0.04);
}

.panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
}

.panel__title {
  margin: 0;
}

::v-deep(.ant-table) {
  border-radius: 12px;
  overflow: hidden;
}

::v-deep(.ant-drawer-body) {
  background: #f7f9fc;
}
</style>

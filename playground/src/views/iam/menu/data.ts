import type { VxeTableGridOptions, OnActionClickFn } from '#/adapter/vxe-table';

import type { MenuStatus, IamMenu } from '#/api/iam/menu';

export function getMenuTypeOptions() {
  return [
    { label: '目录', value: 'directory', color: 'blue' },
    { label: '菜单', value: 'menu', color: 'green' },
    { label: '按钮', value: 'button', color: 'orange' },
    { label: '外链', value: 'link', color: 'purple' },
  ];
}

function renderStatus(status: MenuStatus) {
  const map: Record<MenuStatus, { text: string; color: string }> = {
    active: { text: '已启用', color: 'green' },
    disabled: { text: '已禁用', color: 'red' },
  };
  return map[status];
}

export function useColumns(
  onActionClick: OnActionClickFn<IamMenu>,
): VxeTableGridOptions<IamMenu>['columns'] {
  return [
    {
      field: 'name',
      title: '名称',
      treeNode: true,
      width: 220,
    },
    {
      field: 'menu_type',
      title: '类型',
      cellRender: { name: 'CellTag', options: getMenuTypeOptions() },
      width: 120,
    },
    {
      field: 'code',
      title: '编码',
      width: 160,
    },
    {
      field: 'permission_code',
      title: '权限码',
      width: 200,
    },
    {
      field: 'path',
      title: '路径',
      minWidth: 200,
    },
    {
      field: 'external_url',
      title: '外链',
      formatter: ({ row }) => row.external_url || (row as any)?.meta?.external_url || '',
      minWidth: 220,
    },
    {
      field: 'component',
      title: '组件',
      minWidth: 160,
    },
    {
      field: 'status',
      title: '状态',
      slots: { default: 'status' },
      width: 110,
    },
    {
      align: 'right',
      cellRender: {
        attrs: { onClick: onActionClick },
        name: 'CellOperation',
        options: [
          { code: 'append', text: '新增下级' },
          'edit',
          'delete',
        ],
      },
      field: 'operation',
      fixed: 'right',
      showOverflow: false,
      title: '操作',
      width: 200,
    },
  ];
}

export { renderStatus };

import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    name: 'Iam',
    path: '/iam',
    meta: {
      title: 'IAM 管理',
      icon: 'mdi:shield-account-outline',
      order: 9996,
    },
    children: [
      {
        path: '/iam/menu',
        name: 'IamMenu',
        meta: {
          title: '菜单管理',
          icon: 'mdi:menu',
          ignoreAccess: true,
        },
        component: () => import('#/views/iam/menu/list.vue'),
      },
      {
        path: '/iam/role',
        name: 'IamRole',
        meta: {
          title: '角色管理',
          icon: 'mdi:account-key-outline',
          ignoreAccess: true,
        },
        component: () => import('#/views/iam/role/list.vue'),
      },
      {
        path: '/iam/org',
        name: 'IamOrg',
        meta: {
          title: '组织管理',
          icon: 'mdi:office-building-outline',
          ignoreAccess: true,
        },
        component: () => import('#/views/iam/org/list.vue'),
      },
      {
        path: '/iam/user',
        name: 'IamUser',
        meta: {
          title: '用户管理',
          icon: 'mdi:account-multiple-outline',
          ignoreAccess: true,
        },
        component: () => import('#/views/iam/user/list.vue'),
      },
    ],
  },
];

export default routes;

import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    name: 'Etl',
    path: '/etl',
    meta: {
      title: '数据采集',
      icon: 'mdi:database-cog-outline',
      order: 9994,
    },
    children: [
      {
        path: '/etl/tasks',
        name: 'EtlTaskList',
        meta: {
          title: '任务管理',
          icon: 'mdi:clipboard-list-outline',
          ignoreAccess: true,
        },
        component: () => import('#/views/etl/tasks/list.vue'),
      },
      {
        path: '/etl/tasks/create',
        name: 'EtlTaskCreate',
        meta: {
          title: '创建任务',
          icon: 'mdi:playlist-plus',
          ignoreAccess: true,
        },
        component: () => import('#/views/etl/tasks/create.vue'),
      },
      {
        path: '/etl/rules',
        name: 'EtlRules',
        meta: {
          title: '抽取规则',
          icon: 'mdi:book-edit-outline',
          ignoreAccess: true,
        },
        component: () => import('#/views/etl/rules/list.vue'),
      },
      {
        path: '/etl/schedules',
        name: 'EtlSchedules',
        meta: {
          title: '定时采集',
          icon: 'mdi:calendar-clock-outline',
          ignoreAccess: true,
        },
        component: () => import('#/views/etl/schedules/list.vue'),
      },
    ],
  },
];

export default routes;

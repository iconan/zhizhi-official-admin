import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    name: 'Om',
    path: '/om',
    meta: {
      title: '运营管理',
      icon: 'mdi:briefcase-outline',
      order: 9995,
    },
    children: [
      {
        path: '/om/regions',
        name: 'OmRegions',
        meta: {
          title: '行政区域管理',
          icon: 'mdi:map-outline',
          ignoreAccess: true,
        },
        component: () => import('#/views/om/regions/list.vue'),
      },
    ],
  },
];

export default routes;

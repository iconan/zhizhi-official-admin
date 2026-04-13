<script lang="ts" setup>
import { computed } from 'vue';
import { useUserStore } from '@vben/stores';
import {
  Avatar,
  Card,
  Descriptions,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'ant-design-vue';
import {
  User,
  Mail,
  Shield,
  Users,
  Building2,
} from 'lucide-vue-next';

const userStore = useUserStore();

// 超级管理员角色编码
const SUPER_ADMIN_CODE = 'super_admin';

const userInfo = computed(() => {
  return {
    name: userStore.userInfo?.name || '未知用户',
    email: userStore.userInfo?.email || '-',
    roles: userStore.userInfo?.roles || [],
    permissions: userStore.userInfo?.permissions?.length || 0,
    org: userStore.userInfo?.org || null,
  };
});

const orgName = computed(() => {
  if (!userInfo.value.org?.id) return '-';
  return userInfo.value.org.name || userInfo.value.org.id;
});

const displayRoles = computed(() => {
  const roles = userInfo.value.roles;
  if (!roles.length) return [];

  // 如果包含超级管理员，则只显示超级管理员
  if (roles.some((role) => role.code === SUPER_ADMIN_CODE)) {
    return [{ code: SUPER_ADMIN_CODE, name: '超级管理员' }];
  }
  // 否则显示所有角色
  return roles.map((role) => ({
    code: role.code,
    name: role.name || role.code,
  }));
});

const welcomeMessage = computed(() => {
  const hour = new Date().getHours();
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
});
</script>

<template>
  <div class="p-6">
    <Card>
      <div class="flex items-center gap-6 mb-6">
        <Avatar :size="80" class="bg-blue-500 flex items-center justify-center">
          <User :size="40" />
        </Avatar>
        <div>
          <Typography.Title :level="3" class="!mb-1">
            {{ welcomeMessage }}，{{ userInfo.name }}
          </Typography.Title>
          <Typography.Text type="secondary">
            欢迎登录系统，您可以在左侧菜单查看有权限的功能模块
          </Typography.Text>
        </div>
      </div>

      <Descriptions :column="2" bordered>
        <Descriptions.Item label="用户名">
          <Space>
            <User :size="16" />
            {{ userInfo.name }}
          </Space>
        </Descriptions.Item>

        <Descriptions.Item label="邮箱">
          <Space>
            <Mail :size="16" />
            {{ userInfo.email }}
          </Space>
        </Descriptions.Item>

        <Descriptions.Item label="所属组织">
          <Space>
            <Building2 :size="16" />
            {{ orgName }}
          </Space>
        </Descriptions.Item>

        <Descriptions.Item label="角色">
          <Space>
            <Users :size="16" />
            <Tooltip v-for="role in displayRoles" :key="role.code">
              <template #title>
                {{ role.code }}
              </template>
              <Tag color="blue">
                {{ role.name }}
              </Tag>
            </Tooltip>
            <span v-if="!displayRoles.length" class="text-gray-400">暂无角色</span>
          </Space>
        </Descriptions.Item>

        <Descriptions.Item label="权限数量">
          <Space>
            <Shield :size="16" />
            <Tag :color="userInfo.permissions > 0 ? 'green' : 'orange'">
              {{ userInfo.permissions }} 个权限
            </Tag>
          </Space>
        </Descriptions.Item>
      </Descriptions>

      <div class="mt-6 p-4 bg-gray-50 rounded">
        <Typography.Text type="secondary">
          <Shield :size="16" class="mr-2 inline" />
          提示：如果您的权限列表为空，请联系管理员为您分配角色和权限
        </Typography.Text>
      </div>
    </Card>
  </div>
</template>

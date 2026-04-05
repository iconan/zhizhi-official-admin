<script lang="ts" setup>
import { computed } from 'vue';
import { useUserStore } from '@vben/stores';
import { Card, Descriptions, Tag, Avatar, Space, Typography } from 'ant-design-vue';
import {
  User,
  Mail,
  Shield,
  Users,
} from 'lucide-vue-next';

const userStore = useUserStore();

const userInfo = computed(() => {
  return {
    name: userStore.userInfo?.name || '未知用户',
    email: userStore.userInfo?.email || '-',
    roles: userStore.userInfo?.roles || [],
    permissions: userStore.userInfo?.permissions?.length || 0,
  };
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

        <Descriptions.Item label="角色">
          <Space>
            <Users :size="16" />
            <Tag v-for="role in userInfo.roles" :key="role" color="blue">
              {{ role }}
            </Tag>
            <span v-if="!userInfo.roles.length" class="text-gray-400">暂无角色</span>
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

<script lang="ts" setup>
import { Page } from '@vben/common-ui';
import { Button, Form, Input, InputNumber, Tabs, message } from 'ant-design-vue';
import { ref } from 'vue';

import { createJob } from '#/api/etl/jobs';

const activeTab = ref<'csv' | 'web'>('csv');

const csvForm = ref({ name: '', description: '', file_url: '', schedule_cron: '' });
const webForm = ref({ name: '', description: '', seed_url: '', schedule_cron: '' });

async function submitCsv() {
  const payload = {
    name: csvForm.value.name,
    description: csvForm.value.description,
    source: 'csv',
    csv_url: csvForm.value.file_url,
    cron: csvForm.value.schedule_cron,
  };
  const hide = message.loading({ content: '创建中...', duration: 0 });
  try {
    await createJob(payload, 'import');
    message.success('创建成功');
  } finally {
    hide();
  }
}

async function submitWeb() {
  const payload = {
    name: webForm.value.name,
    description: webForm.value.description,
    source: 'web',
    web_url: webForm.value.seed_url,
    cron: webForm.value.schedule_cron,
  };
  const hide = message.loading({ content: '创建中...', duration: 0 });
  try {
    await createJob(payload);
    message.success('创建成功');
  } finally {
    hide();
  }
}
</script>

<template>
  <Page auto-content-height>
    <Tabs v-model:activeKey="activeTab">
      <Tabs.TabPane key="csv" tab="CSV 导入">
        <Form layout="vertical">
          <Form.Item label="任务名称" required>
            <Input v-model:value="csvForm.name" placeholder="请输入任务名称" />
          </Form.Item>
          <Form.Item label="描述">
            <Input.TextArea v-model:value="csvForm.description" rows="3" />
          </Form.Item>
          <Form.Item label="CSV 文件地址" required>
            <Input v-model:value="csvForm.file_url" placeholder="请输入可访问的 CSV URL" />
          </Form.Item>
          <Form.Item label="调度 Cron 表达式">
            <Input v-model:value="csvForm.schedule_cron" placeholder="可选，留空为手动触发" />
          </Form.Item>
          <div class="flex justify-end gap-2">
            <Button type="primary" @click="submitCsv">提交</Button>
          </div>
        </Form>
      </Tabs.TabPane>
      <Tabs.TabPane key="web" tab="网页采集">
        <Form layout="vertical">
          <Form.Item label="任务名称" required>
            <Input v-model:value="webForm.name" placeholder="请输入任务名称" />
          </Form.Item>
          <Form.Item label="描述">
            <Input.TextArea v-model:value="webForm.description" rows="3" />
          </Form.Item>
          <Form.Item label="起始 URL" required>
            <Input v-model:value="webForm.seed_url" placeholder="请输入起始 URL" />
          </Form.Item>
          <Form.Item label="调度 Cron 表达式">
            <Input v-model:value="webForm.schedule_cron" placeholder="可选，留空为手动触发" />
          </Form.Item>
          <div class="flex justify-end gap-2">
            <Button type="primary" @click="submitWeb">提交</Button>
          </div>
        </Form>
      </Tabs.TabPane>
    </Tabs>
  </Page>
</template>

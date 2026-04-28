<script lang="ts" setup>
import type { SelectProps } from 'ant-design-vue';

import { computed, onMounted, ref } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';
import {
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Form,
  InputNumber,
  Row,
  Select,
  Tag,
  message,
} from 'ant-design-vue';
import dayjs, { type Dayjs } from 'dayjs';

import { fetchMeta, runDiscovery } from '#/api/seed_discovery';
import { fetchTenants } from '#/api/iam/tenant';

const emit = defineEmits<{ success: [] }>();

const SOURCE_LABELS: Record<string, string> = {
  banyuetan: '半月谈',
  xinhua: '新华社',
  xuexiqiangguo: '学习强国',
  people_daily: '人民日报',
  qiushi: '求是',
};

const submitting = ref(false);
const loadingTenants = ref(false);
const loadingMeta = ref(false);
const tenantOptions = ref<SelectProps['options']>([]);
const allSources = ref<string[]>([]);
const allTopics = ref<string[]>([]);

const initialForm = () => ({
  tenant_schema: undefined as string | undefined,
  sources: [...allSources.value],
  topics: [...allTopics.value],
  date_range: [dayjs('2024-01-01'), dayjs('2026-12-31')] as [Dayjs, Dayjs],
  limit_per_source: 120,
});

const form = ref(initialForm());

const sourceOptions = computed(() =>
  allSources.value.map((key) => ({ label: SOURCE_LABELS[key] ?? key, value: key })),
);
const topicOptions = computed(() =>
  allTopics.value.map((t) => ({ label: t, value: t })),
);

const [Drawer, drawerApi] = useVbenDrawer({
  footer: false,
  onCancel: () => drawerApi.close(),
  onOpenChange(isOpen) {
    if (isOpen) {
      void loadMeta();
      void loadTenantOptions();
    }
  },
});

onMounted(async () => {
  await loadMeta();
});

async function loadMeta() {
  loadingMeta.value = true;
  try {
    const meta = await fetchMeta();
    allSources.value = meta.sources ?? [];
    allTopics.value = meta.topics ?? [];
    form.value = initialForm();
  } catch (error) {
    console.error('[SeedDiscovery] load meta failed', error);
  } finally {
    loadingMeta.value = false;
  }
}

async function loadTenantOptions() {
  loadingTenants.value = true;
  try {
    const { items } = await fetchTenants({
      limit: 200,
      offset: 0,
      status: 'active',
    });
    tenantOptions.value = items
      .filter((t) => t.schema_name)
      .map((t) => ({
        label: `${t.name} · ${t.schema_name}`,
        value: t.schema_name,
      }));
  } catch (error) {
    console.error('[SeedDiscovery] load tenants failed', error);
  } finally {
    loadingTenants.value = false;
  }
}

function selectAllSources() {
  form.value.sources = [...allSources.value];
}
function selectAllTopics() {
  form.value.topics = [...allTopics.value];
}

async function submit() {
  if (!form.value.tenant_schema) {
    message.warning('请选择所属区域');
    return;
  }
  if (!form.value.sources.length) {
    message.warning('请至少选择一个官媒');
    return;
  }
  if (!form.value.topics.length) {
    message.warning('请至少选择一个考点');
    return;
  }
  const [df, dt] = form.value.date_range ?? [];
  const payload = {
    tenant_schema: form.value.tenant_schema,
    sources: form.value.sources,
    topics: form.value.topics,
    date_from: df ? df.format('YYYY-MM-DD') : null,
    date_to: dt ? dt.format('YYYY-MM-DD') : null,
    limit_per_source: form.value.limit_per_source,
  };

  submitting.value = true;
  drawerApi.lock();
  const hide = message.loading({ content: '触发中...', duration: 0 });
  try {
    const resp = await runDiscovery(payload);
    message.success(`发现任务已触发：${resp.job_id}`);
    drawerApi.close();
    emit('success');
  } catch (error) {
    console.error('[SeedDiscovery] run failed', error);
  } finally {
    submitting.value = false;
    drawerApi.unlock();
    hide();
  }
}
</script>

<template>
  <Drawer class="w-full max-w-[840px]" title="触发种子发现任务">
    <div class="px-4 pb-2 pt-2">
      <Card :bordered="false" class="mb-3 rounded-2xl shadow-sm">
        <div class="text-xs leading-5 text-[var(--ant-color-text-description)]">
          按"官媒 + 考点 + 日期区间 + 单家上限"策略发现 URL，结果可导出 Excel
          或一键创建采集任务。任务为长耗时异步执行，结果将出现在"发现任务"列表。
        </div>
      </Card>

      <Card :bordered="false" class="rounded-2xl shadow-sm">
        <Form layout="vertical">
          <Form.Item label="数据所属区域" required>
            <Select
              v-model:value="form.tenant_schema"
              :loading="loadingTenants"
              :options="tenantOptions"
              allow-clear
              placeholder="请选择所属区域"
              show-search
              option-filter-prop="label"
            />
          </Form.Item>

          <Form.Item required>
            <template #label>
              <span>选择官媒</span>
              <Button class="ml-2" size="small" type="link" @click="selectAllSources">
                全选
              </Button>
            </template>
            <Checkbox.Group v-model:value="form.sources">
              <Checkbox v-for="opt in sourceOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </Checkbox>
            </Checkbox.Group>
          </Form.Item>

          <Form.Item required>
            <template #label>
              <span>选择考点</span>
              <Button class="ml-2" size="small" type="link" @click="selectAllTopics">
                全选
              </Button>
            </template>
            <div class="flex flex-wrap gap-2">
              <Tag
                v-for="opt in topicOptions"
                :key="opt.value"
                class="cursor-pointer"
                :color="form.topics.includes(opt.value) ? 'processing' : 'default'"
                @click="
                  form.topics.includes(opt.value)
                    ? (form.topics = form.topics.filter((x) => x !== opt.value))
                    : form.topics.push(opt.value)
                "
              >
                {{ opt.label }}
              </Tag>
            </div>
          </Form.Item>

          <Row :gutter="16">
            <Col :span="14">
              <Form.Item label="文章发布日期区间">
                <DatePicker.RangePicker
                  v-model:value="form.date_range"
                  class="w-full"
                  :allow-clear="false"
                />
              </Form.Item>
            </Col>
            <Col :span="10">
              <Form.Item label="单家上限 (limit_per_source)">
                <InputNumber
                  v-model:value="form.limit_per_source"
                  class="w-full"
                  :min="1"
                  :max="500"
                />
              </Form.Item>
            </Col>
          </Row>

          <div class="flex justify-end gap-3 pt-2">
            <Button @click="drawerApi.close()">取消</Button>
            <Button :loading="submitting" type="primary" @click="submit">
              触发发现任务
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  </Drawer>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  message,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  searchOfficialMediaUrls,
  type UrlRecommenderCandidate,
  type UrlRecommenderSourceError,
} from '#/api/etl/url_recommender';

const emit = defineEmits<{
  /** 用户勾选并确认后回填到外部 URL 文本框，参数为去重后的 URL 列表。 */
  apply: [urls: string[]];
}>();

interface SourceOption {
  value: string;
  label: string;
}

// v1：仅人民日报。后续在后端注册新 adapter 后，把对应的 key/label 加进来即可。
const SOURCE_OPTIONS: SourceOption[] = [
  { value: 'people_daily', label: '人民日报' },
];

const form = ref({
  keywords: '',
  sources: SOURCE_OPTIONS.map((item) => item.value),
  date_range: undefined as [string, string] | undefined,
  limit_per_source: 20,
});

const loading = ref(false);
const candidates = ref<UrlRecommenderCandidate[]>([]);
const errors = ref<UrlRecommenderSourceError[]>([]);
const selectedUrls = ref<string[]>([]);
const searched = ref(false);

const tableColumns = [
  { title: '官媒', dataIndex: 'source_label', width: 110 },
  { title: '标题', dataIndex: 'title' },
  { title: '发布日期', dataIndex: 'published_at', width: 130 },
];

const selectedCount = computed(() => selectedUrls.value.length);

const [Drawer, drawerApi] = useVbenDrawer({
  footer: false,
  onCancel() {
    drawerApi.close();
  },
  onOpenChange(isOpen) {
    if (isOpen) {
      reset();
    }
  },
});

function reset() {
  form.value = {
    keywords: '',
    sources: SOURCE_OPTIONS.map((item) => item.value),
    date_range: undefined,
    limit_per_source: 20,
  };
  candidates.value = [];
  errors.value = [];
  selectedUrls.value = [];
  searched.value = false;
}

async function runSearch() {
  const keywords = form.value.keywords.trim();
  if (!keywords) {
    message.warning('请输入关键词');
    return;
  }
  if (!form.value.sources || form.value.sources.length === 0) {
    message.warning('请至少选择一家官媒');
    return;
  }
  loading.value = true;
  try {
    const payload = {
      keywords,
      sources: form.value.sources,
      date_from: form.value.date_range?.[0],
      date_to: form.value.date_range?.[1],
      limit_per_source: form.value.limit_per_source,
    };
    const res = await searchOfficialMediaUrls(payload);
    candidates.value = res.candidates;
    errors.value = res.errors;
    selectedUrls.value = [];
    searched.value = true;
    if (res.total === 0 && res.errors.length === 0) {
      message.info('未找到符合条件的文章，可尝试更换关键词或扩大日期范围');
    }
  } catch (error) {
    console.error('[UrlRecommender] search failed', error);
  } finally {
    loading.value = false;
  }
}

function handleApply() {
  if (selectedUrls.value.length === 0) {
    message.warning('请至少勾选一条候选 URL');
    return;
  }
  emit('apply', [...selectedUrls.value]);
  message.success(`已添加 ${selectedUrls.value.length} 条 URL 到表单`);
  drawerApi.close();
}

const rowSelection = computed(() => ({
  selectedRowKeys: selectedUrls.value,
  onChange(keys: (number | string)[]) {
    selectedUrls.value = keys.map((k) => String(k));
  },
}));

// 暴露给父组件用 ref 调用打开抽屉
defineExpose({
  open: () => drawerApi.open(),
  close: () => drawerApi.close(),
});
</script>

<template>
  <Drawer class="w-full max-w-[1080px]" title="从官媒搜索 URL">
    <div class="px-4 pb-4 pt-2">
      <Card :bordered="false" class="mb-3 rounded-2xl shadow-sm">
        <Form layout="vertical">
          <div class="grid grid-cols-1 gap-3 lg:grid-cols-4">
            <Form.Item label="关键词" required class="lg:col-span-2">
              <Input
                v-model:value="form.keywords"
                placeholder="多个关键词用空格 / 逗号分隔，例如：乡村振兴 共同富裕"
                allow-clear
                @press-enter="runSearch"
              />
            </Form.Item>
            <Form.Item label="官媒来源" required>
              <Select
                v-model:value="form.sources"
                :options="SOURCE_OPTIONS"
                mode="multiple"
                placeholder="选择官媒"
              />
            </Form.Item>
            <Form.Item label="每家上限">
              <Input
                v-model:value="form.limit_per_source"
                type="number"
                placeholder="默认 20，1~100"
              />
            </Form.Item>
            <Form.Item label="发布日期范围" class="lg:col-span-2">
              <DatePicker.RangePicker
                v-model:value="form.date_range"
                value-format="YYYY-MM-DD"
                class="w-full"
              />
            </Form.Item>
            <Form.Item label=" " class="lg:col-span-2">
              <Space>
                <Button :loading="loading" type="primary" @click="runSearch">
                  搜索
                </Button>
                <Button @click="reset">重置</Button>
              </Space>
            </Form.Item>
          </div>
        </Form>
      </Card>

      <Alert
        v-if="errors.length > 0"
        type="warning"
        show-icon
        class="mb-3"
        :message="`部分官媒搜索失败：${errors.map((e) => `${e.source_label}（${e.message}）`).join('；')}`"
      />

      <Card :bordered="false" class="rounded-2xl shadow-sm">
        <div class="mb-2 flex items-center justify-between">
          <Space size="small">
            <Tag color="processing">候选 {{ candidates.length }} 条</Tag>
            <Tag v-if="selectedCount > 0" color="success">
              已勾选 {{ selectedCount }} 条
            </Tag>
          </Space>
          <Space>
            <Button :disabled="selectedCount === 0" type="primary" @click="handleApply">
              添加到 URL 列表
            </Button>
          </Space>
        </div>
        <Table
          :columns="tableColumns"
          :data-source="candidates"
          :row-key="(row: UrlRecommenderCandidate) => row.url"
          :pagination="{ pageSize: 20 }"
          :row-selection="rowSelection"
          size="small"
          bordered
        >
          <template #emptyText>
            <div class="py-6 text-xs text-[var(--ant-color-text-description)]">
              {{ searched ? '没有命中的候选，可调整关键词 / 日期后再次搜索' : '请先填写关键词后点击"搜索"' }}
            </div>
          </template>
        </Table>
      </Card>
    </div>
  </Drawer>
</template>

<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';

import { Page } from '@vben/common-ui';
import {
  Button,
  Card,
  Col,
  Modal,
  Row,
  Select,
  Statistic,
  Tag,
  message,
} from 'ant-design-vue';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  enqueueToCollect,
  exportExcel,
  fetchJob,
  fetchSeeds,
  type SeedDiscoveryJobItem,
  type SeedDiscoverySeedItem,
} from '#/api/seed_discovery';

const route = useRoute();

const SOURCE_LABEL: Record<string, string> = {
  banyuetan: '半月谈',
  xinhua: '新华社',
  xuexiqiangguo: '学习强国',
  people_daily: '人民日报',
  qiushi: '求是',
};

const STATUS_LABEL: Record<string, string> = {
  discovered: '已发现',
  exported: '已导出',
  enqueued: '已入队',
  skipped_duplicate: '已重复',
};
const STATUS_COLOR: Record<string, string> = {
  discovered: 'processing',
  exported: 'gold',
  enqueued: 'success',
  skipped_duplicate: 'default',
};

const job = ref<SeedDiscoveryJobItem | null>(null);
const filterJobId = ref<string>((route.query.job_id as string) ?? '');
const filterSource = ref<string | undefined>();
const filterTopic = ref<string | undefined>();
const filterStatus = ref<string | undefined>();
const selectedRows = ref<SeedDiscoverySeedItem[]>([]);
const submitting = ref(false);

const sourceOptions = computed(() =>
  Object.entries(SOURCE_LABEL).map(([value, label]) => ({ label, value })),
);
const statusOptions = computed(() =>
  Object.entries(STATUS_LABEL).map(([value, label]) => ({ label, value })),
);

const columns: VxeTableGridOptions['columns'] = [
  { type: 'checkbox', width: 50 },
  {
    field: 'source_name',
    title: '官媒',
    width: 110,
    formatter: ({ cellValue }) => SOURCE_LABEL[cellValue] ?? cellValue ?? '--',
  },
  { field: 'topic', title: '考点', width: 130 },
  {
    field: 'title',
    title: '标题',
    minWidth: 320,
    showOverflow: true,
  },
  { field: 'published_at', title: '发布日期', width: 110 },
  {
    field: 'matched_keywords',
    title: '命中关键词',
    minWidth: 180,
    formatter: ({ cellValue }) => (cellValue as string[])?.join('、') || '--',
  },
  { field: 'status', title: '状态', width: 100, slots: { default: 'status' } },
  {
    field: 'url',
    title: 'URL',
    minWidth: 320,
    slots: { default: 'url' },
  },
  { field: 'enqueued_job_id', title: '采集任务 ID', minWidth: 180 },
];

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: {
    columns,
    height: 'auto',
    keepSource: true,
    pagerConfig: { enabled: true, pageSize: 50, pageSizes: [50, 100, 200, 500] },
    proxyConfig: {
      enabled: true,
      autoLoad: false,
      ajax: {
        query: async ({ page }: any) => {
          if (!filterJobId.value) return { items: [], total: 0 } as any;
          try {
            const limit = page?.pageSize || 50;
            const offset = ((page?.currentPage || 1) - 1) * limit;
            const { items, total } = await fetchSeeds({
              job_id: filterJobId.value,
              source_name: filterSource.value,
              topic: filterTopic.value,
              status: filterStatus.value,
              limit,
              offset,
            });
            return { items, total } as any;
          } catch (error) {
            console.error('[SeedDiscovery] fetch seeds failed', error);
            return { items: [], total: 0 } as any;
          }
        },
      },
    },
    checkboxConfig: {
      reserve: true,
    },
    rowConfig: { keyField: 'id' },
    toolbarConfig: { custom: false, export: false, refresh: true, zoom: true },
  },
  gridEvents: {
    checkboxAll: ({ records }) => {
      selectedRows.value = records as SeedDiscoverySeedItem[];
    },
    checkboxChange: ({ records }) => {
      selectedRows.value = records as SeedDiscoverySeedItem[];
    },
  },
});

async function refresh() {
  await gridApi.query();
}

async function loadJob() {
  if (!filterJobId.value) {
    job.value = null;
    return;
  }
  try {
    job.value = await fetchJob(filterJobId.value);
  } catch (error) {
    console.error('[SeedDiscovery] fetch job failed', error);
    job.value = null;
  }
}

watch([filterSource, filterTopic, filterStatus], () => {
  refresh();
});

async function reload() {
  await loadJob();
  await refresh();
}

function selectedSeedIds(): string[] {
  return selectedRows.value.map((s) => s.id);
}

async function handleExport() {
  if (!filterJobId.value) {
    message.warning('请先选择任务');
    return;
  }
  Modal.confirm({
    title: '确认导出 Excel？',
    content: selectedRows.value.length
      ? `将导出选中 ${selectedRows.value.length} 条候选 URL。`
      : '未勾选任何行，将导出本任务下所有 discovered/exported 状态的候选 URL。',
    onOk: async () => {
      submitting.value = true;
      const hide = message.loading({ content: '导出中...', duration: 0 });
      try {
        const resp = await exportExcel({
          job_id: filterJobId.value,
          seed_ids: selectedRows.value.length ? selectedSeedIds() : undefined,
        });
        message.success(`已导出 ${resp.row_count} 条 → ${resp.file_path}`);
        await refresh();
      } catch (error) {
        console.error('[SeedDiscovery] export failed', error);
      } finally {
        submitting.value = false;
        hide();
      }
    },
  });
}

async function handleEnqueue() {
  if (!filterJobId.value) {
    message.warning('请先选择任务');
    return;
  }
  Modal.confirm({
    title: '确认创建采集任务？',
    content: selectedRows.value.length
      ? `将基于选中 ${selectedRows.value.length} 条候选 URL，按官媒分组创建采集任务。`
      : '未勾选任何行，将基于本任务下所有 discovered/exported 状态的候选 URL，按官媒分组创建采集任务。',
    onOk: async () => {
      submitting.value = true;
      const hide = message.loading({ content: '创建中...', duration: 0 });
      try {
        const resp = await enqueueToCollect({
          job_id: filterJobId.value,
          seed_ids: selectedRows.value.length ? selectedSeedIds() : undefined,
        });
        const accepted = resp.enqueue_items.filter((i) => i.accepted);
        const rejected = resp.enqueue_items.filter((i) => !i.accepted);
        if (rejected.length) {
          message.warning(
            `创建完成：成功 ${accepted.length} 家 / ${resp.enqueued_seed_count} 条；` +
              `失败 ${rejected.length} 家：${rejected
                .map((i) => `${SOURCE_LABEL[i.source_name] ?? i.source_name}(${i.error ?? ''})`)
                .join('；')}`,
          );
        } else {
          message.success(
            `已创建 ${accepted.length} 个采集任务，覆盖 ${resp.enqueued_seed_count} 条 URL`,
          );
        }
        await refresh();
      } catch (error) {
        console.error('[SeedDiscovery] enqueue failed', error);
      } finally {
        submitting.value = false;
        hide();
      }
    },
  });
}

onMounted(async () => {
  await nextTick();
  await reload();
});
</script>

<template>
  <Page auto-content-height>
    <Card v-if="job" :bordered="false" class="mb-3 rounded-2xl shadow-sm" size="small">
      <Row :gutter="12">
        <Col :span="6">
          <Statistic title="任务 ID" :value="job.job_id" />
        </Col>
        <Col :span="4">
          <Statistic title="关联区域" :value="job.tenant_schema" />
        </Col>
        <Col :span="4">
          <Statistic title="状态" :value="STATUS_LABEL[job.status] ?? job.status" />
        </Col>
        <Col :span="4">
          <Statistic title="单家上限" :value="job.limit_per_source" />
        </Col>
        <Col :span="6">
          <Statistic title="已发现 / 入库" :value="job.seed_count" />
        </Col>
      </Row>
    </Card>

    <Card :bordered="false" class="mb-3 rounded-2xl shadow-sm" size="small">
      <Row :gutter="12">
        <Col :span="6">
          <Select
            v-model:value="filterJobId"
            placeholder="任务 ID"
            allow-clear
            class="w-full"
            @change="reload"
          >
            <Select.Option v-if="filterJobId" :value="filterJobId">
              {{ filterJobId }}
            </Select.Option>
          </Select>
        </Col>
        <Col :span="4">
          <Select
            v-model:value="filterSource"
            placeholder="按官媒筛选"
            allow-clear
            :options="sourceOptions"
            class="w-full"
          />
        </Col>
        <Col :span="4">
          <Select
            v-model:value="filterTopic"
            placeholder="按考点筛选"
            allow-clear
            class="w-full"
          />
        </Col>
        <Col :span="4">
          <Select
            v-model:value="filterStatus"
            placeholder="按状态筛选"
            allow-clear
            :options="statusOptions"
            class="w-full"
          />
        </Col>
        <Col :span="6" class="flex justify-end gap-2">
          <Button :disabled="!filterJobId" :loading="submitting" @click="handleExport">
            导出 Excel
          </Button>
          <Button
            :disabled="!filterJobId"
            :loading="submitting"
            type="primary"
            @click="handleEnqueue"
          >
            一键创建采集任务
          </Button>
        </Col>
      </Row>
    </Card>

    <Grid table-title="候选 URL">
      <template #status="{ row }">
        <Tag :color="STATUS_COLOR[row.status ?? ''] ?? 'default'">
          {{ STATUS_LABEL[row.status ?? ''] ?? row.status ?? '--' }}
        </Tag>
      </template>
      <template #url="{ row }">
        <a :href="row.url" target="_blank" rel="noreferrer" class="text-primary hover:underline">
          {{ row.url }}
        </a>
      </template>
    </Grid>
  </Page>
</template>

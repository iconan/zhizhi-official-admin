<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';

import { Page } from '@vben/common-ui';
import {
  Button,
  Card,
  Checkbox,
  Col,
  Modal,
  Row,
  Select,
  Statistic,
  Tag,
  Tooltip,
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

// content_type 黑名单：外访 / 人事 / 榜单 / 简讯 / 转载 / 通知
const CONTENT_TYPE_LABEL: Record<string, string> = {
  diplomatic: '外事',
  personnel: '人事',
  announcement: '通知',
  listicle: '榜单',
  briefing: '简讯',
  republish: '转载',
  commentary: '评论',
  policy_analysis: '政策解读',
  theory: '理论',
  case_study: '案例',
  data_report: '数据',
  other: '其他',
};
const CONTENT_TYPE_COLOR: Record<string, string> = {
  diplomatic: 'red',
  personnel: 'red',
  announcement: 'red',
  listicle: 'red',
  briefing: 'red',
  republish: 'red',
  commentary: 'green',
  policy_analysis: 'green',
  theory: 'green',
  case_study: 'green',
  data_report: 'green',
  other: 'default',
};

const job = ref<SeedDiscoveryJobItem | null>(null);
const filterJobId = ref<string>((route.query.job_id as string) ?? '');
const filterSource = ref<string | undefined>();
const filterTopic = ref<string | undefined>();
const filterStatus = ref<string | undefined>();
const filterExcludeBlacklist = ref<boolean>(true);
const selectedRows = ref<SeedDiscoverySeedItem[]>([]);
const submitting = ref(false);

const sourceOptions = computed(() =>
  Object.entries(SOURCE_LABEL).map(([value, label]) => ({ label, value })),
);
const statusOptions = computed(() =>
  Object.entries(STATUS_LABEL).map(([value, label]) => ({ label, value })),
);

// 聚合 job.stats.sources 各 source 的漏斗指标，得到 job 维度合计。
const funnel = computed(() => {
  const stats = (job.value?.stats as any) ?? {};
  const sources: Record<string, any> = stats.sources ?? {};
  const sum = (key: string) =>
    Object.values(sources).reduce(
      (acc: number, src: any) => acc + (Number(src?.[key]) || 0),
      0,
    );
  const discovered = sum('discovered');
  const llm_reviewed = sum('llm_reviewed');
  const llm_blacklisted = sum('llm_blacklisted');
  const llm_below = sum('llm_below_threshold');
  const kept = sum('kept');
  const inserted = sum('inserted');
  const skipped_duplicate = sum('skipped_duplicate');
  return {
    discovered,
    llm_reviewed,
    llm_blacklisted,
    llm_below,
    kept,
    inserted,
    skipped_duplicate,
    has_data: discovered > 0,
  };
});

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
  {
    field: 'content_type',
    title: '题材',
    width: 90,
    slots: { default: 'content_type' },
  },
  {
    field: 'llm_score',
    title: 'LLM 评分',
    width: 110,
    slots: { default: 'llm_score' },
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
              exclude_blacklist: filterExcludeBlacklist.value,
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
    checkboxAll: ({ records }: { records: SeedDiscoverySeedItem[] }) => {
      selectedRows.value = records;
    },
    checkboxChange: ({ records }: { records: SeedDiscoverySeedItem[] }) => {
      selectedRows.value = records;
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

watch(
  [filterSource, filterTopic, filterStatus, filterExcludeBlacklist],
  () => {
    refresh();
  },
);

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

    <Card
      v-if="funnel.has_data"
      :bordered="false"
      class="mb-3 rounded-2xl shadow-sm"
      size="small"
      title="召回漏斗"
    >
      <Row :gutter="12">
        <Col :span="4">
          <Statistic title="召回总量" :value="funnel.discovered" />
        </Col>
        <Col :span="4">
          <Tooltip title="送入 LLM 标题审核的候选数；若 LLM 未配置或失败该值为 0">
            <Statistic title="LLM 已审核" :value="funnel.llm_reviewed" />
          </Tooltip>
        </Col>
        <Col :span="4">
          <Tooltip title="LLM 判定为外访 / 人事 / 榜单 / 简讯 / 转载 / 通知 等无效题材">
            <Statistic
              title="题材黑名单"
              :value="funnel.llm_blacklisted"
              :value-style="{ color: '#cf1322' }"
            />
          </Tooltip>
        </Col>
        <Col :span="4">
          <Tooltip title="LLM 评分低于阈值（默认 0.7）">
            <Statistic
              title="评分过低"
              :value="funnel.llm_below"
              :value-style="{ color: '#d4b106' }"
            />
          </Tooltip>
        </Col>
        <Col :span="4">
          <Tooltip title="题材合规 + 评分达标，可直接入池">
            <Statistic
              title="合格保留"
              :value="funnel.kept"
              :value-style="{ color: '#3f8600' }"
            />
          </Tooltip>
        </Col>
        <Col :span="4">
          <Tooltip title="实际写入数据库的新增条数（kept 中扣除 url 重复）">
            <Statistic title="新增入库" :value="funnel.inserted" />
          </Tooltip>
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
        <Col :span="3" class="flex items-center">
          <Tooltip title="过滤掉 LLM 判定为外访 / 人事 / 榜单 / 简讯 / 转载 / 通知 的低质题材">
            <Checkbox v-model:checked="filterExcludeBlacklist">
              排除黑名单题材
            </Checkbox>
          </Tooltip>
        </Col>
        <Col :span="3" class="flex justify-end gap-2">
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
      <template #content_type="{ row }">
        <Tag
          v-if="row.content_type"
          :color="CONTENT_TYPE_COLOR[row.content_type] ?? 'default'"
        >
          {{ CONTENT_TYPE_LABEL[row.content_type] ?? row.content_type }}
        </Tag>
        <span v-else class="text-gray-400">--</span>
      </template>
      <template #llm_score="{ row }">
        <Tooltip v-if="row.llm_score != null" :title="row.llm_reason || ''">
          <Tag
            :color="row.llm_score >= 0.7 ? 'green' : row.llm_score >= 0.4 ? 'orange' : 'red'"
          >
            {{ Number(row.llm_score).toFixed(2) }}
          </Tag>
        </Tooltip>
        <span v-else class="text-gray-400">--</span>
      </template>
    </Grid>
  </Page>
</template>

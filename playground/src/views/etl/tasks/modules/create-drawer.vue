<script lang="ts" setup>
import type { SelectProps } from 'ant-design-vue';

import type { ExtractorStrategy } from '#/api/etl/jobs';

import { computed, onMounted, ref } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  Tabs,
  Upload,
  message,
  Row,
  Select,
  Space,
  Tag,
} from 'ant-design-vue';

import { createJob, importExcelJobs } from '#/api/etl/jobs';
import { fetchWebSources } from '#/api/etl/sources';
import { fetchTenants } from '#/api/iam/tenant';

const emit = defineEmits<{ success: [] }>();

const loadingSources = ref(false);
const loadingTenants = ref(false);
const submitting = ref(false);
const importing = ref(false);
const activeTab = ref<'web' | 'excel'>('web');
const sourceOptions = ref<SelectProps['options']>([]);
const tenantOptions = ref<SelectProps['options']>([]);
const defaultChunkSize = 320;
const extractorStrategyOptions: SelectProps['options'] = [
  { label: '混合策略（hybrid）', value: 'hybrid' },
  { label: '托管优先（managed_first）', value: 'managed_first' },
  { label: '仅规则解析（rules_only）', value: 'rules_only' },
];
const defaultSourceName = 'xinhua';

const initialWebForm = () => ({
  source_name: defaultSourceName,
  seed_urls_text: '',
  chunk_size: defaultChunkSize,
  extractor_strategy: 'hybrid' as ExtractorStrategy,
  tenant_schema: undefined as string | undefined,
});

const webForm = ref(initialWebForm());

const [Drawer, drawerApi] = useVbenDrawer({
  footer: false,
  onCancel() {
    drawerApi.close();
  },
  onConfirm: submitWeb,
  onOpenChange(isOpen) {
    if (isOpen) {
      resetForm();
      activeTab.value = 'web';
      void loadSourceOptions();
      void loadTenantOptions();
    }
  },
});

const activeTenantCount = computed(() => tenantOptions.value?.length ?? 0);

onMounted(async () => {
  await loadSourceOptions();
  await loadTenantOptions();
});

async function loadSourceOptions() {
  loadingSources.value = true;
  try {
    const { items } = await fetchWebSources();
    sourceOptions.value = items.map((item) => ({
      label: item.display_name,
      value: item.key,
    }));
    if (!sourceOptions.value?.some((item) => item?.value === webForm.value.source_name)) {
      webForm.value.source_name = (sourceOptions.value?.[0]?.value as string) || defaultSourceName;
    }
  } catch (error) {
    // 错误提示由全局拦截器统一处理
    console.error('[ETL Task] load web sources failed', error);
  } finally {
    loadingSources.value = false;
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
      .filter((item) => item.schema_name)
      .map((item) => ({
        label: `${item.name} · ${item.schema_name}`,
        value: item.schema_name,
      }));
  } catch (error) {
    // 错误提示由全局拦截器统一处理
    console.error('[ETL Task] load active tenants failed', error);
  } finally {
    loadingTenants.value = false;
  }
}

function resetForm() {
  webForm.value = initialWebForm();
}

function validateCommon(form: { tenant_schema?: string }) {
  if (!form.tenant_schema) {
    message.warning('请选择所属区域');
    return false;
  }
  return true;
}

function validateChunkSize(chunkSize: number) {
  if (!Number.isInteger(chunkSize) || chunkSize < 80 || chunkSize > 1200) {
    message.warning('分块大小必须在 80~1200 范围内');
    return false;
  }
  return true;
}

function parseSeedUrls(seedUrlsText: string) {
  return seedUrlsText
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function handleImportExcel(file: File) {
  const lowerName = file.name.toLowerCase();
  if (
    !lowerName.endsWith('.xlsx')
    && !lowerName.endsWith('.xlsm')
    && !lowerName.endsWith('.csv')
  ) {
    message.warning('仅支持 Excel/CSV 文件（.xlsx/.xlsm/.csv）');
    return false;
  }

  importing.value = true;
  const hide = message.loading({ content: '导入中...', duration: 0 });
  try {
    const res = await importExcelJobs(file);
    const payload = (res as any)?.data?.data ?? (res as any)?.data ?? res;
    const summary = payload?.success_count ?? 0;
    const failed = payload?.failed_count ?? 0;
    message.success(`导入完成：成功 ${summary} 条，失败 ${failed} 条`);
  } catch (error) {
    console.error('[ETL Task] import excel failed', error);
  } finally {
    importing.value = false;
    hide();
  }
  return false;
}

async function submitWeb() {
  if (!validateCommon(webForm.value)) return;
  const tenantSchema = webForm.value.tenant_schema;
  if (!tenantSchema) return;
  const seedUrls = parseSeedUrls(webForm.value.seed_urls_text);
  if (seedUrls.length === 0) {
    message.warning('请至少输入一条起始 URL');
    return;
  }
  if (seedUrls.length > 200) {
    message.warning('起始 URL 最多支持 200 条');
    return;
  }
  if (seedUrls.some((item) => !/^https?:\/\//.test(item))) {
    message.warning('起始 URL 仅支持 http(s) 地址');
    return;
  }
  if (!validateChunkSize(webForm.value.chunk_size)) return;
  if (!webForm.value.source_name) {
    message.warning('请选择来源名称');
    return;
  }
  const payload = {
    source_name: webForm.value.source_name,
    seed_urls: seedUrls,
    chunk_size: webForm.value.chunk_size,
    extractor_strategy: webForm.value.extractor_strategy,
    tenant_schema: tenantSchema,
  };
  submitting.value = true;
  drawerApi.lock();
  const hide = message.loading({ content: '创建中...', duration: 0 });
  try {
    await createJob(payload);
    message.success('创建成功');
    resetForm();
    drawerApi.close();
    emit('success');
  } catch (error) {
    // 错误提示由全局拦截器统一处理
    console.error('[ETL Task] create job failed', error);
  } finally {
    submitting.value = false;
    drawerApi.unlock();
    hide();
  }
}
</script>

<template>
  <Drawer class="w-full max-w-[960px]" title="创建网页采集任务">
    <div class="px-4 pb-2 pt-2">
      <Card :bordered="false" class="mb-1 rounded-2xl shadow-sm">
        <div class="flex flex-col gap-1.5">
          <div class="max-w-[700px] text-xs leading-4 text-[var(--ant-color-text-description)]">
            支持网页采集手工创建，也支持 Excel 导入批量创建，最终都复用同一套采集逻辑与来源规则。
          </div>
          <div>
            <Space wrap size="small">
              <Tag color="processing">已开通区域 {{ activeTenantCount }}</Tag>
              <Button size="small" :loading="loadingTenants" @click="loadTenantOptions">
                刷新区域列表
              </Button>
            </Space>
          </div>
        </div>
      </Card>

      <Tabs v-model:activeKey="activeTab" class="mb-2">
        <Tabs.TabPane key="web" tab="网页采集" />
        <Tabs.TabPane key="excel" tab="Excel 导入" />
      </Tabs>

      <template v-if="activeTab === 'excel'">
        <Card :bordered="false" class="rounded-2xl shadow-sm">
          <div class="flex flex-col gap-3">
            <div class="max-w-[700px] text-xs leading-4 text-[var(--ant-color-text-description)]">
              支持上传 <span class="font-semibold text-[var(--ant-color-text)]">Excel / CSV</span> 文件，按行创建网页采集任务，最终复用现有采集逻辑与来源规则。
            </div>
            <div>
              <Space wrap>
                <Button>
                  <a href="/static/templates/etl_web_collect_import_template.csv" download>
                    下载模板
                  </a>
                </Button>
                <Upload
                  :before-upload="handleImportExcel"
                  accept=".xlsx,.xlsm,.csv"
                  :show-upload-list="false"
                >
                  <Button :loading="importing" type="primary">上传并导入（.xlsx,.xlsm,.csv）</Button>
                </Upload>
              </Space>
            </div>
          </div>
        </Card>
      </template>

      <template v-else>
        <Row :gutter="[16, 16]">
          <Col :lg="16" :span="24">
            <Card :bordered="false" class="rounded-2xl shadow-sm">
              <Form layout="vertical">
                <Row :gutter="16">
                  <Col :span="24">
                    <Form.Item label="数据所属区域" required>
                      <Select
                        v-model:value="webForm.tenant_schema"
                        :loading="loadingTenants"
                        :options="tenantOptions"
                        allow-clear
                        placeholder="请选择所属区域"
                        show-search
                        option-filter-prop="label"
                      />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item label="来源名称" required>
                  <Select
                    v-model:value="webForm.source_name"
                    :loading="loadingSources"
                    :options="sourceOptions"
                    placeholder="请选择来源名称"
                  />
                </Form.Item>
                <Form.Item label="起始 URL 列表" required>
                  <Input.TextArea
                    v-model:value="webForm.seed_urls_text"
                    :rows="4"
                    placeholder="每行一个 URL，至少一条，例如：https://example.com/news"
                  />
                </Form.Item>
                <Form.Item label="分块大小 chunk_size" required>
                  <Input
                    v-model:value="webForm.chunk_size"
                    type="number"
                    placeholder="默认 320，允许范围 80~1200"
                  />
                </Form.Item>
                <Form.Item label="提取策略 extractor_strategy" required>
                  <Select
                    v-model:value="webForm.extractor_strategy"
                    :options="extractorStrategyOptions"
                    placeholder="请选择提取策略，默认 hybrid"
                  />
                </Form.Item>
                <div class="flex justify-end gap-3">
                  <Button @click="resetForm">
                    重置
                  </Button>
                  <Button :loading="submitting" type="primary" @click="submitWeb">
                    创建网页任务
                  </Button>
                </div>
              </Form>
            </Card>
          </Col>

          <Col :lg="8" :span="24">
            <Card :bordered="false" class="rounded-2xl shadow-sm">
              <div class="mb-2 text-sm font-medium">填写说明</div>
              <div class="space-y-2 text-xs leading-4 text-[var(--ant-color-text-description)]">
                <div>
                  <div class="mb-0.5 font-medium text-[var(--ant-color-text)]">
                    选择区域
                  </div>
                  <div>
                    下拉数据来自 IAM
                    租户列表，仅展示状态为“已开通”的租户，并使用其 `schema_name`
                    作为 `tenant_schema` 提交。
                  </div>
                </div>
                <div>
                  <div class="mb-0.5 font-medium text-[var(--ant-color-text)]">
                    网页采集
                  </div>
                  <div>
                    `seed_urls` 需至少一条、每行一个 http(s) 地址；`hybrid`
                    为默认策略，会先尝试托管提取，失败后再回退到规则解析。
                  </div>
                </div>
              </div>
            </Card>
          </Col>
        </Row>
      </template>
    </div>
  </Drawer>
</template>

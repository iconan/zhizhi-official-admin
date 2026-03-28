<script lang="ts" setup>
import { useVbenDrawer } from '@vben/common-ui';
import { Card, Descriptions, Empty, Spin, Tag, Tabs, Timeline, message } from 'ant-design-vue';
import { onMounted, ref, watch } from 'vue';

import {
  fetchArticleDetail,
  publishArticle,
  transitionArticleStatus,
  type ArticleAnnotation,
  type ArticleDetail,
  type ArticleParagraph,
  type ArticleStatus,
} from '#/api/etl/articles';
import { fetchWebSources, type EtlWebSourceItem } from '#/api/etl/sources';

const emit = defineEmits<{ success: [] }>();

const loading = ref(false);
const article = ref<ArticleDetail | null>(null);
const activeTab = ref('content');
const sourceMap = ref<Record<string, string>>({});

async function loadSources() {
  try {
    const { items } = await fetchWebSources();
    sourceMap.value = items.reduce((acc: Record<string, string>, s: EtlWebSourceItem) => {
      acc[s.key] = s.display_name || s.key;
      return acc;
    }, {});
  } catch (error) {
    console.error('[Detail] load sources failed', error);
  }
}

const [Drawer, drawerApi] = useVbenDrawer({
  footer: false,
  onCancel() {
    drawerApi.close();
  },
  onOpenChange(isOpen) {
    if (isOpen) {
      // 加载来源映射
      void loadSources();
      const data = drawerApi.getData();
      if (data?.articleId && data?.tenantSchema) {
        void loadArticleDetail(data.articleId, data.tenantSchema);
      }
    } else {
      article.value = null;
      activeTab.value = 'content';
    }
  },
});

const statusLabelMap: Record<ArticleStatus, string> = {
  crawled: '已抓取',
  parsed: '已解析',
  published: '已发布',
  archived: '已归档',
};

const statusColorMap: Record<ArticleStatus, string> = {
  crawled: 'default',
  parsed: 'blue',
  published: 'success',
  archived: 'warning',
};

async function loadArticleDetail(articleId: string, tenantSchema: string) {
  loading.value = true;
  try {
    article.value = await fetchArticleDetail(articleId, tenantSchema);
  } catch (error) {
    console.error('[Content] fetch article detail failed', error);
    message.error('加载文章详情失败，请稍后重试');
  } finally {
    loading.value = false;
  }
}

function getNodeClass(type: string): string {
  switch (type) {
    case 'highlight':
      return 'bg-amber-100 text-amber-800 px-1 rounded';
    case 'fallback_card':
      return 'bg-red-50 text-red-600 px-2 py-1 rounded border border-red-200 inline-block';
    default:
      return '';
  }
}

function renderParagraphNodes(nodes: ArticleParagraph['nodes']): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return node.content || '';
      if (node.type === 'highlight') return node.exact_text || '';
      if (node.type === 'fallback_card') return `[Fallback: ${node.exact_text || ''}]`;
      return '';
    })
    .join('');
}

async function handlePublish() {
  if (!article.value) return;
  const hide = message.loading({ content: '发布中...', duration: 0 });
  try {
    await publishArticle(article.value.id, article.value.id);
    message.success('文章发布成功');
    emit('success');
    await loadArticleDetail(article.value.id, article.value.id);
  } catch (error: any) {
    console.error('[Content] publish failed', error);
    const messageText = error?.response?.data?.message || error?.message || '';
    if (messageText.includes('40901')) {
      message.warning('当前状态不可发布，请刷新后重试');
    } else {
      message.error('发布失败，请稍后重试');
    }
  } finally {
    hide();
  }
}

async function handleArchive() {
  if (!article.value) return;
  const hide = message.loading({ content: '归档中...', duration: 0 });
  try {
    await transitionArticleStatus(article.value.id, {
      tenant_schema: article.value.id,
      target_status: 'archived',
      reason: '运营归档',
    });
    message.success('文章已归档');
    emit('success');
    await loadArticleDetail(article.value.id, article.value.id);
  } catch (error: any) {
    console.error('[Content] archive failed', error);
    message.error('归档失败，请稍后重试');
  } finally {
    hide();
  }
}

async function handleRestore() {
  if (!article.value) return;
  const hide = message.loading({ content: '恢复中...', duration: 0 });
  try {
    await transitionArticleStatus(article.value.id, {
      tenant_schema: article.value.id,
      target_status: 'crawled',
      reason: '恢复文章',
    });
    message.success('文章已恢复');
    emit('success');
    await loadArticleDetail(article.value.id, article.value.id);
  } catch (error: any) {
    console.error('[Content] restore failed', error);
    message.error('恢复失败，请稍后重试');
  } finally {
    hide();
  }
}

const canPublish = (status?: ArticleStatus) => status === 'parsed';
const canArchive = (status?: ArticleStatus) =>
  status && ['crawled', 'parsed', 'published'].includes(status);
const canRestore = (status?: ArticleStatus) => status === 'archived';
</script>

<template>
  <Drawer class="w-full max-w-[1000px]" title="文章详情">
    <div v-if="loading" class="flex items-center justify-center py-20">
      <Spin size="large" />
    </div>
    <div v-else-if="!article" class="py-10">
      <Empty description="文章加载失败" />
    </div>
    <div v-else class="px-4 pb-4 pt-3">
      <Card :bordered="false" class="mb-4 rounded-xl shadow-sm">
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <h2 class="mb-2 text-xl font-semibold">{{ article.title }}</h2>
            <div class="mb-3 flex flex-wrap gap-2">
              <Tag :color="statusColorMap[article.status]">
                {{ statusLabelMap[article.status] }}
              </Tag>
              <Tag v-if="article.source_name">{{ sourceMap[article.source_name] || article.source_name }}</Tag>
              <Tag v-if="article.author" color="blue">{{ article.author }}</Tag>
            </div>
            <Descriptions :column="2" size="small" layout="horizontal">
              <Descriptions.Item label="发布日期">{{ article.publish_date || '--' }}</Descriptions.Item>
              <Descriptions.Item label="期号信息">{{ article.issue_info || '--' }}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{{ article.created_at }}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{{ article.updated_at }}</Descriptions.Item>
              <Descriptions.Item label="原文链接" :span="2">
                <a v-if="article.original_url" :href="article.original_url" target="_blank" class="text-blue-500 hover:underline">
                  {{ article.original_url }}
                </a>
                <span v-else>--</span>
              </Descriptions.Item>
            </Descriptions>
          </div>
          <div class="ml-4 flex gap-2">
            <button
              v-if="canPublish(article.status)"
              class="rounded bg-green-500 px-3 py-1.5 text-sm text-white hover:bg-green-600"
              @click="handlePublish"
            >
              发布
            </button>
            <button
              v-if="canArchive(article.status)"
              class="rounded bg-orange-500 px-3 py-1.5 text-sm text-white hover:bg-orange-600"
              @click="handleArchive"
            >
              归档
            </button>
            <button
              v-if="canRestore(article.status)"
              class="rounded bg-blue-500 px-3 py-1.5 text-sm text-white hover:bg-blue-600"
              @click="handleRestore"
            >
              恢复
            </button>
          </div>
        </div>
      </Card>

      <Tabs v-model:active-key="activeTab" class="article-detail-tabs">
        <Tabs.TabPane key="content" tab="正文内容">
          <Card :bordered="false" class="rounded-xl shadow-sm">
            <div v-if="article.paragraphs && article.paragraphs.length > 0" class="space-y-4">
              <div
                v-for="paragraph in article.paragraphs"
                :key="paragraph.pid"
                class="paragraph-block border-l-4 border-gray-200 pl-3"
                :data-pid="paragraph.pid"
              >
                <div class="mb-1 text-xs text-gray-400">{{ paragraph.pid }}</div>
                <p class="text-base leading-relaxed text-gray-800">
                  <template v-for="(node, idx) in paragraph.nodes" :key="idx">
                    <span v-if="node.type === 'text'">{{ node.content }}</span>
                    <mark
                      v-else-if="node.type === 'highlight'"
                      class="bg-amber-100 px-1 rounded cursor-help"
                      :title="node.deep_explain"
                    >
                      {{ node.exact_text }}
                    </mark>
                    <span
                      v-else-if="node.type === 'fallback_card'"
                      class="my-1 block rounded border border-red-200 bg-red-50 px-2 py-1 text-sm text-red-600"
                    >
                      [Fallback] {{ node.exact_text }}
                    </span>
                  </template>
                </p>
              </div>
            </div>
            <div v-else-if="article.content_clean" class="whitespace-pre-wrap text-base leading-relaxed text-gray-800">
              {{ article.content_clean }}
            </div>
            <Empty v-else description="暂无正文内容" />
          </Card>
        </Tabs.TabPane>

        <Tabs.TabPane key="annotations" tab="批注列表">
          <Card :bordered="false" class="rounded-xl shadow-sm">
            <div v-if="article.annotations && article.annotations.length > 0" class="space-y-3">
              <div
                v-for="anno in article.annotations"
                :key="anno.id"
                class="annotation-item rounded-lg border border-gray-200 p-3"
                :class="{ 'bg-red-50 border-red-200': anno.is_fallback }"
              >
                <div class="mb-2 flex items-center gap-2">
                  <Tag size="small">{{ anno.pid }}</Tag>
                  <Tag v-if="anno.is_fallback" color="error">Fallback</Tag>
                </div>
                <div class="mb-1 text-sm text-gray-500">原文: {{ anno.exact_text }}</div>
                <div class="mb-1 text-blue-600">白话: {{ anno.replace_white_talk }}</div>
                <div class="text-gray-700">解读: {{ anno.deep_explain }}</div>
              </div>
            </div>
            <Empty v-else description="暂无批注数据" />
          </Card>
        </Tabs.TabPane>

        <Tabs.TabPane key="pipeline" tab="处理链路">
          <Card :bordered="false" class="rounded-xl shadow-sm">
            <Timeline v-if="article.pipeline_meta">
              <Timeline.Item color="blue">
                <div class="font-medium">S1 结构化切分</div>
                <div class="text-sm text-gray-500">
                  段落数: {{ article.pipeline_meta.s1?.paragraphs || 0 }}
                  | 字数: {{ article.pipeline_meta.s1?.word_count || 0 }}
                </div>
              </Timeline.Item>
              <Timeline.Item color="green">
                <div class="font-medium">S2 批注生成</div>
                <div class="text-sm text-gray-500">
                  批注数: {{ article.pipeline_meta.s2?.annotations_count || 0 }}
                  | Fallback: {{ article.pipeline_meta.s2?.fallback_count || 0 }}
                  | 批次: {{ article.pipeline_meta.s2?.batches || 0 }}
                </div>
                <div class="mt-1 text-xs text-gray-400">
                  Provider: {{ article.pipeline_meta.s2?.provider_items || 0 }}
                  | Normalized: {{ article.pipeline_meta.s2?.normalized_items || 0 }}
                  | Invalid: {{ article.pipeline_meta.s2?.invalid_items || 0 }}
                  | Deduplicated: {{ article.pipeline_meta.s2?.deduplicated_items || 0 }}
                </div>
              </Timeline.Item>
              <Timeline.Item color="orange">
                <div class="font-medium">S3 AST 缝合</div>
                <div class="text-sm text-gray-500">
                  缝合成功: {{ article.pipeline_meta.s3?.stitched || 0 }}
                  | Fallback Cards: {{ article.pipeline_meta.s3?.fallback_cards || 0 }}
                </div>
              </Timeline.Item>
            </Timeline>
            <Empty v-else description="暂无处理链路数据" />
          </Card>
        </Tabs.TabPane>

        <Tabs.TabPane key="raw" tab="原始数据">
          <Card :bordered="false" class="rounded-xl shadow-sm">
            <pre class="max-h-96 overflow-auto rounded bg-gray-50 p-3 text-xs">{{ JSON.stringify(article, null, 2) }}</pre>
          </Card>
        </Tabs.TabPane>
      </Tabs>
    </div>
  </Drawer>
</template>

<style scoped>
.paragraph-block {
  transition: background-color 0.2s;
}
.paragraph-block:hover {
  background-color: rgba(0, 0, 0, 0.02);
}
.annotation-item {
  transition: all 0.2s;
}
.annotation-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
</style>

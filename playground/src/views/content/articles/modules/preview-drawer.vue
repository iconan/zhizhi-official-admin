<script lang="ts" setup>
import { useVbenDrawer } from '@vben/common-ui';
import { Card, Empty, Spin, Tag, message } from 'ant-design-vue';
import { ref } from 'vue';

import {
  fetchArticleDetail,
  type ArticleDetail,
  type ArticleStatus,
} from '#/api/etl/articles';
import { fetchWebSources, type EtlWebSourceItem } from '#/api/etl/sources';

const loading = ref(false);
const article = ref<ArticleDetail | null>(null);
const sourceMap = ref<Record<string, string>>({});

async function loadSources() {
  try {
    const { items } = await fetchWebSources();
    sourceMap.value = items.reduce((acc: Record<string, string>, s: EtlWebSourceItem) => {
      acc[s.key] = s.display_name || s.key;
      return acc;
    }, {});
  } catch (error) {
    console.error('[Preview] load sources failed', error);
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
    message.error('加载文章预览失败，请稍后重试');
  } finally {
    loading.value = false;
  }
}

function renderContent(): string {
  if (!article.value?.paragraphs || article.value.paragraphs.length === 0) {
    return article.value?.content_clean || article.value?.content_raw || '暂无内容';
  }

  return article.value.paragraphs
    .map((paragraph) => {
      const text = paragraph.nodes
        .map((node) => {
          if (node.type === 'text') return node.content || '';
          if (node.type === 'highlight') return node.exact_text || '';
          if (node.type === 'fallback_card') return `[${node.exact_text || ''}]`;
          return '';
        })
        .join('');
      return `<p class="mb-4 leading-relaxed">${text}</p>`;
    })
    .join('');
}
</script>

<template>
  <Drawer class="w-full max-w-[800px]" title="文章预览">
    <div v-if="loading" class="flex items-center justify-center py-20">
      <Spin size="large" />
    </div>
    <div v-else-if="!article" class="py-10">
      <Empty description="文章加载失败" />
    </div>
    <div v-else class="px-4 pb-4 pt-3">
      <Card :bordered="false" class="mb-4 rounded-xl shadow-sm">
        <h2 class="mb-3 text-xl font-bold text-gray-900">{{ article.title }}</h2>
        <div class="mb-3 flex flex-wrap items-center gap-3 text-sm text-gray-500">
          <Tag :color="statusColorMap[article.status]">
            {{ statusLabelMap[article.status] }}
          </Tag>
          <span v-if="article.source_name">来源: {{ sourceMap[article.source_name] || article.source_name }}</span>
          <span v-if="article.author">作者: {{ article.author }}</span>
          <span v-if="article.publish_date">发布日期: {{ article.publish_date }}</span>
          <span v-if="article.word_count">字数: {{ article.word_count }}</span>
        </div>
        <div v-if="article.issue_info" class="text-sm text-gray-500">
          {{ article.issue_info }}
        </div>
      </Card>

      <Card :bordered="false" class="rounded-xl shadow-sm">
        <div class="prose prose-sm max-w-none text-gray-800" v-html="renderContent()" />
      </Card>

      <Card v-if="article.annotations && article.annotations.length > 0" :bordered="false" class="mt-4 rounded-xl shadow-sm">
        <h3 class="mb-3 text-lg font-semibold text-gray-900">批注高亮</h3>
        <div class="space-y-2">
          <div
            v-for="anno in article.annotations.filter(a => !a.is_fallback).slice(0, 5)"
            :key="anno.id"
            class="rounded-lg bg-amber-50 p-3 text-sm"
          >
            <div class="mb-1 font-medium text-amber-800">{{ anno.exact_text }}</div>
            <div class="text-amber-700">{{ anno.replace_white_talk }}</div>
          </div>
          <div v-if="article.annotations.filter(a => !a.is_fallback).length > 5" class="text-center text-sm text-gray-500">
            还有 {{ article.annotations.filter(a => !a.is_fallback).length - 5 }} 条批注...
          </div>
        </div>
      </Card>
    </div>
  </Drawer>
</template>

<style scoped>
:deep(.vben-drawer-body) {
  overflow-y: auto;
}
</style>

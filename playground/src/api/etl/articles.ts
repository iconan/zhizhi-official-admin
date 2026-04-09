import { requestClient } from '#/api/request';

const ETL_PREFIX = '/v1/admin/etl';

export type ArticleStatus = 'crawled' | 'parsed' | 'published' | 'archived';

export interface ArticleListItem {
  id: string;
  title: string;
  source_name: string;
  tenant_schema: string;
  author?: string;
  publish_date?: string;
  status: ArticleStatus;
  created_at: string;
  updated_at: string;
  original_url?: string;
  issue_info?: string;
  annotations_count?: number;
  fallback_count?: number;
  word_count?: number;
}

export interface ArticleParagraphNode {
  type: 'text' | 'highlight' | 'fallback_card';
  content?: string;
  exact_text?: string;
  simple_explain?: string;
  replace_white_talk?: string;
  deep_explain?: string;
}

export interface ArticleParagraph {
  pid: string;
  nodes: ArticleParagraphNode[];
}

export interface ArticleAnnotation {
  id: string;
  pid: string;
  exact_text: string;
  simple_explain?: string;
  replace_white_talk: string;
  deep_explain: string;
  is_fallback: boolean;
}

export interface ArticlePipelineMetaS1 {
  paragraph_count?: number;
  paragraph_ids?: string[];
}

export interface ArticlePipelineMetaS2 {
  annotations_count?: number;
  fallback_count?: number;
  batches?: number;
  provider_items?: number;
  normalized_items?: number;
  invalid_items?: number;
  deduplicated_items?: number;
  annotation_provider?: string;
  annotation_model?: string;
  batch_size?: number;
  status?: string;
  error?: string;
}

export interface ArticlePipelineMetaS3 {
  stitched_count?: number;
  fallback_card_count?: number;
}

export interface ArticlePipelineReparseHistoryItem {
  at?: string;
  reason?: string;
  previous_status?: string;
}

export interface ArticlePipelineMeta {
  pipeline_version?: string;
  last_stage?: string;
  s1?: ArticlePipelineMetaS1 | null;
  s2?: ArticlePipelineMetaS2 | null;
  s3?: ArticlePipelineMetaS3 | null;
  reparse_count?: number;
  reparse_history?: ArticlePipelineReparseHistoryItem[];
}

export interface ArticleDetail {
  id: string;
  title: string;
  source_name: string;
  tenant_schema: string;
  author?: string;
  publish_date?: string;
  original_url?: string;
  issue_info?: string;
  status: ArticleStatus;
  word_count?: number;
  content_raw?: string;
  content_clean?: string;
  paragraphs?: ArticleParagraph[];
  annotations?: ArticleAnnotation[];
  pipeline_meta?: ArticlePipelineMeta | null;
  created_at: string;
  updated_at: string;
}

export interface ArticleQuery {
  tenant_schema: string;
  status?: ArticleStatus;
  source_name?: string;
  keyword?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export type ArticleAggregateQuery = Omit<ArticleQuery, 'tenant_schema'>;

export interface ArticleListResponse {
  items: ArticleListItem[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
}

export interface StatusTransitionInput {
  tenant_schema: string;
  target_status: ArticleStatus;
  reason?: string;
}

export interface StatusTransitionResult {
  article_id: string;
  previous_status: ArticleStatus;
  current_status: ArticleStatus;
  success: boolean;
  message?: string;
}

export interface PublishResult {
  article_id: string;
  tenant_schema: string;
  previous_status: ArticleStatus;
  status: ArticleStatus;
  accepted: boolean;
}

export interface ArticleDeleteInput {
  tenant_schema: string;
  reason?: string;
}

export interface ArticleDeleteResult {
  article_id: string;
  tenant_schema: string;
  previous_status: string;
  deleted: boolean;
  deleted_materials_count: number;
  deleted_annotations_count: number;
  success: boolean;
  message?: string;
}

export interface BatchStatusInput {
  tenant_schema: string;
  article_ids: string[];
  reason?: string;
}

export interface BatchStatusResult {
  total: number;
  success_count: number;
  failed_count: number;
  failures: { article_id: string; error: string }[];
}

export async function fetchArticles(params: ArticleQuery): Promise<ArticleListResponse> {
  const res = await requestClient.get(`${ETL_PREFIX}/articles`, { params });
  const data = (res as any)?.data ?? res;
  const payload = data?.data ?? data ?? {};
  const items = ((payload as any)?.items ?? []) as ArticleListItem[];
  const total = (payload as any)?.total ?? items.length ?? 0;
  const offset = (payload as any)?.offset ?? 0;
  const limit = (payload as any)?.limit ?? 20;
  const has_more = (payload as any)?.has_more ?? false;
  return { items, total, offset, limit, has_more } as ArticleListResponse;
}

export async function fetchArticlesAggregate(
  params: ArticleAggregateQuery,
): Promise<ArticleListResponse> {
  const res = await requestClient.get(`${ETL_PREFIX}/articles/aggregate`, { params });
  const data = (res as any)?.data ?? res;
  const payload = data?.data ?? data ?? {};
  const items = ((payload as any)?.items ?? []) as ArticleListItem[];
  const total = (payload as any)?.total ?? items.length ?? 0;
  const offset = (payload as any)?.offset ?? 0;
  const limit = (payload as any)?.limit ?? 20;
  const has_more = (payload as any)?.has_more ?? false;
  return { items, total, offset, limit, has_more } as ArticleListResponse;
}

export async function fetchArticleDetail(articleId: string, tenantSchema: string): Promise<ArticleDetail> {
  const res = await requestClient.get(`${ETL_PREFIX}/articles/${articleId}`, {
    params: { tenant_schema: tenantSchema },
  });
  const data = (res as any)?.data ?? res;
  const payload = data?.data ?? data ?? {};
  return payload as ArticleDetail;
}

export async function transitionArticleStatus(
  articleId: string,
  input: StatusTransitionInput,
): Promise<StatusTransitionResult> {
  const res = await requestClient.post(`${ETL_PREFIX}/articles/${articleId}/status-transition`, input);
  const data = (res as any)?.data ?? res;
  const payload = data?.data ?? data ?? {};
  return payload as StatusTransitionResult;
}

export async function publishArticle(articleId: string, tenantSchema: string): Promise<PublishResult> {
  const res = await requestClient.post(`${ETL_PREFIX}/articles/${articleId}/publish`, {
    tenant_schema: tenantSchema,
  });
  const data = (res as any)?.data ?? res;
  const payload = data?.data ?? data ?? {};
  return payload as PublishResult;
}

export async function deleteArticle(
  articleId: string,
  input: ArticleDeleteInput,
): Promise<ArticleDeleteResult> {
  const res = await requestClient.post(`${ETL_PREFIX}/articles/${articleId}/delete`, {
    tenant_schema: input.tenant_schema,
    reason: input.reason || '手动删除',
  });
  const data = (res as any)?.data ?? res;
  const payload = data?.data ?? data ?? {};
  return payload as ArticleDeleteResult;
}

export async function batchPublishArticles(input: BatchStatusInput): Promise<BatchStatusResult> {
  const res = await requestClient.post(`${ETL_PREFIX}/articles/batch/publish`, input);
  const data = (res as any)?.data ?? res;
  const payload = data?.data ?? data ?? {};
  return payload as BatchStatusResult;
}

export async function batchArchiveArticles(input: BatchStatusInput): Promise<BatchStatusResult> {
  const res = await requestClient.post(`${ETL_PREFIX}/articles/batch/archive`, input);
  const data = (res as any)?.data ?? res;
  const payload = data?.data ?? data ?? {};
  return payload as BatchStatusResult;
}

export async function batchRestoreArticles(input: BatchStatusInput): Promise<BatchStatusResult> {
  const res = await requestClient.post(`${ETL_PREFIX}/articles/batch/restore`, input);
  const data = (res as any)?.data ?? res;
  const payload = data?.data ?? data ?? {};
  return payload as BatchStatusResult;
}

export async function batchParseArticles(input: BatchStatusInput): Promise<BatchStatusResult> {
  const res = await requestClient.post(`${ETL_PREFIX}/articles/batch/parse`, input);
  const data = (res as any)?.data ?? res;
  const payload = data?.data ?? data ?? {};
  return payload as BatchStatusResult;
}

export interface ReparseResult {
  article_id: string;
  previous_status: ArticleStatus;
  current_status: ArticleStatus;
  annotations_count: number;
  fallback_count: number;
  stitched_count: number;
  fallback_card_count: number;
  success: boolean;
  message?: string;
}

export async function reparseArticle(
  articleId: string,
  tenantSchema: string,
  reason?: string,
): Promise<ReparseResult> {
  const res = await requestClient.post(
    `${ETL_PREFIX}/articles/${articleId}/reparse`,
    {
      tenant_schema: tenantSchema,
      reason: reason || '手动重新解析',
    },
    { timeout: 120000 }, // 2分钟超时，重新解析可能耗时较长
  );
  const data = (res as any)?.data ?? res;
  const payload = data?.data ?? data ?? {};
  return payload as ReparseResult;
}

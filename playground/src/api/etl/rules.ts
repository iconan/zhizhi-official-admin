import { requestClient } from '#/api/request';

const ETL_PREFIX = '/v1/admin/etl';

export interface RuleItem {
  author_selectors?: string[];
  content_selectors?: string[];
  date_selectors?: string[];
  enabled?: boolean;
  host_pattern: string;
  id: string;
  name: string;
  priority?: number;
  rollout_percent?: number;
  rollout_tenant_schemas?: string[];
  source_selectors?: string[];
  title_selectors?: string[];
  version?: number;
}

export interface RuleQuery {
  limit?: number;
  offset?: number;
}

export interface RuleInput {
  author_selectors?: string[];
  content_selectors?: string[];
  date_selectors?: string[];
  enabled?: boolean;
  host_pattern: string;
  name: string;
  priority?: number;
  rollout_percent?: number;
  rollout_tenant_schemas?: string[];
  source_selectors?: string[];
  title_selectors?: string[];
  version?: number;
}

export async function fetchRules(params: RuleQuery = {}) {
  const res = await requestClient.get(`${ETL_PREFIX}/extract-rules/web`, { params });
  const data = (res as any)?.data ?? res;
  const payload = data?.data ?? data ?? {};
  const items = ((payload as any)?.items ?? []) as RuleItem[];
  const total = (payload as any)?.total ?? items.length ?? 0;
  return { items, total } as { items: RuleItem[]; total: number };
}

export async function createRule(payload: RuleInput) {
  return requestClient.post(`${ETL_PREFIX}/extract-rules/web`, payload);
}

export async function updateRule(ruleId: string, payload: Partial<RuleInput>) {
  return requestClient.post(`${ETL_PREFIX}/extract-rules/web/${ruleId}/update`, payload);
}

export async function deleteRule(ruleId: string) {
  return requestClient.post(`${ETL_PREFIX}/extract-rules/web/${ruleId}/delete`);
}

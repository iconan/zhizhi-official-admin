import { requestClient } from '#/api/request';

const ETL_PREFIX = '/v1/admin/etl';

export interface RuleQuery {
  limit?: number;
  offset?: number;
  keyword?: string;
}

export interface RuleInput {
  name: string;
  description?: string;
}

export async function fetchRules(params: RuleQuery = {}) {
  const res = await requestClient.get(`${ETL_PREFIX}/extract-rules/web`, { params });
  const data = (res as any)?.data ?? res;
  const payload = data?.data ?? data ?? {};
  const items = (payload as any)?.items ?? [];
  const total = (payload as any)?.total ?? items.length ?? 0;
  return { items, total } as { items: any[]; total: number };
}

export async function createRule(payload: RuleInput) {
  return requestClient.post(`${ETL_PREFIX}/extract-rules/web`, payload);
}

export async function updateRule(ruleId: string, payload: RuleInput) {
  return requestClient.post(`${ETL_PREFIX}/extract-rules/web/${ruleId}`, payload);
}

export async function deleteRule(ruleId: string) {
  return requestClient.post(`${ETL_PREFIX}/extract-rules/web/${ruleId}/delete`);
}

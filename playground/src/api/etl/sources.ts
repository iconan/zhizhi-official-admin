import { requestClient } from '#/api/request';

const ETL_PREFIX = '/v1/admin/etl';

export interface EtlWebSourceItem {
  display_name: string;
  display_names: string[];
  host_patterns: string[];
  key: string;
}

export async function fetchWebSources() {
  const res = await requestClient.get(`${ETL_PREFIX}/sources/web`);
  const data = (res as any)?.data ?? res;
  const payload = data?.data ?? data ?? {};
  const items = ((payload as any)?.items ?? []) as EtlWebSourceItem[];
  const total = (payload as any)?.total ?? items.length ?? 0;
  return { items, total } as { items: EtlWebSourceItem[]; total: number };
}

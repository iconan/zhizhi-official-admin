import { requestClient } from '#/api/request';

const ADMIN_PREFIX = '/v1/admin';

export type RegionActiveStatus = 1 | -1;

export interface Region {
  id?: string;
  code: string;
  name: string;
  level: number;
  parent_code?: string | null;
  full_name?: string | null;
  is_active?: RegionActiveStatus;
  created_at?: string;
  updated_at?: string;
}

export interface RegionQuery {
  limit?: number;
  offset?: number;
  code?: string;
  keyword?: string;
  level?: number;
  parent_code?: string | null;
  is_active?: RegionActiveStatus;
}

export interface SaveRegionInput {
  code?: string;
  name?: string;
  level?: number;
  parent_code?: string | null;
  full_name?: string | null;
  is_active?: RegionActiveStatus;
}

export async function fetchRegions(params: RegionQuery = {}) {
  const res = await requestClient.get<{ items?: Region[]; total?: number; data?: any }>(
    `${ADMIN_PREFIX}/regions`,
    { params },
  );
  const payload = (res as any)?.data ?? res;
  const items = (payload as any)?.items ?? (payload as any)?.data?.items ?? [];
  const total = (payload as any)?.total ?? (payload as any)?.data?.total ?? items.length ?? 0;
  return { items, total } as { items: Region[]; total: number };
}

export async function fetchRegionDetail(id: string) {
  return requestClient.get(`${ADMIN_PREFIX}/regions/${id}`);
}

export async function createRegion(data: Required<Pick<SaveRegionInput, 'code' | 'name' | 'level'>> & SaveRegionInput) {
  return requestClient.post(`${ADMIN_PREFIX}/regions`, data);
}

export async function updateRegion(id: string, data: SaveRegionInput) {
  return requestClient.post(`${ADMIN_PREFIX}/regions/${id}/update`, data);
}

export async function deleteRegion(id: string) {
  return requestClient.post(`${ADMIN_PREFIX}/regions/${id}/delete`);
}

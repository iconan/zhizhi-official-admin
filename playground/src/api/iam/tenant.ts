import { requestClient } from '#/api/request';

const ADMIN_PREFIX = '/v1/admin';

export type TenantStatus =
  | 'active'
  | 'disabled'
  | 'provisioning'
  | 'provisioning_failed';

export interface IamTenant {
  created_at?: null | string;
  es_pool?: null | number;
  mark?: null | string;
  name: string;
  schema_name: string;
  schema_version?: string;
  status: TenantStatus;
  tenant_code: string;
  tenant_id: string;
  updated_at?: null | string;
}

export interface TenantQuery {
  limit?: number;
  offset?: number;
  status?: TenantStatus;
  tenant_code?: string;
}

export interface CreateTenantInput {
  es_pool?: null | number;
  mark?: null | string;
  name: string;
  tenant_code: string;
}

export interface UpdateTenantInput {
  es_pool?: null | number;
  mark?: null | string;
  name: string;
}

export interface UpdateTenantStatusInput {
  status: Extract<TenantStatus, 'active' | 'disabled'>;
}

export async function fetchTenants(params: TenantQuery = {}) {
  const res = await requestClient.get<{
    data?: any;
    items?: IamTenant[];
    total?: number;
  }>(`${ADMIN_PREFIX}/tenants`, { params });
  const payload = (res as any)?.data ?? res ?? {};
  const items = (payload as any)?.items ?? [];
  const total = (payload as any)?.total ?? items.length ?? 0;
  return { items, total };
}

export async function createTenant(data: CreateTenantInput) {
  return requestClient.post(`${ADMIN_PREFIX}/tenants`, data);
}

export async function updateTenant(tenantId: string, data: UpdateTenantInput) {
  return requestClient.post(`${ADMIN_PREFIX}/tenants/${tenantId}`, data);
}

export async function reprovisionTenant(tenantId: string) {
  return requestClient.post(`${ADMIN_PREFIX}/tenants/${tenantId}/reprovision`);
}

export async function updateTenantStatus(
  tenantId: string,
  data: UpdateTenantStatusInput,
) {
  return requestClient.post(`${ADMIN_PREFIX}/tenants/${tenantId}/status`, data);
}

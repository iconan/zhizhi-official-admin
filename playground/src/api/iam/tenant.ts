import { requestClient } from '#/api/request';

const ADMIN_PREFIX = '/v1/admin';

export type TenantStatus = 'active' | 'disabled' | 'provisioning' | 'provisioning_failed';

export interface IamTenant {
  tenant_id: string;
  tenant_code: string;
  name: string;
  schema_name: string;
  status: TenantStatus;
  schema_version?: string;
  es_pool?: number | null;
  mark?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TenantQuery {
  limit?: number;
  offset?: number;
  status?: TenantStatus;
  tenant_code?: string;
}

export interface CreateTenantInput {
  tenant_code: string;
  name: string;
  es_pool?: number | null;
  mark?: string | null;
}

export interface UpdateTenantInput {
  name: string;
  es_pool?: number | null;
  mark?: string | null;
}

export interface UpdateTenantStatusInput {
  status: Extract<TenantStatus, 'active' | 'disabled'>;
}

export async function fetchTenants(params: TenantQuery = {}) {
  const res = await requestClient.get<{ items?: IamTenant[]; total?: number; data?: any }>(
    `${ADMIN_PREFIX}/tenants`,
    { params },
  );
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

export async function updateTenantStatus(tenantId: string, data: UpdateTenantStatusInput) {
  return requestClient.post(`${ADMIN_PREFIX}/tenants/${tenantId}/status`, data);
}

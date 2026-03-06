import { requestClient } from '#/api/request';

const IAM_PREFIX = '/v1/admin/iam';

export interface IamOrg {
  org_id: string;
  name: string;
  status: 'active' | 'disabled';
  owner_id?: string | null;
  parent_id?: string | null;
  credit_code?: string | null;
  max_members?: number | null;
  entitled_regions?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface OrgQuery {
  limit?: number;
  offset?: number;
  status?: 'active' | 'disabled';
  keyword?: string;
}

export interface SaveOrgInput {
  name?: string;
  owner_id?: string | null;
  parent_id?: string | null;
  credit_code?: string | null;
  max_members?: number | null;
  entitled_regions?: string[];
}

export async function fetchOrgs(params: OrgQuery = {}) {
  const res = await requestClient.get<{ items?: IamOrg[]; data?: any }>(
    `${IAM_PREFIX}/organizations`,
    { params },
  );
  return (res as any)?.items ?? (res as any)?.data?.items ?? (res as any)?.data ?? [];
}

export async function createOrg(data: Required<Pick<SaveOrgInput, 'name'>> & SaveOrgInput) {
  return requestClient.post(`${IAM_PREFIX}/organizations`, data);
}

export async function updateOrg(orgId: string, data: SaveOrgInput) {
  return requestClient.post(`${IAM_PREFIX}/organizations/${orgId}`, data);
}

export async function updateOrgStatus(orgId: string, status: 'active' | 'disabled') {
  return requestClient.post(`${IAM_PREFIX}/organizations/${orgId}/status`, { status });
}

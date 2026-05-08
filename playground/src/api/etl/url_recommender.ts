import { requestClient } from '#/api/request';

const PREFIX = '/v1/admin/etl/url-recommender';

export interface UrlRecommenderCandidate {
  source: string;
  source_label: string;
  url: string;
  title: string;
  published_at?: string | null;
}

export interface UrlRecommenderSourceError {
  source: string;
  source_label: string;
  message: string;
}

export interface UrlRecommenderSearchResponse {
  candidates: UrlRecommenderCandidate[];
  errors: UrlRecommenderSourceError[];
  total: number;
}

export interface UrlRecommenderSearchRequest {
  keywords: string;
  sources?: string[];
  date_from?: string;
  date_to?: string;
  limit_per_source?: number;
}

export async function searchOfficialMediaUrls(payload: UrlRecommenderSearchRequest) {
  const res = await requestClient.post(`${PREFIX}/search`, payload);
  const data = (res as any)?.data ?? res;
  const inner = data?.data ?? data ?? {};
  return {
    candidates: ((inner as any)?.candidates ?? []) as UrlRecommenderCandidate[],
    errors: ((inner as any)?.errors ?? []) as UrlRecommenderSourceError[],
    total: ((inner as any)?.total ?? 0) as number,
  };
}

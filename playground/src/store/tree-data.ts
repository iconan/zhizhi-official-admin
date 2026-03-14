import { fetchOrgs, type IamOrg } from '#/api/iam/org';
import { fetchRegions, type Region } from '#/api/om/region';

type TreeNode = {
  label: string;
  value: string;
  key: string;
  title?: string;
  children?: TreeNode[];
};

let orgCache: IamOrg[] | null = null;
let orgCachePromise: Promise<IamOrg[]> | null = null;

let regionCache: Region[] | null = null;
let regionCachePromise: Promise<Region[]> | null = null;

function buildTree<T extends Record<string, any>>(
  list: T[],
  options: {
    idField: keyof T;
    parentField: keyof T;
    label: (item: T) => string;
  },
): TreeNode[] {
  const nodeMap: Record<string, TreeNode> = {};
  const roots: TreeNode[] = [];

  list.forEach((item) => {
    const id = String(item[options.idField] ?? '');
    if (!id) return;
    nodeMap[id] = {
      key: id,
      value: id,
      title: options.label(item),
      label: options.label(item),
      children: nodeMap[id]?.children || [],
    };
  });

  list.forEach((item) => {
    const id = String(item[options.idField] ?? '');
    if (!id) return;
    const parentId = item[options.parentField] ? String(item[options.parentField]) : '';
    const node = nodeMap[id];
    if (!node) return;
    if (parentId && nodeMap[parentId]) {
      nodeMap[parentId].children ||= [];
      nodeMap[parentId].children!.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

export async function getOrgListCached(force = false) {
  if (!force && orgCache) return orgCache;
  if (!force && orgCachePromise) return orgCachePromise;
  orgCachePromise = fetchOrgs({ limit: 200, offset: 0 }).then((list) => {
    orgCache = list;
    orgCachePromise = null;
    return list;
  });
  return orgCachePromise;
}

export async function getRegionListCached(force = false) {
  if (!force && regionCache) return regionCache;
  if (!force && regionCachePromise) return regionCachePromise;
  regionCachePromise = fetchRegions({ limit: 10000, offset: 0 }).then(({ items }) => {
    regionCache = items;
    regionCachePromise = null;
    return items;
  });
  return regionCachePromise;
}

export async function getActiveOrgTreeOptions(force = false) {
  const list = await getOrgListCached(force);
  const active = list.filter((item) => item.status === 'active');
  return buildTree(active, {
    idField: 'org_id',
    parentField: 'parent_id',
    label: (item) => `${item.name}`,
  });
}

export async function getAllOrgOptions(force = false) {
  const list = await getOrgListCached(force);
  return list.map((item) => ({
    label: `${item.name} (${item.org_id.slice(0, 8)})`,
    value: item.org_id,
  }));
}

export async function getActiveOrgOptions(force = false) {
  const list = await getOrgListCached(force);
  return list
    .filter((item) => item.status === 'active')
    .map((item) => ({
      label: `${item.name} (${item.org_id.slice(0, 8)})`,
      value: item.org_id,
    }));
}

export async function getRegionTreeOptions(force = false) {
  const list = await getRegionListCached(force);
  const uniqItems = Array.from(new Map(list.map((item) => [item.code, item])).values());
  return buildTree(uniqItems, {
    idField: 'code',
    parentField: 'parent_code',
    label: (item) => `${item.name} (${item.code})`,
  });
}

export async function getRegionLabelMap(force = false) {
  const list = await getRegionListCached(force);
  return list.reduce((acc, cur) => {
    acc[cur.code] = cur.name;
    return acc;
  }, {} as Record<string, string>);
}

export function clearTreeDataCache() {
  orgCache = null;
  orgCachePromise = null;
  regionCache = null;
  regionCachePromise = null;
}

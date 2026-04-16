import client from './client';

/* ── Types ── */

export interface GraphNode {
  id: string;
  name: string;
  type: string; // artifact, era, category, location, tag
  properties?: Record<string, unknown>;
}

export interface GraphLink {
  source: string;
  target: string;
  relation: string;
}

export interface GraphDataResponse {
  nodes: GraphNode[];
  links: GraphLink[];
  total_nodes: number;
  total_links: number;
}

export interface NodeDetailResponse {
  node: GraphNode;
  links: GraphLink[];
  neighbors: GraphNode[];
}

/* ── API functions ── */

/** 获取完整图谱数据 */
export async function getFullGraph(
  limit: number = 100,
  nodeTypes: string[] = ['artifact'],
): Promise<GraphDataResponse> {
  const res = await client.get<GraphDataResponse>('/graph/full', {
    params: { limit, node_types: nodeTypes.join(',') },
  });
  return res.data;
}

/** 搜索图谱节点（返回匹配节点及一跳邻居子图） */
export async function searchGraph(
  keyword: string,
  nodeTypes: string[] = ['artifact'],
): Promise<GraphDataResponse> {
  const res = await client.get<GraphDataResponse>('/graph/search', {
    params: { keyword, node_types: nodeTypes.join(',') },
  });
  return res.data;
}

/** 获取单个节点的详情和直接关系 */
export async function getNodeDetail(
  nodeId: string,
): Promise<NodeDetailResponse> {
  const res = await client.get<NodeDetailResponse>(
    `/graph/node/${encodeURIComponent(nodeId)}`,
  );
  return res.data;
}

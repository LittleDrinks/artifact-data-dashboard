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

/** 搜索图谱节点（返回匹配节点及多跳邻居子图） */
export async function searchGraph(
  keyword: string,
  nodeTypes: string[] = ['artifact'],
  depth: number = 1,
): Promise<GraphDataResponse> {
  const res = await client.get<GraphDataResponse>('/graph/search', {
    params: { keyword, node_types: nodeTypes.join(','), depth },
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

/** 导出图谱三元组为 CSV */
export async function exportGraph(limit: number = 500): Promise<void> {
  const res = await client.get('/graph/export', {
    params: { limit },
    responseType: 'blob',
  });
  // Create download link
  const blob = new Blob([res.data], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'graph_triples_export.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/** 文本知识抽取 */
export async function extractTriples(text: string): Promise<{ data: unknown }> {
  const res = await client.post('/graph/extract', { text });
  return res;
}

/** CSV 导入（multipart/form-data） */
export async function importGraphCSV(file: File): Promise<{ data: { count: number } }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await client.post('/graph/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res;
}

/** CSV 导出（直接下载） */
export async function exportGraphCSV(): Promise<void> {
  const res = await client.get('/graph/export', {
    responseType: 'blob',
  });
  const blob = new Blob([res.data], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'graph_triples.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

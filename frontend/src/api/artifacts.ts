import client from './client';

export interface Artifact {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  era: string | null;
  location: string | null;
  image_url: string | null;
  tags: string | null;
  // 新增字段
  material: string | null;  // 材质
  museum: string | null;    // 馆藏
  source_url: string | null;  // 来源链接
  dimensions: string | null;  // 尺寸
  created_at: string;
  updated_at: string;
}

export interface ArtifactListParams {
  page?: number;
  size?: number;
  keyword?: string;
  category?: string;
  era?: string;
  location?: string;
}

export interface ArtifactListResponse {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  items: Artifact[];
}

export interface ArtifactFormData {
  name: string;
  description?: string | null;
  category?: string | null;
  era?: string | null;
  location?: string | null;
  image_url?: string | null;
  tags?: string | null;
  // 新增字段
  material?: string | null;
  museum?: string | null;
  source_url?: string | null;
  dimensions?: string | null;
}

/** 获取文物列表 */
export async function getArtifacts(params?: ArtifactListParams): Promise<ArtifactListResponse> {
  const res = await client.get<ArtifactListResponse>('/artifacts', { params });
  return res.data;
}

/** 获取文物详情 */
export async function getArtifact(id: number): Promise<Artifact> {
  const res = await client.get<Artifact>(`/artifacts/${id}`);
  return res.data;
}

/** 创建文物 */
export async function createArtifact(data: ArtifactFormData): Promise<Artifact> {
  const res = await client.post<Artifact>('/artifacts', data);
  return res.data;
}

/** 更新文物 */
export async function updateArtifact(id: number, data: Partial<ArtifactFormData>): Promise<Artifact> {
  const res = await client.put<Artifact>(`/artifacts/${id}`, data);
  return res.data;
}

/** 删除文物 */
export async function deleteArtifact(id: number): Promise<void> {
  await client.delete(`/artifacts/${id}`);
}

/** 导出文物列表为 CSV */
export async function exportArtifacts(params?: ArtifactListParams): Promise<void> {
  const res = await client.get('/artifacts/export', {
    params,
    responseType: 'blob',
  });
  // Create download link
  const blob = new Blob([res.data], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'artifacts_export.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/** 修复文物图片 */
export interface RepairImageParams {
  artifactId: number;
  maskFile: File;
  radius?: number;
  method?: 'telea' | 'ns';
}

export interface RepairImageResponse {
  success: boolean;
  artifact_id: number;
  artifact_name: string;
  repaired_image: string;  // base64 encoded PNG
  method: string;
  radius: number;
}

export async function repairImage(params: RepairImageParams): Promise<RepairImageResponse> {
  const formData = new FormData();
  formData.append('mask', params.maskFile);
  formData.append('radius', String(params.radius || 3));
  formData.append('method', params.method || 'telea');

  const res = await client.post<RepairImageResponse>(
    `/artifacts/${params.artifactId}/repair-image`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    }
  );
  return res.data;
}

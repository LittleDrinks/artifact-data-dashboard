import client from './client';

export interface OverviewStats {
  total_artifacts: number;
  total_categories: number;
  total_eras: number;
  total_locations: number;
}

export interface EraStat {
  era: string;
  count: number;
}

export interface CategoryStat {
  category: string;
  count: number;
}

export interface LocationStat {
  location: string;
  count: number;
}

export interface WordCloudItem {
  word: string;
  weight: number;
}

/** 统计概览 */
export async function getOverview(): Promise<OverviewStats> {
  const res = await client.get<OverviewStats>('/stats/overview');
  return res.data;
}

/** 按年代统计 */
export async function getStatsByEra(): Promise<EraStat[]> {
  const res = await client.get<EraStat[]>('/stats/by-era');
  return res.data;
}

/** 按类别统计 */
export async function getStatsByCategory(): Promise<CategoryStat[]> {
  const res = await client.get<CategoryStat[]>('/stats/by-category');
  return res.data;
}

/** 按地区统计 */
export async function getStatsByLocation(): Promise<LocationStat[]> {
  const res = await client.get<LocationStat[]>('/stats/by-location');
  return res.data;
}

/** 词云数据 */
export async function getWordCloud(): Promise<WordCloudItem[]> {
  const res = await client.get<WordCloudItem[]>('/stats/wordcloud');
  return res.data;
}

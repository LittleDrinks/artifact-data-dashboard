# -*- coding: utf-8 -*-
"""
中国文物数据爬虫 - 维基百科 v4
使用确认存在的分类URL，递归爬取所有子分类
"""

import requests
from bs4 import BeautifulSoup
import json
import time
import os
import re
from urllib.parse import urljoin
import random
import sys

# 设置stdout编码为UTF-8
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except:
        pass

# 配置
BASE_URL = "https://zh.wikipedia.org"
OUTPUT_DIR = "E:/shared/workplace/ADD_new/data"
DETAIL_DIR = os.path.join(OUTPUT_DIR, "artifacts_detail")
LIST_FILE = os.path.join(OUTPUT_DIR, "artifacts_list_v4.json")
ERROR_LOG = os.path.join(OUTPUT_DIR, "error_log_v4.json")

TARGET_COUNT = 3000

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}

stats = {'total': 0, 'success': 0, 'failed': 0, 'errors': []}

def random_delay(min_sec=0.3, max_sec=1.0):
    time.sleep(random.uniform(min_sec, max_sec))

def safe_request(url, max_retries=3):
    for attempt in range(max_retries):
        try:
            random_delay()
            response = requests.get(url, headers=HEADERS, timeout=30)
            response.encoding = 'utf-8'
            if response.status_code == 200:
                return response
            elif response.status_code == 404:
                return None  # 分类不存在，不重试
            else:
                print(f"  请求失败 [{response.status_code}]: {url}")
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(1)
    return None

def crawl_category_recursive(cat_url, cat_name, all_artifacts, visited_cats, depth=0, max_depth=3):
    """递归爬取分类及其子分类"""
    if depth > max_depth or cat_url in visited_cats:
        return

    visited_cats.add(cat_url)

    print(f"  [深度{depth}] 爬取分类: {cat_name}")
    response = safe_request(cat_url)
    if not response:
        return

    soup = BeautifulSoup(response.text, 'html.parser')

    # 获取分类中的页面
    pages_div = soup.find('div', {'id': 'mw-pages'})
    if pages_div:
        count = 0
        for link in pages_div.find_all('a'):
            href = link.get('href', '')
            title = link.get('title', '')

            if href.startswith('/wiki/') and ':' not in title:
                if not any(x in title for x in ['分类', 'Category', 'Template', 'Wikipedia', 'Help', 'File']):
                    artifact = {
                        'name': title,
                        'url': urljoin(BASE_URL, href),
                        'category': cat_name
                    }
                    all_artifacts.append(artifact)
                    count += 1
        if count > 0:
            print(f"    发现 {count} 个页面")

    # 获取子分类并递归爬取
    subcats_div = soup.find('div', {'id': 'mw-subcategories'})
    if subcats_div:
        for link in subcats_div.find_all('a'):
            href = link.get('href', '')
            title = link.get('title', '')

            if 'Category:' in href or '分类:' in href:
                # 提取子分类名称（去掉Category:前缀）
                subcat_name = title.replace('Category:', '').replace('分类:', '').strip()
                if not subcat_name:
                    subcat_name = cat_name  # 如果无法提取，使用父分类名称

                subcat_url = urljoin(BASE_URL, href)
                crawl_category_recursive(subcat_url, subcat_name, all_artifacts, visited_cats, depth + 1, max_depth)

def get_all_category_urls():
    """获取所有分类URL（通过递归探索）"""
    root_cats = [
        ("中国文物", "https://zh.wikipedia.org/wiki/Category:中国文物"),
        ("中国考古", "https://zh.wikipedia.org/wiki/Category:中国考古"),
    ]

    all_cats = []
    visited = set()

    for name, url in root_cats:
        print(f"探索根分类: {name}")
        response = safe_request(url)
        if not response:
            continue

        soup = BeautifulSoup(response.text, 'html.parser')
        subcats_div = soup.find('div', {'id': 'mw-subcategories'})

        if subcats_div:
            for link in subcats_div.find_all('a'):
                href = link.get('href', '')
                title = link.get('title', '')
                if 'Category:' in href:
                    cat_url = urljoin(BASE_URL, href)
                    if cat_url not in visited:
                        visited.add(cat_url)
                        all_cats.append((title.replace('Category:', ''), cat_url))

    return all_cats

def crawl_all_from_root():
    """从根分类递归爬取所有子分类"""
    all_artifacts = []
    visited_cats = set()

    # 根分类
    root_cats = [
        ("中国文物", "https://zh.wikipedia.org/wiki/Category:中国文物"),
        ("中国考古", "https://zh.wikipedia.org/wiki/Category:中国考古"),
        ("中国历史文化遗产", "https://zh.wikipedia.org/wiki/Category:中国历史文化遗产"),
        ("中国古建筑", "https://zh.wikipedia.org/wiki/Category:中国古建筑"),
        ("中国书画作品", "https://zh.wikipedia.org/wiki/Category:中国书画作品"),
    ]

    for cat_name, cat_url in root_cats:
        print(f"\n爬取根分类: {cat_name}")
        crawl_category_recursive(cat_url, cat_name, all_artifacts, visited_cats, depth=0, max_depth=4)
        print(f"  当前累计: {len(all_artifacts)} 条")

    return all_artifacts

def crawl_national_heritage():
    """爬取全国重点文物保护单位"""
    artifacts = []
    batches = [
        ("第一批", "https://zh.wikipedia.org/wiki/第一批全国重点文物保护单位"),
        ("第二批", "https://zh.wikipedia.org/wiki/第二批全国重点文物保护单位"),
        ("第三批", "https://zh.wikipedia.org/wiki/第三批全国重点文物保护单位"),
        ("第四批", "https://zh.wikipedia.org/wiki/第四批全国重点文物保护单位"),
        ("第五批", "https://zh.wikipedia.org/wiki/第五批全国重点文物保护单位"),
        ("第六批", "https://zh.wikipedia.org/wiki/第六批全国重点文物保护单位"),
        ("第七批", "https://zh.wikipedia.org/wiki/第七批全国重点文物保护单位"),
    ]

    for batch_name, url in batches:
        print(f"\n爬取: {batch_name}")
        response = safe_request(url)
        if not response:
            continue

        soup = BeautifulSoup(response.text, 'html.parser')
        content_div = soup.find('div', {'class': 'mw-parser-output'}) or soup

        tables = content_div.find_all('table', {'class': ['wikitable', 'sortable']})
        for table in tables:
            rows = table.find_all('tr')
            for row in rows[1:]:
                cells = row.find_all(['td', 'th'])
                if len(cells) >= 2:
                    name_cell = cells[0]
                    link = name_cell.find('a')
                    if link and link.get('href', '').startswith('/wiki/'):
                        href = link.get('href')
                        name = link.get_text(strip=True)
                        if not name or name in ['编辑', '删除', '更多']:
                            name = name_cell.get_text(strip=True)
                        if name and len(name) > 1 and not name.startswith('['):
                            artifacts.append({
                                'name': name,
                                'url': urljoin(BASE_URL, href),
                                'category': '全国重点文物保护单位',
                                'batch': batch_name
                            })
                            print(f"  发现: {name}")

    return artifacts

def crawl_banned_export():
    """爬取禁止出境展览文物"""
    artifacts = []

    batch_pages = [
        "https://zh.wikipedia.org/wiki/第一批禁止出境展览文物",
        "https://zh.wikipedia.org/wiki/第二批禁止出境展览文物",
        "https://zh.wikipedia.org/wiki/第三批禁止出境展览文物",
    ]

    for page_url in batch_pages:
        print(f"\n爬取: {page_url.split('/')[-1]}")
        response = safe_request(page_url)
        if not response:
            continue

        soup = BeautifulSoup(response.text, 'html.parser')
        content_div = soup.find('div', {'class': 'mw-parser-output'}) or soup

        # 从表格提取
        tables = content_div.find_all('table', {'class': ['wikitable', 'sortable']})
        for table in tables:
            rows = table.find_all('tr')
            for row in rows[1:]:
                cells = row.find_all(['td', 'th'])
                for cell in cells:
                    link = cell.find('a')
                    if link and link.get('href', '').startswith('/wiki/'):
                        href = link.get('href')
                        title = link.get('title', '') or link.get_text(strip=True)
                        if title and len(title) > 1 and not any(x in title for x in ['编辑', '查', '论', '编', 'Wikipedia']):
                            artifacts.append({
                                'name': title,
                                'url': urljoin(BASE_URL, href),
                                'category': '禁止出境展览文物'
                            })

        # 从段落提取
        if content_div:
            for p in content_div.find_all('p'):
                for link in p.find_all('a'):
                    href = link.get('href', '')
                    title = link.get('title', '') or link.get_text(strip=True)
                    if href.startswith('/wiki/') and title and len(title) > 1:
                        if not any(x in href for x in ['Category', 'Template', 'Wikipedia', 'Help']):
                            artifacts.append({
                                'name': title,
                                'url': urljoin(BASE_URL, href),
                                'category': '禁止出境展览文物'
                            })

    print(f"  禁止出境展览文物: {len(artifacts)} 条")
    return artifacts

def deduplicate(artifacts):
    seen = set()
    unique = []
    for a in artifacts:
        key = a['name']
        if key not in seen:
            seen.add(key)
            unique.append(a)
    return unique

def filter_valid(artifacts):
    """过滤非文物条目"""
    invalid_keywords = [
        '中华人民共和国', '省', '市辖区', '自治县',
        '博物馆', '文物局', '考古研究所', '大学', '学院',
        '出版社', '期刊', '杂志', '电视台', '广播',
        'Category:', 'Template:', 'Wikipedia:', 'Help:',
        '编辑', '查', '论', '编', '删除', '更多', '网站',
    ]

    valid = []
    for a in artifacts:
        name = a['name']
        if len(name) < 2:
            continue
        if any(kw in name for kw in invalid_keywords):
            continue
        if re.match(r'^\d{4}$', name) or name.isdigit():
            continue
        if name.startswith('列表') or name.endswith('列表'):
            continue
        if name.endswith('模板') or name.startswith('模板'):
            continue
        valid.append(a)

    return valid

def parse_infobox(soup):
    infobox = {}
    info_table = soup.find('table', {'class': ['infobox', 'vevent']})
    if not info_table:
        info_table = soup.find('table', {'class': 'infobox'})

    if info_table:
        rows = info_table.find_all('tr')
        for row in rows:
            th = row.find('th')
            td = row.find('td')
            if th and td:
                key = th.get_text(strip=True)
                value = td.get_text(strip=True)
                if key and value:
                    infobox[key] = value

    return infobox

def parse_artifact_detail(url, name, category):
    response = safe_request(url)
    if not response:
        return None

    soup = BeautifulSoup(response.text, 'html.parser')
    infobox = parse_infobox(soup)

    content_div = soup.find('div', {'class': 'mw-parser-output'})
    if not content_div:
        content_div = soup.find('div', {'id': 'mw-content-text'})

    summary = ""
    full_text = ""

    if content_div:
        all_p = content_div.find_all('p')
        paragraphs = []

        for p in all_p:
            parent_classes = ' '.join(p.get('class', []))
            if any(exc in parent_classes for exc in ['infobox', 'navbox', 'reflist']):
                continue

            text = p.get_text(strip=True)
            if text and not text.startswith('[') and len(text) > 5:
                paragraphs.append(text)

        if paragraphs:
            summary = paragraphs[0]
        full_text = '\n\n'.join(paragraphs)

    result = {
        'name': name,
        'url': url,
        'category': category,
        'era': infobox.get('年代', infobox.get('时代', infobox.get('时期', ''))),
        'material': infobox.get('材质', infobox.get('材料', '')),
        'location': infobox.get('出土地', infobox.get('出土', infobox.get('地点', ''))),
        'museum': infobox.get('馆藏', infobox.get('现藏', infobox.get('博物馆', ''))),
        'dimensions': infobox.get('尺寸', infobox.get('规格', '')),
        'summary': summary,
        'full_text': full_text,
        'infobox': infobox
    }

    return result

def crawl_details(all_artifacts):
    """爬取详情"""
    os.makedirs(DETAIL_DIR, exist_ok=True)

    # 检查已有高质量数据
    existing_ok = set()
    if os.path.exists(DETAIL_DIR):
        for fname in os.listdir(DETAIL_DIR):
            if not fname.endswith('.json'):
                continue
            fpath = os.path.join(DETAIL_DIR, fname)
            try:
                with open(fpath, 'r', encoding='utf-8') as f:
                    d = json.load(f)
                ft = d.get('full_text', '') or ''
                if len(ft) >= 500:
                    existing_ok.add(fname)
            except:
                pass

    print(f"\n已有高质量数据: {len(existing_ok)} 条")

    stats['total'] = len(all_artifacts)

    for i, artifact in enumerate(all_artifacts):
        name = artifact['name']
        url = artifact['url']

        safe_name = re.sub(r'[\\/:*?"<>|]', '_', name)
        detail_file_name = f"{safe_name}.json"

        if detail_file_name in existing_ok:
            stats['success'] += 1
            continue

        if i % 50 == 0:
            print(f"\n  [{i+1}/{stats['total']}] 进度...")

        try:
            detail = parse_artifact_detail(url, name, artifact.get('category', ''))

            if detail:
                detail_file = os.path.join(DETAIL_DIR, f"{safe_name}.json")
                with open(detail_file, 'w', encoding='utf-8') as f:
                    json.dump(detail, f, ensure_ascii=False, indent=2)
                stats['success'] += 1
            else:
                stats['failed'] += 1
                stats['errors'].append({'name': name, 'url': url, 'error': '请求失败'})

        except Exception as e:
            stats['failed'] += 1
            stats['errors'].append({'name': name, 'url': url, 'error': str(e)})

    if stats['errors']:
        with open(ERROR_LOG, 'w', encoding='utf-8') as f:
            json.dump(stats['errors'], f, ensure_ascii=False, indent=2)

def main():
    print("=" * 60)
    print("中国文物数据爬虫 v4 - 递归爬取所有子分类")
    print("=" * 60)

    # 阶段1：收集列表
    print("\n[阶段1] 收集文物列表...")

    all_artifacts = []

    # 禁止出境展览文物
    print("\n[1] 禁止出境展览文物...")
    banned = crawl_banned_export()
    all_artifacts.extend(banned)
    print(f"  累计: {len(all_artifacts)} 条")

    # 全国重点文物保护单位
    print("\n[2] 全国重点文物保护单位...")
    heritage = crawl_national_heritage()
    all_artifacts.extend(heritage)
    print(f"  累计: {len(all_artifacts)} 条")

    # 从根分类递归爬取
    print("\n[3] 递归爬取所有子分类...")
    category_artifacts = crawl_all_from_root()
    all_artifacts.extend(category_artifacts)
    print(f"  累计: {len(all_artifacts)} 条")

    # 去重
    print("\n[去重处理]")
    all_artifacts = deduplicate(all_artifacts)
    print(f"  去重后: {len(all_artifacts)} 条")

    # 过滤
    print("\n[过滤处理]")
    all_artifacts = filter_valid(all_artifacts)
    print(f"  过滤后: {len(all_artifacts)} 条")

    # 保存列表
    print("\n[保存列表]")
    with open(LIST_FILE, 'w', encoding='utf-8') as f:
        json.dump(all_artifacts, f, ensure_ascii=False, indent=2)
    print(f"  已保存: {LIST_FILE}")

    # 阶段2：爬取详情（如果达到目标）
    if len(all_artifacts) >= TARGET_COUNT:
        print(f"\n✓ 已达到目标 {TARGET_COUNT} 条!")
        print("\n[阶段2] 爬取详情...")
        crawl_details(all_artifacts)
    else:
        print(f"\n⚠ 未达到目标，当前 {len(all_artifacts)} 条")

    # 统计
    print("\n" + "=" * 60)
    print("爬取完成!")
    print("=" * 60)
    print(f"列表总数: {len(all_artifacts)} 条")
    print(f"详情成功: {stats['success']} 条")
    print(f"详情失败: {stats['failed']} 条")
    print(f"\n数据位置:")
    print(f"  列表: {LIST_FILE}")
    print(f"  详情: {DETAIL_DIR}")
    print("=" * 60)

if __name__ == '__main__':
    main()
# -*- coding: utf-8 -*-
"""
中国文物数据爬虫 - 维基百科 v5
补充爬取缺失的高优先级分类：兵马俑、书画、唐三彩等
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
LIST_FILE = os.path.join(OUTPUT_DIR, "artifacts_list_v5.json")
ERROR_LOG = os.path.join(OUTPUT_DIR, "error_log_v5.json")

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}

stats = {'total': 0, 'success': 0, 'failed': 0, 'skipped': 0, 'errors': [], 'by_category': {}}

def random_delay(min_sec=1.0, max_sec=2.0):
    """维基API速率限制，间隔1-2秒"""
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
                return None
            else:
                print(f"  请求失败 [{response.status_code}]: {url}")
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(2)
    return None

def load_existing_artifacts():
    """加载现有数据用于去重"""
    existing = {}
    if os.path.exists(DETAIL_DIR):
        for fname in os.listdir(DETAIL_DIR):
            if not fname.endswith('.json'):
                continue
            fpath = os.path.join(DETAIL_DIR, fname)
            try:
                with open(fpath, 'r', encoding='utf-8') as f:
                    d = json.load(f)
                name = d.get('name', '')
                url = d.get('url', '')
                if name:
                    existing[name] = True
                if url:
                    existing[url] = True
            except:
                pass
    return existing

def crawl_category_recursive(cat_url, cat_name, all_artifacts, visited_cats, depth=0, max_depth=3):
    """递归爬取分类及其子分类"""
    if depth > max_depth or cat_url in visited_cats:
        return

    visited_cats.add(cat_url)

    print(f"  [深度{depth}] 爬取分类: {cat_name}")
    response = safe_request(cat_url)
    if not response:
        print(f"    分类不存在或请求失败")
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
                subcat_name = title.replace('Category:', '').replace('分类:', '').strip()
                if not subcat_name:
                    subcat_name = cat_name
                subcat_url = urljoin(BASE_URL, href)
                crawl_category_recursive(subcat_url, subcat_name, all_artifacts, visited_cats, depth + 1, max_depth)

def crawl_target_categories():
    """爬取目标分类"""
    # 高优先级分类
    high_priority = [
        ("秦始皇陵", "https://zh.wikipedia.org/wiki/Category:秦始皇陵"),
        ("兵马俑", "https://zh.wikipedia.org/wiki/Category:兵马俑"),
        ("中国古代书画", "https://zh.wikipedia.org/wiki/Category:中国古代书画"),
        ("中国书画作品", "https://zh.wikipedia.org/wiki/Category:中国书画作品"),
        ("唐三彩", "https://zh.wikipedia.org/wiki/Category:唐三彩"),
    ]

    # 中优先级分类
    medium_priority = [
        ("中国古代科学仪器", "https://zh.wikipedia.org/wiki/Category:中国古代科学仪器"),
        ("中国金银器", "https://zh.wikipedia.org/wiki/Category:中国金银器"),
        ("中国古代漆器", "https://zh.wikipedia.org/wiki/Category:中国古代漆器"),
        ("中国石窟", "https://zh.wikipedia.org/wiki/Category:中国石窟"),
    ]

    all_categories = high_priority + medium_priority
    all_artifacts = []
    visited_cats = set()

    for cat_name, cat_url in all_categories:
        print(f"\n爬取分类: {cat_name}")
        count_before = len(all_artifacts)
        crawl_category_recursive(cat_url, cat_name, all_artifacts, visited_cats, depth=0, max_depth=3)
        count_after = len(all_artifacts)
        stats['by_category'][cat_name] = count_after - count_before
        print(f"  该分类新增: {count_after - count_before} 条")

    return all_artifacts

def deduplicate(artifacts, existing):
    """去重：与现有数据和新数据内部去重"""
    seen = set(existing.keys())
    unique = []
    for a in artifacts:
        name = a['name']
        url = a['url']
        if name not in seen and url not in seen:
            seen.add(name)
            seen.add(url)
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

def crawl_details(all_artifacts, existing):
    """爬取详情"""
    os.makedirs(DETAIL_DIR, exist_ok=True)

    stats['total'] = len(all_artifacts)

    for i, artifact in enumerate(all_artifacts):
        name = artifact['name']
        url = artifact['url']
        category = artifact.get('category', '')

        safe_name = re.sub(r'[\\/:*?"<>|]', '_', name)
        detail_file_name = f"{safe_name}.json"

        # 检查是否已存在
        if name in existing or url in existing:
            stats['skipped'] += 1
            continue

        if i % 10 == 0:
            print(f"\n  [{i+1}/{stats['total']}] 进度...")

        try:
            detail = parse_artifact_detail(url, name, category)

            if detail:
                detail_file = os.path.join(DETAIL_DIR, f"{safe_name}.json")
                with open(detail_file, 'w', encoding='utf-8') as f:
                    json.dump(detail, f, ensure_ascii=False, indent=2)
                stats['success'] += 1
                print(f"    ✓ {name}")
            else:
                stats['failed'] += 1
                stats['errors'].append({'name': name, 'url': url, 'error': '请求失败'})
                print(f"    ✗ {name} - 请求失败")

        except Exception as e:
            stats['failed'] += 1
            stats['errors'].append({'name': name, 'url': url, 'error': str(e)})
            print(f"    ✗ {name} - {str(e)}")

    if stats['errors']:
        with open(ERROR_LOG, 'w', encoding='utf-8') as f:
            json.dump(stats['errors'], f, ensure_ascii=False, indent=2)

def main():
    print("=" * 60)
    print("中国文物数据爬虫 v5 - 补充高优先级分类")
    print("=" * 60)

    # 加载现有数据
    print("\n[加载现有数据]")
    existing = load_existing_artifacts()
    print(f"  已有 {len(existing)} 条数据")

    # 阶段1：收集列表
    print("\n[阶段1] 收集文物列表...")
    all_artifacts = crawl_target_categories()
    print(f"\n收集总计: {len(all_artifacts)} 条")

    # 去重
    print("\n[去重处理]")
    all_artifacts = deduplicate(all_artifacts, existing)
    print(f"  去重后净增: {len(all_artifacts)} 条")

    # 过滤
    print("\n[过滤处理]")
    all_artifacts = filter_valid(all_artifacts)
    print(f"  过滤后: {len(all_artifacts)} 条")

    if len(all_artifacts) == 0:
        print("\n⚠ 没有新增数据，任务结束")
        return

    # 保存列表
    print("\n[保存列表]")
    with open(LIST_FILE, 'w', encoding='utf-8') as f:
        json.dump(all_artifacts, f, ensure_ascii=False, indent=2)
    print(f"  已保存: {LIST_FILE}")

    # 阶段2：爬取详情
    print("\n[阶段2] 爬取详情...")
    crawl_details(all_artifacts, existing)

    # 统计报告
    print("\n" + "=" * 60)
    print("爬取完成!")
    print("=" * 60)
    print("\n各分类爬取统计:")
    for cat_name, count in stats['by_category'].items():
        print(f"  {cat_name}: {count} 条")

    print(f"\n去重后净增列表: {len(all_artifacts)} 条")
    print(f"详情成功: {stats['success']} 条")
    print(f"详情失败: {stats['failed']} 条")
    print(f"已存在跳过: {stats['skipped']} 条")
    print(f"总计新增: {stats['success']} 条")

    print(f"\n数据位置:")
    print(f"  列表: {LIST_FILE}")
    print(f"  详情: {DETAIL_DIR}")

    if stats['errors']:
        print(f"  错误日志: {ERROR_LOG}")

    print("=" * 60)

if __name__ == '__main__':
    main()
# -*- coding: utf-8 -*-
"""
缺失文物补爬脚本 - 按名称逐个搜索爬取
针对 missing_artifacts.json 中 67 件未覆盖的一级文物
使用 MediaWiki API 搜索 + BeautifulSoup 解析
"""

import requests
from bs4 import BeautifulSoup
import json
import time
import os
import re
from urllib.parse import urljoin, quote
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
API_URL = "https://zh.wikipedia.org/w/api.php"
OUTPUT_DIR = "E:/shared/workplace/ADD_new/data"
DETAIL_DIR = os.path.join(OUTPUT_DIR, "artifacts_detail")
MISSING_FILE = os.path.join(OUTPUT_DIR, "missing_artifacts.json")
LIST_FILE = os.path.join(OUTPUT_DIR, "missing_artifacts_crawled.json")
ERROR_LOG = os.path.join(OUTPUT_DIR, "missing_error_log.json")

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}

stats = {
    'total': 0,
    'success': 0,
    'failed': 0,
    'not_found': 0,
    'skipped': 0,
    'errors': [],
    'by_category': {}
}

def random_delay(min_sec=1.0, max_sec=2.0):
    """维基API速率限制"""
    time.sleep(random.uniform(min_sec, max_sec))

def search_wiki(title):
    """使用 MediaWiki API 搜索条目"""
    params = {
        'action': 'query',
        'list': 'search',
        'srsearch': title,
        'srlimit': 5,
        'srprop': 'title|snippet',
        'format': 'json',
        'utf8': 1
    }

    try:
        response = requests.get(API_URL, params=params, headers=HEADERS, timeout=30)
        response.encoding = 'utf-8'
        data = response.json()

        if 'query' in data and 'search' in data['query']:
            results = data['query']['search']
            # 寻找精确匹配或最相似的条目
            for result in results:
                result_title = result['title']
                # 精确匹配
                if result_title == title:
                    return result_title, urljoin(BASE_URL, f'/wiki/{quote(result_title)}')
                # 包含关键词匹配
                if title in result_title or result_title in title:
                    return result_title, urljoin(BASE_URL, f'/wiki/{quote(result_title)}')

            # 如果没有精确匹配，返回第一个结果
            if results:
                first = results[0]
                return first['title'], urljoin(BASE_URL, f'/wiki/{quote(first["title"])}')

        return None, None
    except Exception as e:
        print(f"    API搜索失败: {e}")
        return None, None

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

def parse_artifact_detail(url, name, category, era):
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

    # 从 infobox 提取字段，如果没有则使用传入的 era
    era_val = infobox.get('年代', infobox.get('时代', infobox.get('时期', era)))

    result = {
        'name': name,
        'url': url,
        'category': category,
        'era': era_val,
        'material': infobox.get('材质', infobox.get('材料', '')),
        'location': infobox.get('出土地', infobox.get('出土', infobox.get('地点', ''))),
        'museum': infobox.get('馆藏', infobox.get('现藏', infobox.get('博物馆', ''))),
        'dimensions': infobox.get('尺寸', infobox.get('规格', '')),
        'summary': summary,
        'full_text': full_text,
        'infobox': infobox
    }

    return result

def crawl_missing_artifacts():
    """爬取缺失文物列表"""
    # 加载缺失清单
    with open(MISSING_FILE, 'r', encoding='utf-8') as f:
        missing_list = json.load(f)

    # 加载现有数据去重
    existing = load_existing_artifacts()
    print(f"已有数据: {len(existing)} 条")

    stats['total'] = len(missing_list)
    crawled = []

    for i, artifact in enumerate(missing_list):
        name = artifact['name']
        category = artifact.get('category', '')
        era = artifact.get('era', '')
        batch = artifact.get('batch', '')

        print(f"\n[{i+1}/{stats['total']}] {name} ({category})")

        # 检查是否已存在
        if name in existing:
            stats['skipped'] += 1
            print(f"  已存在，跳过")
            continue

        # 搜索维基百科
        found_title, found_url = search_wiki(name)

        if not found_url:
            stats['not_found'] += 1
            stats['errors'].append({
                'name': name,
                'category': category,
                'era': era,
                'batch': batch,
                'error': '维基百科未找到条目'
            })
            print(f"  维基百科未找到")
            continue

        print(f"  找到条目: {found_title}")

        # 爬取详情
        try:
            detail = parse_artifact_detail(found_url, name, category, era)

            if detail and detail['full_text']:
                safe_name = re.sub(r'[\\/:*?"<>|]', '_', name)
                detail_file = os.path.join(DETAIL_DIR, f"{safe_name}.json")

                with open(detail_file, 'w', encoding='utf-8') as f:
                    json.dump(detail, f, ensure_ascii=False, indent=2)

                stats['success'] += 1
                crawled.append({
                    'name': name,
                    'url': found_url,
                    'category': category,
                    'era': era,
                    'batch': batch,
                    'wiki_title': found_title
                })

                # 更新分类统计
                if category not in stats['by_category']:
                    stats['by_category'][category] = 0
                stats['by_category'][category] += 1

                print(f"  ✓ 成功爬取")
            else:
                stats['failed'] += 1
                stats['errors'].append({
                    'name': name,
                    'url': found_url,
                    'category': category,
                    'error': '详情内容为空或请求失败'
                })
                print(f"  ✗ 详情爬取失败")

        except Exception as e:
            stats['failed'] += 1
            stats['errors'].append({
                'name': name,
                'url': found_url,
                'category': category,
                'error': str(e)
            })
            print(f"  ✗ 异常: {e}")

    # 保存爬取列表
    with open(LIST_FILE, 'w', encoding='utf-8') as f:
        json.dump(crawled, f, ensure_ascii=False, indent=2)

    # 保存错误日志
    if stats['errors']:
        with open(ERROR_LOG, 'w', encoding='utf-8') as f:
            json.dump(stats['errors'], f, ensure_ascii=False, indent=2)

    return crawled

def main():
    print("=" * 60)
    print("缺失文物补爬脚本 - 按名称搜索")
    print("=" * 60)

    print("\n[开始爬取]")
    crawled = crawl_missing_artifacts()

    # 统计报告
    print("\n" + "=" * 60)
    print("爬取完成!")
    print("=" * 60)

    print(f"\n总计处理: {stats['total']} 件")
    print(f"成功爬取: {stats['success']} 件")
    print(f"未找到条目: {stats['not_found']} 件")
    print(f"爬取失败: {stats['failed']} 件")
    print(f"已存在跳过: {stats['skipped']} 件")

    print("\n各分类成功爬取统计:")
    for cat, count in sorted(stats['by_category'].items(), key=lambda x: -x[1]):
        print(f"  {cat}: {count} 件")

    print(f"\n净增: {stats['success']} 件")

    print(f"\n数据位置:")
    print(f"  爬取列表: {LIST_FILE}")
    print(f"  详情目录: {DETAIL_DIR}")

    if stats['errors']:
        print(f"  错误日志: {ERROR_LOG}")

    print("=" * 60)

if __name__ == '__main__':
    main()
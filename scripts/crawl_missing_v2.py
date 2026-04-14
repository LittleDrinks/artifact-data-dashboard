# -*- coding: utf-8 -*-
"""
缺失文物精准爬取脚本 v2
使用 MediaWiki API 直接查询条目名，支持名称变体和模糊搜索
"""

import requests
import json
import time
import os
import re
from urllib.parse import quote, unquote
import random
import sys

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except:
        pass

API_URL = "https://zh.wikipedia.org/w/api.php"
BASE_URL = "https://zh.wikipedia.org/wiki/"
OUTPUT_DIR = "E:/shared/workplace/ADD_new/data"
DETAIL_DIR = os.path.join(OUTPUT_DIR, "artifacts_detail")
MISSING_FILE = os.path.join(OUTPUT_DIR, "missing_artifacts.json")
RESULT_FILE = os.path.join(OUTPUT_DIR, "missing_crawl_result.json")
FAILED_FILE = os.path.join(OUTPUT_DIR, "missing_still_failed.json")

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
}

stats = {'total': 0, 'success': 0, 'not_found': 0, 'errors': [], 'found_variants': []}

def delay():
    time.sleep(random.uniform(1.0, 2.0))

def query_page(title):
    """精确查询条目是否存在"""
    params = {
        'action': 'query',
        'titles': title,
        'format': 'json',
        'utf8': 1,
        'redirects': 1
    }
    try:
        delay()
        r = requests.get(API_URL, params=params, headers=HEADERS, timeout=30)
        r.encoding = 'utf-8'
        data = r.json()

        if 'query' and 'pages' in data:
            pages = data['query']['pages']
            for pageid, page in pages.items():
                if pageid != '-1' and 'missing' not in page:
                    # 找到了
                    return {
                        'pageid': pageid,
                        'title': page['title'],
                        'fullurl': page.get('fullurl', BASE_URL + quote(page['title']))
                    }
        return None
    except Exception as e:
        print(f"  查询异常: {e}")
        return None

def opensearch(title):
    """模糊搜索"""
    params = {
        'action': 'opensearch',
        'search': title,
        'limit': 10,
        'format': 'json',
        'utf8': 1
    }
    try:
        delay()
        r = requests.get(API_URL, params=params, headers=HEADERS, timeout=30)
        r.encoding = 'utf-8'
        data = r.json()

        if len(data) >= 4 and data[1]:
            # data[1] 是标题列表, data[3] 是 URL 列表
            results = []
            for i, t in enumerate(data[1]):
                url = data[3][i] if len(data[3]) > i else BASE_URL + quote(t)
                results.append({'title': t, 'url': url})
            return results
        return []
    except Exception as e:
        print(f"  搜索异常: {e}")
        return []

def get_page_content(pageid, title):
    """获取页面内容"""
    params = {
        'action': 'query',
        'pageids': pageid,
        'prop': 'extracts|revisions|categories',
        'exintro': 0,
        'explaintext': 1,
        'rvprop': 'content',
        'cllimit': 50,
        'format': 'json',
        'utf8': 1
    }
    try:
        delay()
        r = requests.get(API_URL, params=params, headers=HEADERS, timeout=30)
        r.encoding = 'utf-8'
        data = r.json()

        if 'query' and 'pages' in data:
            page = data['query']['pages'].get(str(pageid))
            if page:
                extract = page.get('extract', '')
                revisions = page.get('revisions', [])
                raw_content = revisions[0].get('*', '') if revisions else ''
                categories = [c['title'].replace('Category:', '').replace('分类:', '')
                             for c in page.get('categories', [])]

                # 分离摘要和全文
                summary = extract[:1000] if extract else ''

                return {
                    'summary': summary,
                    'full_text': extract,
                    'raw_wikitext': raw_content,
                    'categories': categories
                }
        return None
    except Exception as e:
        print(f"  内容获取异常: {e}")
        return None

def parse_infobox_from_wikitext(wikitext):
    """从原始 wikitext 解析 infobox"""
    infobox = {}
    if not wikitext:
        return infobox

    # 匹配 {{infobox ... }} 或类似模板
    match = re.search(r'\{\{[^{]*?(信息框|infobox|文物|藏品|艺术品)[^}]*\}\}', wikitext, re.I | re.S)
    if not match:
        # 尝试匹配任意模板
        match = re.search(r'\{\{[^{]*?\|[^}]*\}\}', wikitext[:5000])

    if match:
        template = match.group(0)
        # 提取键值对
        pairs = re.findall(r'\|\s*([^|=\n]+)\s*=\s*([^|}\n]+)', template)
        for key, val in pairs:
            key = key.strip()
            val = val.strip()
            if key and val and len(val) < 200:
                infobox[key] = val

    return infobox

def get_name_variants(name):
    """生成名称变体列表"""
    variants = [name]

    # 繁简转换
    simp_to_trad = {
        '钟': '鐘', '苏': '穌', '画': '畫', '图': '圖',
        '卷': '卷', '器': '器', '纹': '紋', '彩': '彩',
        '盏': '盞', '瓶': '瓶', '罐': '罐', '尊': '尊',
        '俑': '俑', '锦': '锦', '帛': '帛'
    }

    # 常见名称变体
    variant_rules = [
        # 晋侯稣钟
        ('晋侯稣钟', ['晉侯穌編鐘', '晉侯穌钟', '晋侯苏钟', '晋侯稣编钟']),
        # 冯承素摹兰亭序
        ('冯承素摹王羲之《兰亭序》卷', ['兰亭序', '蘭亭序', '冯承素摹兰亭序', '冯承素兰亭序']),
        # 马王堆帛画
        ('马王堆一号墓T型帛画', ['马王堆帛画', 'T形帛画', 'T型帛画', '馬王堆帛畫', '馬王堆漢墓帛畫']),
        # 彩陶
        ('仰韶文化彩陶人面鱼纹盆', ['人面鱼纹彩陶盆', '人面鱼纹盆', '彩陶人面鱼纹盆']),
        ('马家窑文化彩陶舞蹈纹盆', ['彩陶舞蹈纹盆', '舞蹈纹彩陶盆', '马家窑彩陶舞蹈盆']),
        ('龙山文化彩绘蟠龙纹陶盘', ['蟠龙纹陶盘', '彩绘蟠龙纹陶盘']),
        # 简化名称（去掉"文化"等）
        None,  # 稍后处理通用规则
    ]

    for rule in variant_rules:
        if rule and name == rule[0]:
            variants.extend(rule[1])

    # 通用简化规则
    # 去掉"文化"前缀
    if '文化' in name:
        simplified = re.sub(r'[^文]*文化', '', name)
        if simplified and simplified != name:
            variants.append(simplified)

    # 去掉"墓"相关词
    if '墓' in name:
        simplified = re.sub(r'[^墓]*墓[^出]*出土', '', name)
        simplified = re.sub(r'一号墓|二号墓', '', name)
        if simplified and simplified != name:
            variants.append(simplified.strip())

    # 去掉书名号
    if '《' in name:
        simplified = re.sub(r'《[^》]*》', '', name)
        simplified = re.sub(r'卷|摹|写本|刻本', '', simplified)
        if simplified and len(simplified) > 2:
            variants.append(simplified.strip())

    # 尝试繁体版本
    trad_name = name
    for s, t in simp_to_trad.items():
        trad_name = trad_name.replace(s, t)
    if trad_name != name:
        variants.append(trad_name)

    # 去重
    return list(set(variants))

def load_existing():
    """加载已有数据"""
    existing = set()
    if os.path.exists(DETAIL_DIR):
        for f in os.listdir(DETAIL_DIR):
            if f.endswith('.json'):
                try:
                    with open(os.path.join(DETAIL_DIR, f), 'r', encoding='utf-8') as fp:
                        d = json.load(fp)
                    existing.add(d.get('name', ''))
                except:
                    pass
    return existing

def crawl_artifact(artifact, existing):
    """爬取单个文物"""
    name = artifact['name']
    category = artifact.get('category', '')
    era = artifact.get('era', '')

    # 检查是否已存在
    if name in existing:
        return 'skipped', None

    # 获取名称变体
    variants = get_name_variants(name)
    print(f"  尝试变体: {variants[:5]}...")

    # 精确查询每个变体
    for variant in variants:
        result = query_page(variant)
        if result:
            print(f"  ✓ 找到: {result['title']} (用 '{variant}')")

            # 获取内容
            content = get_page_content(result['pageid'], result['title'])
            if content and content['full_text']:
                # 解析 infobox
                infobox = parse_infobox_from_wikitext(content.get('raw_wikitext', ''))

                detail = {
                    'name': name,
                    'url': result['fullurl'],
                    'category': category,
                    'era': infobox.get('年代', infobox.get('时代', era)),
                    'material': infobox.get('材质', ''),
                    'location': infobox.get('出土地', infobox.get('出土', '')),
                    'museum': infobox.get('馆藏', infobox.get('现藏', '')),
                    'dimensions': infobox.get('尺寸', ''),
                    'summary': content['summary'],
                    'full_text': content['full_text'],
                    'infobox': infobox,
                    'wiki_title': result['title'],
                    'search_variant': variant
                }

                # 保存
                safe_name = re.sub(r'[\\/:*?"<>|]', '_', name)
                fpath = os.path.join(DETAIL_DIR, f"{safe_name}.json")
                with open(fpath, 'w', encoding='utf-8') as f:
                    json.dump(detail, f, ensure_ascii=False, indent=2)

                stats['found_variants'].append({
                    'name': name,
                    'variant': variant,
                    'wiki_title': result['title']
                })

                return 'success', result['title']

    # 精确查询失败，尝试模糊搜索
    print(f"  精确匹配失败，尝试模糊搜索...")
    search_results = opensearch(name)

    for sr in search_results:
        # 检查搜索结果是否相关
        sr_title = sr['title']
        if name in sr_title or any(v in sr_title for v in variants[:3]):
            # 尝试获取这个页面
            result = query_page(sr_title)
            if result:
                print(f"  ✓ 模糊搜索找到: {result['title']}")
                content = get_page_content(result['pageid'], result['title'])
                if content and content['full_text']:
                    infobox = parse_infobox_from_wikitext(content.get('raw_wikitext', ''))

                    detail = {
                        'name': name,
                        'url': result['fullurl'],
                        'category': category,
                        'era': infobox.get('年代', infobox.get('时代', era)),
                        'material': infobox.get('材质', ''),
                        'location': infobox.get('出土地', infobox.get('出土', '')),
                        'museum': infobox.get('馆藏', infobox.get('现藏', '')),
                        'dimensions': infobox.get('尺寸', ''),
                        'summary': content['summary'],
                        'full_text': content['full_text'],
                        'infobox': infobox,
                        'wiki_title': result['title'],
                        'search_method': 'opensearch'
                    }

                    safe_name = re.sub(r'[\\/:*?"<>|]', '_', name)
                    fpath = os.path.join(DETAIL_DIR, f"{safe_name}.json")
                    with open(fpath, 'w', encoding='utf-8') as f:
                        json.dump(detail, f, ensure_ascii=False, indent=2)

                    return 'success', result['title']

    # 完全找不到
    return 'not_found', None

def main():
    print("=" * 60)
    print("缺失文物精准爬取脚本 v2")
    print("=" * 60)

    # 加载缺失列表
    with open(MISSING_FILE, 'r', encoding='utf-8') as f:
        missing = json.load(f)

    existing = load_existing()
    print(f"已有数据: {len(existing)} 条")
    print(f"待爬取: {len(missing)} 条")

    stats['total'] = len(missing)
    results = []
    still_failed = []

    for i, art in enumerate(missing):
        print(f"\n[{i+1}/{stats['total']}] {art['name']} ({art['category']})")

        status, wiki_title = crawl_artifact(art, existing)

        if status == 'success':
            stats['success'] += 1
            results.append({'name': art['name'], 'wiki_title': wiki_title, 'status': 'success'})
        elif status == 'skipped':
            print(f"  已存在，跳过")
        else:
            stats['not_found'] += 1
            still_failed.append(art)
            stats['errors'].append({'name': art['name'], 'category': art['category'], 'era': art['era']})
            print(f"  ✗ 未找到")

    # 保存结果
    with open(RESULT_FILE, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    with open(FAILED_FILE, 'w', encoding='utf-8') as f:
        json.dump(still_failed, f, ensure_ascii=False, indent=2)

    # 报告
    print("\n" + "=" * 60)
    print("爬取完成!")
    print("=" * 60)
    print(f"\n总计: {stats['total']} 件")
    print(f"成功: {stats['success']} 件 ({stats['success']*100//stats['total']}%)")
    print(f"未找到: {stats['not_found']} 件")

    print("\n通过名称变体找到的:")
    for v in stats['found_variants']:
        print(f"  '{v['name']}' → 用 '{v['variant']}' 找到 '{v['wiki_title']}'")

    print(f"\n仍未找到的文物 ({len(still_failed)} 件):")
    for art in still_failed:
        print(f"  - {art['name']} ({art['category']})")

    print(f"\n数据位置:")
    print(f"  详情: {DETAIL_DIR}")
    print(f"  结果: {RESULT_FILE}")
    print(f"  失败列表: {FAILED_FILE}")
    print("=" * 60)

if __name__ == '__main__':
    main()
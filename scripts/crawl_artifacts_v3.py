# -*- coding: utf-8 -*-
"""
中国文物数据爬虫 - 维基百科 v3
分阶段爬取：先收集列表达到3000+，再批量爬详情
"""

import requests
from bs4 import BeautifulSoup
import json
import time
import os
import re
from urllib.parse import urljoin, unquote, quote
import random
import sys

# 设置stdout编码为UTF-8，避免Windows GBK编码错误
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
LIST_FILE = os.path.join(OUTPUT_DIR, "artifacts_list_v3.json")
ERROR_LOG = os.path.join(OUTPUT_DIR, "error_log_v3.json")

# 目标条目数
TARGET_COUNT = 3000

# 请求头
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Connection': 'keep-alive',
}

# 统计
stats = {
    'total': 0,
    'success': 0,
    'failed': 0,
    'errors': []
}

def safe_print(text):
    """安全打印，过滤无法显示的Unicode字符"""
    try:
        cleaned = ''.join(c for c in text if c.isprintable() or c in '\n\t')
        print(cleaned)
    except:
        print(text.encode('utf-8', errors='replace').decode('utf-8'))

def clean_text(text):
    """清理文本中的特殊字符"""
    return ''.join(c for c in text if c.isprintable() or c in '\n\t')

def random_delay(min_sec=0.5, max_sec=1.5):
    """随机延迟，避免被封"""
    time.sleep(random.uniform(min_sec, max_sec))

def safe_request(url, max_retries=3):
    """安全的HTTP请求，带重试机制"""
    for attempt in range(max_retries):
        try:
            random_delay()
            response = requests.get(url, headers=HEADERS, timeout=30)
            response.encoding = 'utf-8'
            if response.status_code == 200:
                return response
            else:
                print(f"  请求失败 [{response.status_code}]: {url}")
        except Exception as e:
            print(f"  请求异常 (尝试 {attempt+1}/{max_retries}): {str(e)}")
            if attempt < max_retries - 1:
                time.sleep(2)
    return None

def parse_infobox(soup):
    """解析维基百科infobox"""
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
    """解析文物详细页面"""
    response = safe_request(url)
    if not response:
        return None

    soup = BeautifulSoup(response.text, 'html.parser')

    # 解析infobox
    infobox = parse_infobox(soup)

    # 提取正文
    content_div = soup.find('div', {'class': 'mw-parser-output'})
    if not content_div:
        content_div = soup.find('div', {'id': 'mw-content-text'})

    summary = ""
    full_text = ""

    if content_div:
        exclude_classes = [
            'infobox', 'navbox', 'navbox-styles', 'reflist', 'references',
            'catlinks', 'mw-navigation', 'sistersitebox', 'side-box',
            'metadata', 'noprint', 'mw-empty-elt', 'authority-control',
            'plainlinks', 'mw-heading'
        ]

        all_p = content_div.find_all('p')

        paragraphs = []
        for p in all_p:
            parent_classes = ' '.join(p.get('class', []))
            if any(exc in parent_classes for exc in exclude_classes):
                continue

            for parent in p.parents:
                if parent == content_div:
                    break
                parent_cls = ' '.join(parent.get('class', []))
                parent_id = parent.get('id', '')
                if any(exc in parent_cls for exc in ['infobox', 'navbox', 'reflist', 'references', 'catlinks']):
                    p = None
                    break
                if parent_id in ['catlinks', 'mw-navigation']:
                    p = None
                    break
            if p is None:
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

def crawl_category_fast(category_url, category_name, max_depth=2, current_depth=0, visited_cats=None):
    """快速爬取分类页面（只收集条目链接，不爬详情）"""
    artifacts = []

    if visited_cats is None:
        visited_cats = set()

    if current_depth >= max_depth:
        return artifacts

    # 防止重复访问同一分类
    if category_url in visited_cats:
        return artifacts
    visited_cats.add(category_url)

    print(f"\n爬取分类: {category_name} (深度: {current_depth})")
    response = safe_request(category_url)
    if not response:
        return artifacts

    soup = BeautifulSoup(response.text, 'html.parser')

    # 获取分类中的页面
    pages_div = soup.find('div', {'id': 'mw-pages'})
    if pages_div:
        for link in pages_div.find_all('a'):
            href = link.get('href', '')
            title = link.get('title', '')

            if href.startswith('/wiki/') and ':' not in title:
                if not any(x in title for x in ['分类:', 'Category:', 'Template:', 'Wikipedia:', 'Help:', 'File:']):
                    artifact = {
                        'name': title,
                        'url': urljoin(BASE_URL, href),
                        'category': category_name
                    }
                    artifacts.append(artifact)
                    print(f"  发现: {title}")

    # 获取子分类
    subcats_div = soup.find('div', {'id': 'mw-subcategories'})
    if subcats_div:
        for link in subcats_div.find_all('a'):
            href = link.get('href', '')
            title = link.get('title', '')

            if 'Category:' in href or '分类:' in href:
                subcat_url = urljoin(BASE_URL, href)
                sub_artifacts = crawl_category_fast(subcat_url, category_name, max_depth, current_depth + 1, visited_cats)
                artifacts.extend(sub_artifacts)

    return artifacts

def crawl_all_categories():
    """爬取所有分类，大幅扩展"""
    # 大幅扩展的分类列表
    category_urls = [
        # 原有分类
        ("中国青铜器", "https://zh.wikipedia.org/wiki/Category:中国青铜器"),
        ("中国古代礼器", "https://zh.wikipedia.org/wiki/Category:中国古代礼器"),
        ("中国文物", "https://zh.wikipedia.org/wiki/Category:中国文物"),
        ("三星堆遗址", "https://zh.wikipedia.org/wiki/Category:三星堆遗址"),
        ("商代文物", "https://zh.wikipedia.org/wiki/Category:商代文物"),
        ("西周文物", "https://zh.wikipedia.org/wiki/Category:西周文物"),
        ("东周文物", "https://zh.wikipedia.org/wiki/Category:东周文物"),
        ("春秋时期文物", "https://zh.wikipedia.org/wiki/Category:春秋时期文物"),
        ("战国时期文物", "https://zh.wikipedia.org/wiki/Category:战国时期文物"),
        ("中国玉器", "https://zh.wikipedia.org/wiki/Category:中国玉器"),
        ("中国陶瓷", "https://zh.wikipedia.org/wiki/Category:中国陶瓷"),
        ("中国古代货币", "https://zh.wikipedia.org/wiki/Category:中国古代货币"),
        ("中国出土文物", "https://zh.wikipedia.org/wiki/Category:中国出土文物"),

        # 新增：按材质分类
        ("中国金银器", "https://zh.wikipedia.org/wiki/Category:中国金银器"),
        ("中国古代漆器", "https://zh.wikipedia.org/wiki/Category:中国古代漆器"),
        ("中国石刻", "https://zh.wikipedia.org/wiki/Category:中国石刻"),
        ("中国印章", "https://zh.wikipedia.org/wiki/Category:中国印章"),

        # 新增：按朝代分类
        ("汉朝文物", "https://zh.wikipedia.org/wiki/Category:汉朝文物"),
        ("唐朝文物", "https://zh.wikipedia.org/wiki/Category:唐朝文物"),
        ("宋朝文物", "https://zh.wikipedia.org/wiki/Category:宋朝文物"),
        ("明朝文物", "https://zh.wikipedia.org/wiki/Category:明朝文物"),
        ("清朝文物", "https://zh.wikipedia.org/wiki/Category:清朝文物"),
        ("秦朝文物", "https://zh.wikipedia.org/wiki/Category:秦朝文物"),
        ("晋朝文物", "https://zh.wikipedia.org/wiki/Category:晋朝文物"),
        ("隋朝文物", "https://zh.wikipedia.org/wiki/Category:隋朝文物"),
        ("五代十国文物", "https://zh.wikipedia.org/wiki/Category:五代十国文物"),
        ("元朝文物", "https://zh.wikipedia.org/wiki/Category:元朝文物"),

        # 新增：按类型分类
        ("中国书画", "https://zh.wikipedia.org/wiki/Category:中国书画"),
        ("中国壁画", "https://zh.wikipedia.org/wiki/Category:中国壁画"),
        ("中国简牍", "https://zh.wikipedia.org/wiki/Category:中国简牍"),
        ("中国古籍", "https://zh.wikipedia.org/wiki/Category:中国古籍"),
        ("中国佛像", "https://zh.wikipedia.org/wiki/Category:中国佛像"),
        ("中国古代武器", "https://zh.wikipedia.org/wiki/Category:中国古代武器"),
        ("中国古代建筑", "https://zh.wikipedia.org/wiki/Category:中国古代建筑"),

        # 新增：考古遗址分类
        ("中国考古遗址", "https://zh.wikipedia.org/wiki/Category:中国考古遗址"),
        ("中国古墓葬", "https://zh.wikipedia.org/wiki/Category:中国古墓葬"),
        ("中国古代城市", "https://zh.wikipedia.org/wiki/Category:中国古代城市"),

        # 新增：博物馆藏品相关
        ("故宫博物院藏品", "https://zh.wikipedia.org/wiki/Category:故宫博物院藏品"),
        ("中国国家博物馆藏品", "https://zh.wikipedia.org/wiki/Category:中国国家博物馆藏品"),

        # 新增：其他相关分类
        ("中国瓷器", "https://zh.wikipedia.org/wiki/Category:中国瓷器"),
        ("中国古代纺织品", "https://zh.wikipedia.org/wiki/Category:中国古代纺织品"),
        ("中国甲骨文", "https://zh.wikipedia.org/wiki/Category:中国甲骨文"),
        ("中国古代雕塑", "https://zh.wikipedia.org/wiki/Category:中国古代雕塑"),
        ("中国古代乐器", "https://zh.wikipedia.org/wiki/Category:中国古代乐器"),

        # 新增：地区分类
        ("河南出土文物", "https://zh.wikipedia.org/wiki/Category:河南出土文物"),
        ("陕西出土文物", "https://zh.wikipedia.org/wiki/Category:陕西出土文物"),
        ("湖南出土文物", "https://zh.wikipedia.org/wiki/Category:湖南出土文物"),
        ("四川出土文物", "https://zh.wikipedia.org/wiki/Category:四川出土文物"),
        ("山东出土文物", "https://zh.wikipedia.org/wiki/Category:山东出土文物"),

        # 新增：更多材质/工艺分类
        ("中国古代铁器", "https://zh.wikipedia.org/wiki/Category:中国古代铁器"),
        ("中国古代玻璃器", "https://zh.wikipedia.org/wiki/Category:中国古代玻璃器"),
        ("中国古代象牙制品", "https://zh.wikipedia.org/wiki/Category:中国古代象牙制品"),

        # 新增：特殊文物类型
        ("中国古代印章", "https://zh.wikipedia.org/wiki/Category:中国古代印章"),
        ("中国古代钱币", "https://zh.wikipedia.org/wiki/Category:中国古代钱币"),
        ("中国古代兵器", "https://zh.wikipedia.org/wiki/Category:中国古代兵器"),
        ("中国古代玉雕", "https://zh.wikipedia.org/wiki/Category:中国古代玉雕"),
    ]

    all_artifacts = []
    visited_cats = set()

    for cat_name, cat_url in category_urls:
        try:
            artifacts = crawl_category_fast(cat_url, cat_name, max_depth=2, visited_cats=visited_cats)
            all_artifacts.extend(artifacts)
            print(f"  当前累计: {len(all_artifacts)} 条")
        except Exception as e:
            print(f"  分类 {cat_name} 爬取失败: {e}")

    return all_artifacts

def crawl_national_heritage_list():
    """爬取全国重点文物保护单位列表"""
    artifacts = []

    batch_urls = [
        ("第一批", "https://zh.wikipedia.org/wiki/第一批全国重点文物保护单位"),
        ("第二批", "https://zh.wikipedia.org/wiki/第二批全国重点文物保护单位"),
        ("第三批", "https://zh.wikipedia.org/wiki/第三批全国重点文物保护单位"),
        ("第四批", "https://zh.wikipedia.org/wiki/第四批全国重点文物保护单位"),
        ("第五批", "https://zh.wikipedia.org/wiki/第五批全国重点文物保护单位"),
        ("第六批", "https://zh.wikipedia.org/wiki/第六批全国重点文物保护单位"),
        ("第七批", "https://zh.wikipedia.org/wiki/第七批全国重点文物保护单位"),
        ("第八批", "https://zh.wikipedia.org/wiki/第八批全国重点文物保护单位"),
    ]

    for batch_name, url in batch_urls:
        print(f"\n正在爬取 {batch_name}...")
        response = safe_request(url)
        if not response:
            continue

        soup = BeautifulSoup(response.text, 'html.parser')
        content_div = soup.find('div', {'class': 'mw-parser-output'})
        if not content_div:
            content_div = soup

        tables = content_div.find_all('table', {'class': ['wikitable', 'sortable']})

        for table in tables:
            rows = table.find_all('tr')
            for row in rows[1:]:
                cells = row.find_all(['td', 'th'])
                if len(cells) >= 2:
                    name_cell = cells[0]
                    link = name_cell.find('a')

                    if link and link.get('href'):
                        href = link.get('href')
                        if href.startswith('/wiki/'):
                            name = link.get_text(strip=True)
                            if not name or name in ['编辑', '删除', '更多']:
                                name = name_cell.get_text(strip=True)

                            era = cells[1].get_text(strip=True) if len(cells) > 1 else ''
                            location = cells[2].get_text(strip=True) if len(cells) > 2 else ''

                            artifact = {
                                'name': name,
                                'url': urljoin(BASE_URL, href),
                                'category': '全国重点文物保护单位',
                                'batch': batch_name,
                                'era': era,
                                'location': location
                            }

                            if name and len(name) > 1 and not name.startswith('['):
                                artifacts.append(artifact)
                                print(f"  发现: {name} ({batch_name})")

    return artifacts

def crawl_banned_export_list():
    """爬取禁止出境展览文物列表"""
    artifacts = []

    ref_page_url = "https://zh.wikipedia.org/wiki/四羊方尊"
    print(f"\n正在爬取禁止出境展览文物列表...")
    response = safe_request(ref_page_url)
    if response:
        soup = BeautifulSoup(response.text, 'html.parser')
        tables = soup.find_all('table')
        for table in tables:
            table_text = table.get_text()
            if '禁止出境展览文物' in table_text:
                links = table.find_all('a')
                for link in links:
                    href = link.get('href', '')
                    title = link.get('title', '') or link.get_text(strip=True)
                    if (href.startswith('/wiki/') and
                        title and
                        not any(x in title for x in ['编辑', '查', '论', '编', 'Wikipedia', 'Template', '分类', 'Category']) and
                        len(title) > 1):
                        artifact = {
                            'name': title,
                            'url': urljoin(BASE_URL, href),
                            'category': '禁止出境展览文物'
                        }
                        artifacts.append(artifact)
                        print(f"  发现国宝: {title}")

    batch_pages = [
        "https://zh.wikipedia.org/wiki/第一批禁止出境展览文物",
        "https://zh.wikipedia.org/wiki/第二批禁止出境展览文物",
        "https://zh.wikipedia.org/wiki/第三批禁止出境展览文物",
    ]

    for page_url in batch_pages:
        print(f"\n爬取列表页: {page_url.split('/')[-1]}")
        response = safe_request(page_url)
        if not response:
            continue

        soup = BeautifulSoup(response.text, 'html.parser')
        content_div = soup.find('div', {'class': 'mw-parser-output'}) or soup

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
                        if (title and
                            not any(x in title for x in ['编辑', '查', '论', '编', 'Wikipedia']) and
                            len(title) > 1):
                            artifact = {
                                'name': title,
                                'url': urljoin(BASE_URL, href),
                                'category': '禁止出境展览文物'
                            }
                            artifacts.append(artifact)
                            print(f"  发现国宝: {title}")

    for page_url in batch_pages:
        response = safe_request(page_url)
        if not response:
            continue
        soup = BeautifulSoup(response.text, 'html.parser')
        content_div = soup.find('div', {'class': 'mw-parser-output'})
        if content_div:
            for p in content_div.find_all('p'):
                for link in p.find_all('a'):
                    href = link.get('href', '')
                    title = link.get('title', '') or link.get_text(strip=True)
                    if (href.startswith('/wiki/') and
                        title and
                        not any(x in href for x in ['Category', 'Template', 'Wikipedia', 'Help', 'Special']) and
                        not any(x in title for x in ['编辑', '查', '论', '编']) and
                        len(title) > 1):
                        artifact = {
                            'name': title,
                            'url': urljoin(BASE_URL, href),
                            'category': '禁止出境展览文物'
                        }
                        artifacts.append(artifact)

    return artifacts

def deduplicate_artifacts(artifacts):
    """去重"""
    seen = set()
    unique = []
    for a in artifacts:
        key = a['name']
        if key not in seen:
            seen.add(key)
            unique.append(a)
    return unique

def filter_valid_artifacts(artifacts):
    """过滤掉非文物条目（如地名、机构名等）"""
    invalid_keywords = [
        '中华人民共和国', '省', '市', '县', '区', '镇', '村',
        '博物馆', '文物局', '考古队', '研究所', '大学', '学院',
        '出版社', '期刊', '杂志', '报纸', '电视台',
        'Category:', 'Template:', 'Wikipedia:', 'Help:',
        '编辑', '查', '论', '编', '删除', '更多',
    ]

    valid = []
    for a in artifacts:
        name = a['name']
        # 过滤太短的名称
        if len(name) < 2:
            continue
        # 过滤包含无效关键词的
        if any(kw in name for kw in invalid_keywords):
            continue
        # 过滤年份
        if re.match(r'^\d{4}$', name):
            continue
        # 过滤纯数字
        if name.isdigit():
            continue
        valid.append(a)

    return valid

def phase1_collect_list():
    """阶段1：收集文物列表"""
    print("=" * 60)
    print("阶段1: 收集文物列表（目标3000+条）")
    print("=" * 60)

    all_artifacts = []

    # 1. 禁止出境展览文物
    print("\n[1] 爬取禁止出境展览文物列表...")
    banned = crawl_banned_export_list()
    all_artifacts.extend(banned)
    print(f"  找到 {len(banned)} 条")

    # 2. 全国重点文物保护单位
    print("\n[2] 爬取全国重点文物保护单位列表...")
    heritage = crawl_national_heritage_list()
    all_artifacts.extend(heritage)
    print(f"  找到 {len(heritage)} 条")

    # 3. 扩展的分类
    print("\n[3] 爬取扩展分类...")
    category_artifacts = crawl_all_categories()
    all_artifacts.extend(category_artifacts)
    print(f"  找到 {len(category_artifacts)} 条")

    # 去重
    print("\n[去重处理]")
    all_artifacts = deduplicate_artifacts(all_artifacts)
    print(f"  去重后: {len(all_artifacts)} 条")

    # 过滤
    print("\n[过滤非文物条目]")
    all_artifacts = filter_valid_artifacts(all_artifacts)
    print(f"  过滤后: {len(all_artifacts)} 条")

    return all_artifacts

def phase2_crawl_details(all_artifacts):
    """阶段2：批量爬取详情"""
    print("\n" + "=" * 60)
    print("阶段2: 批量爬取文物详情")
    print("=" * 60)

    os.makedirs(DETAIL_DIR, exist_ok=True)

    stats['total'] = len(all_artifacts)

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

    print(f"  已有高质量数据: {len(existing_ok)} 条（将跳过）")

    for i, artifact in enumerate(all_artifacts):
        name = artifact['name']
        url = artifact['url']

        safe_name = re.sub(r'[\\/:*?"<>|]', '_', name)
        detail_file_name = f"{safe_name}.json"

        if detail_file_name in existing_ok:
            stats['success'] += 1
            if i % 50 == 0:
                print(f"\n  [{i+1}/{stats['total']}] 跳过已有数据")
            continue

        print(f"\n  [{i+1}/{stats['total']}] 正在爬取: {name}")

        try:
            detail = parse_artifact_detail(url, name, artifact.get('category', ''))

            if detail:
                detail_file = os.path.join(DETAIL_DIR, f"{safe_name}.json")
                with open(detail_file, 'w', encoding='utf-8') as f:
                    json.dump(detail, f, ensure_ascii=False, indent=2)
                stats['success'] += 1
                ft_len = len(detail.get('full_text', '') or '')
                print(f"    成功! 正文 {ft_len} 字")
            else:
                stats['failed'] += 1
                stats['errors'].append({'name': name, 'url': url, 'error': '请求失败'})
                print(f"    失败: 请求失败")

        except Exception as e:
            stats['failed'] += 1
            stats['errors'].append({'name': name, 'url': url, 'error': str(e)})
            print(f"    异常: {str(e)}")

    # 保存错误日志
    if stats['errors']:
        with open(ERROR_LOG, 'w', encoding='utf-8') as f:
            json.dump(stats['errors'], f, ensure_ascii=False, indent=2)

def main():
    print("=" * 60)
    print("中国文物数据爬虫 v3 - 分阶段模式")
    print("=" * 60)

    # 阶段1：收集列表
    all_artifacts = phase1_collect_list()

    # 保存列表
    print("\n[保存列表]")
    with open(LIST_FILE, 'w', encoding='utf-8') as f:
        json.dump(all_artifacts, f, ensure_ascii=False, indent=2)
    print(f"  已保存到: {LIST_FILE}")
    print(f"  总条目: {len(all_artifacts)}")

    # 检查是否达到目标
    if len(all_artifacts) >= TARGET_COUNT:
        print(f"\n✓ 已达到目标 {TARGET_COUNT} 条!")
        # 阶段2：爬取详情
        phase2_crawl_details(all_artifacts)
    else:
        print(f"\n⚠ 未达到目标 {TARGET_COUNT} 条，当前只有 {len(all_artifacts)} 条")
        print("  建议添加更多分类URL")

    # 打印统计
    print("\n" + "=" * 60)
    print("爬取完成!")
    print("=" * 60)
    print(f"列表总数: {len(all_artifacts)} 条")
    print(f"详情成功: {stats['success']} 条")
    print(f"详情失败: {stats['failed']} 条")
    print(f"\n数据保存位置:")
    print(f"  列表文件: {LIST_FILE}")
    print(f"  详细目录: {DETAIL_DIR}")
    print("=" * 60)

if __name__ == '__main__':
    main()
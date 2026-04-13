# -*- coding: utf-8 -*-
"""
中国文物数据爬虫 - 维基百科
用于构建知识图谱和AI问答系统
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
LIST_FILE = os.path.join(OUTPUT_DIR, "artifacts_list.json")
ERROR_LOG = os.path.join(OUTPUT_DIR, "error_log.json")

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
        # 过滤掉特殊的Unicode字符（如罕见汉字、符号等）
        cleaned = ''.join(c for c in text if c.isprintable() or c in '\n\t')
        print(cleaned)
    except:
        print(text.encode('utf-8', errors='replace').decode('utf-8'))

def clean_text(text):
    """清理文本中的特殊字符"""
    return ''.join(c for c in text if c.isprintable() or c in '\n\t')

def random_delay(min_sec=1, max_sec=2):
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
        # 需要排除的区域：infobox、导航框、参考文献、分类链接等
        exclude_classes = [
            'infobox', 'navbox', 'navbox-styles', 'reflist', 'references',
            'catlinks', 'mw-navigation', 'sistersitebox', 'side-box',
            'metadata', 'noprint', 'mw-empty-elt', 'authority-control',
            'plainlinks', 'mw-heading'  # heading本身不排除，但避免重复
        ]

        # 获取所有段落（recursive=True，因为正文可能在section嵌套中）
        all_p = content_div.find_all('p')

        paragraphs = []
        for p in all_p:
            # 跳过在排除区域内的段落
            parent_classes = ' '.join(p.get('class', []))
            if any(exc in parent_classes for exc in exclude_classes):
                continue

            # 检查是否在infobox/navbox等内部
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

        # 第一段作为摘要
        if paragraphs:
            summary = paragraphs[0]

        full_text = '\n\n'.join(paragraphs)

    # 从infobox提取关键信息
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

def crawl_national_heritage_list():
    """爬取全国重点文物保护单位列表"""
    artifacts = []

    # 使用主页面，从中提取批次链接
    main_url = "https://zh.wikipedia.org/wiki/全国重点文物保护单位"

    print(f"\n正在访问主页面...")
    response = safe_request(main_url)
    if not response:
        print("  主页面访问失败，尝试备用链接...")

    # 备用：直接爬取已知的批次页面
    batch_urls = [
        ("第一批", "https://zh.wikipedia.org/wiki/第一批全国重点文物保护单位"),
        ("第二批", "https://zh.wikipedia.org/wiki/第二批全国重点文物保护单位"),
        ("第三批", "https://zh.wikipedia.org/wiki/第三批全国重点文物保护单位"),
        ("第四批", "https://zh.wikipedia.org/wiki/第四批全国重点文物保护单位"),
        ("第五批", "https://zh.wikipedia.org/wiki/第五批全国重点文物保护单位"),
        ("第六批", "https://zh.wikipedia.org/wiki/第六批全国重点文物保护单位"),
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

        # 查找表格
        tables = content_div.find_all('table', {'class': ['wikitable', 'sortable']})

        for table in tables:
            rows = table.find_all('tr')
            for row in rows[1:]:  # 跳过表头
                cells = row.find_all(['td', 'th'])
                if len(cells) >= 2:
                    # 名称通常在第一个单元格
                    name_cell = cells[0]
                    link = name_cell.find('a')

                    if link and link.get('href'):
                        href = link.get('href')
                        if href.startswith('/wiki/'):
                            name = link.get_text(strip=True)
                            if not name or name in ['编辑', '删除', '更多']:
                                name = name_cell.get_text(strip=True)

                            # 提取其他信息
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

                            # 过滤无效条目
                            if name and len(name) > 1 and not name.startswith('['):
                                artifacts.append(artifact)
                                print(f"  发现: {name} ({batch_name})")

    return artifacts

def crawl_category(category_url, category_name, max_depth=2, current_depth=0):
    """递归爬取分类页面"""
    artifacts = []

    if current_depth >= max_depth:
        return artifacts

    print(f"\n爬取分类: {category_name} (深度: {current_depth})")
    response = safe_request(category_url)
    if not response:
        return artifacts

    soup = BeautifulSoup(response.text, 'html.parser')

    # 获取分类中的页面
    pages_div = soup.find('div', {'id': 'mw-pages'})
    if pages_div:
        # 获取所有链接
        for link in pages_div.find_all('a'):
            href = link.get('href', '')
            title = link.get('title', '')

            if href.startswith('/wiki/') and not ':' in title:
                # 排除分类页面等
                if not any(x in title for x in ['分类:', 'Category:', 'Template:', 'Wikipedia:']):
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
                sub_artifacts = crawl_category(subcat_url, category_name, max_depth, current_depth + 1)
                artifacts.extend(sub_artifacts)

    return artifacts

def crawl_bronze_category():
    """爬取中国青铜器分类"""
    category_urls = [
        ("中国青铜器", "https://zh.wikipedia.org/wiki/Category:中国青铜器"),
        ("中国古代礼器", "https://zh.wikipedia.org/wiki/Category:中国古代礼器"),
        # 添加更多分类以获取更多文物数据
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
    ]

    all_artifacts = []

    for cat_name, cat_url in category_urls:
        artifacts = crawl_category(cat_url, cat_name, max_depth=2)
        all_artifacts.extend(artifacts)

    return all_artifacts


def crawl_banned_export_list():
    """爬取禁止出境展览文物列表（195件国宝级文物）"""
    artifacts = []

    # 三批禁止出境展览文物列表页
    list_pages = [
        ("第一批禁止出境展览文物", "https://zh.wikipedia.org/wiki/第一批禁止出境展览文物",
         "https://zh.wikipedia.org/wiki/四羊方尊"),  # 用四羊方尊页面的表格作为补充
    ]

    # 先爬取四羊方尊页面底部的禁止出境展览文物导航表格
    # 这是最完整的列表来源
    ref_page_url = "https://zh.wikipedia.org/wiki/四羊方尊"
    print(f"\n正在爬取禁止出境展览文物列表（从导航表格）...")
    response = safe_request(ref_page_url)
    if response:
        soup = BeautifulSoup(response.text, 'html.parser')
        # 查找所有包含"禁止出境展览文物"的导航表格
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

    # 再从专门的列表页面爬取
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

        # 查找wikitable
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

    # 也从正文段落中提取链接
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

def main():
    print("=" * 60)
    print("中国文物数据爬虫 - 维基百科 (v2: 全文提取)")
    print("=" * 60)

    # 确保目录存在
    os.makedirs(DETAIL_DIR, exist_ok=True)

    all_artifacts = []

    # 1. 爬取禁止出境展览文物列表（优先级最高，195件国宝）
    print("\n[阶段1] 爬取禁止出境展览文物列表...")
    banned_artifacts = crawl_banned_export_list()
    all_artifacts.extend(banned_artifacts)
    print(f"  找到 {len(banned_artifacts)} 条禁止出境展览文物")

    # 2. 爬取全国重点文物保护单位列表
    print("\n[阶段2] 爬取全国重点文物保护单位列表...")
    heritage_artifacts = crawl_national_heritage_list()
    all_artifacts.extend(heritage_artifacts)
    print(f"  找到 {len(heritage_artifacts)} 条文物保护单位")

    # 3. 爬取青铜器分类
    print("\n[阶段3] 爬取青铜器/礼器分类...")
    bronze_artifacts = crawl_bronze_category()
    all_artifacts.extend(bronze_artifacts)
    print(f"  找到 {len(bronze_artifacts)} 条青铜器/礼器")

    # 去重
    print("\n[去重处理]")
    all_artifacts = deduplicate_artifacts(all_artifacts)
    print(f"  去重后共 {len(all_artifacts)} 条记录")

    # 保存列表
    print("\n[阶段4] 保存文物列表...")
    with open(LIST_FILE, 'w', encoding='utf-8') as f:
        json.dump(all_artifacts, f, ensure_ascii=False, indent=2)
    print(f"  已保存到: {LIST_FILE}")

    # 4. 爬取详细信息
    print("\n[阶段5] 爬取文物详细信息（全文提取）...")
    stats['total'] = len(all_artifacts)

    # v2: 强制重新爬取所有条目（因为修复了全文提取逻辑）
    # 但如果文件已存在且 full_text >= 500 字，则跳过（说明之前已用v2爬取过）
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

        # 跳过已有高质量数据
        if detail_file_name in existing_ok:
            stats['success'] += 1
            if i % 50 == 0:
                print(f"\n  [{i+1}/{stats['total']}] 跳过 {len(existing_ok)} 条已有高质量数据")
            continue

        print(f"\n  [{i+1}/{stats['total']}] 正在爬取: {name}")

        try:
            detail = parse_artifact_detail(url, name, artifact.get('category', ''))

            if detail:
                # 保存详细文件
                safe_name = re.sub(r'[\\/:*?"<>|]', '_', name)
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
        print(f"\n错误日志已保存到: {ERROR_LOG}")

    # 打印统计
    print("\n" + "=" * 60)
    print("爬取完成!")
    print("=" * 60)
    print(f"总计: {stats['total']} 条")
    print(f"成功: {stats['success']} 条")
    print(f"失败: {stats['failed']} 条")
    print(f"\n数据保存位置:")
    print(f"  列表文件: {LIST_FILE}")
    print(f"  详细目录: {DETAIL_DIR}")
    print("=" * 60)

if __name__ == '__main__':
    main()
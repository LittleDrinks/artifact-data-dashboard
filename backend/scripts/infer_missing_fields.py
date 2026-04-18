"""
推断缺失的 era/location/material/museum 字段
从 description 和 tags 中提取关键词填充空值
"""

import sqlite3
import re
import sys

# 设置输出编码
sys.stdout.reconfigure(encoding='utf-8')

DB_PATH = 'E:/shared/workplace/ADD_new/backend/data/app.db'

# 朝代关键词（注意避免误匹配）
ERA_PATTERNS = [
    # 先精确匹配长词
    ('新石器时代', '新石器时代'),
    ('旧石器时代', '旧石器时代'),
    ('良渚文化', '良渚文化'),
    ('龙山文化', '龙山文化'),
    ('仰韶文化', '仰韶文化'),
    ('红山文化', '红山文化'),
    ('河姆渡文化', '河姆渡文化'),
    ('大汶口文化', '大汶口文化'),
    ('马家窑文化', '马家窑文化'),
    ('屈家岭文化', '屈家岭文化'),
    ('夏', '夏'),
    ('商周', '商周'),  # 如果描述中写商周，取这个
    # 短词需要排除误匹配
    ('西周', '西周'),
    ('东周', '东周'),
    ('春秋', '春秋'),
    ('战国', '战国'),
    ('西汉', '西汉'),
    ('东汉', '东汉'),
    ('三国', '三国'),
    ('西晋', '西晋'),
    ('东晋', '东晋'),
    ('南北朝', '南北朝'),
    ('北魏', '北魏'),
    ('北齐', '北齐'),
    ('北周', '北周'),
    ('隋唐', '隋唐'),  # 隋唐连写的情况
    ('五代', '五代'),
    ('后唐', '后唐'),
    ('后晋', '后晋'),
    ('后汉', '后汉'),
    ('后周', '后周'),
    ('辽', '辽'),
    ('北宋', '北宋'),
    ('南宋', '南宋'),
    ('西夏', '西夏'),
    ('金代', '金'),
    ('元代', '元'),
    ('明代', '明'),
    ('清代', '清'),
    ('唐', '唐'),
    ('宋', '宋'),
    ('元', '元'),
    ('明', '明'),
    ('清', '清'),
    ('秦', '秦'),
    ('汉', '汉'),
    ('晋', '晋'),
    ('隋', '隋'),
    ('商', '商'),
]

# 需要排除误匹配的上下文（在匹配单字朝代时检查）
ERA_SINGLE_CHAR_EXCLUDE = {
    '汉': ['广汉', '汉口', '武汉', '汉江', '汉中', '汉人'],  # 地名等
    '秦': ['秦岭', '始皇陵'],
    '宋': ['宋朝', '宋式', '宋人'],  # 宋代是正确的，但要排除宋式等
    '金': ['金字', '金冠', '金印', '金元', '铜金', '黄金'],  # 金代正确，但排除材质
    '元': ['元朝'],  # 元代正确
    '明': ['明朝', '明华', '清明上河图'],  # 明代正确
    '清': ['清朝', '清明上河图'],  # 清代正确
    '商': ['商品', '商人', '商王'],  # 商代正确
}

# 从tags中提取朝代（tags更干净）
ERA_FROM_TAGS = [
    '新石器时代', '旧石器时代', '良渚文化', '龙山文化', '仰韶文化', '红山文化',
    '河姆渡文化', '大汶口文化', '马家窑文化', '屈家岭文化', '夏', '商', '周',
    '西周', '东周', '春秋', '战国', '秦', '西汉', '东汉', '汉', '三国',
    '西晋', '东晋', '晋', '南北朝', '北魏', '北齐', '北周', '隋', '唐',
    '五代', '后唐', '后晋', '后汉', '后周', '辽', '北宋', '南宋', '宋',
    '西夏', '金', '元', '明', '清'
]

# 特殊地点-朝代映射
SITE_TO_ERA = {
    '三星堆': '商',
    '金沙遗址': '商',
    '马王堆': '西汉',
    '兵马俑': '秦',
    '秦始皇陵': '秦',
}

# 材质关键词
MATERIAL_PATTERNS = [
    '青铜', '铜', '铁', '金', '银', '玉', '石', '陶', '瓷', '木', '竹',
    '漆', '丝', '帛', '纸', '骨', '角', '玛瑙', '水晶', '琉璃', '翡翠',
    '象牙', '犀角', '宝石', '珍珠', '琥珀', '翡翠'
]

# 博物馆匹配模式
MUSEUM_PATTERNS = [
    r'藏于(.{2,20}博物馆)',
    r'现藏于(.{2,20}博物馆)',
    r'现藏(.{2,20}博物馆)',
    r'(.{2,20}博物馆)藏',
    r'(.{2,20}博物馆)\s*收藏',
    r'(.{2,20}博物馆)',
]

# 图书馆/研究所等收藏机构
LIBRARY_PATTERNS = [
    r'藏于(.{2,20}图书馆)',
    r'现藏于(.{2,20}图书馆)',
    r'(.{2,20}图书馆)藏',
    r'藏于(.{2,20}大学)',
    r'现收藏于(.{2,20}大学)',
]

# 省份关键词
PROVINCES = [
    '浙江', '江苏', '河南', '陕西', '湖南', '湖北', '四川', '云南',
    '山东', '山西', '河北', '安徽', '广东', '广西', '福建', '甘肃',
    '辽宁', '吉林', '黑龙江', '江西', '贵州', '宁夏', '青海', '西藏',
    '新疆', '内蒙古', '北京', '上海', '天津', '重庆'
]

# 出土地点匹配模式
LOCATION_PATTERNS = [
    r'出土于(.{2,30})',
    r'(.{2,20}[省市区县])出土',
    r'出土地[：:]\s*(.{2,20})',
]


def infer_era_from_tags(tags):
    """从tags推断朝代（tags更干净，优先）"""
    if not tags:
        return None
    tags = str(tags)
    for era in ERA_FROM_TAGS:
        if era in tags:
            # 检查排除（针对单字）
            if era in ERA_SINGLE_CHAR_EXCLUDE:
                for exclude in ERA_SINGLE_CHAR_EXCLUDE[era]:
                    if exclude in tags:
                        continue
            return era
    return None


def infer_era_from_desc(text):
    """从description推断朝代"""
    if not text:
        return None
    text = str(text)

    # 先检查特殊地点
    for site, era in SITE_TO_ERA.items():
        if site in text:
            return era

    # 先匹配长词（文化类）
    for pattern, era in ERA_PATTERNS[:12]:
        if pattern in text:
            return era

    # 匹配周代/周朝
    if '周代' in text or '周朝' in text:
        return '周'

    # 再匹配短词，但需要检查上下文排除误匹配
    for pattern, era in ERA_PATTERNS[12:]:
        # 查找所有匹配位置
        for i in range(len(text)):
            if text[i:].startswith(pattern):
                # 检查排除上下文
                if era in ERA_SINGLE_CHAR_EXCLUDE:
                    # 检查前后5个字符
                    context = text[max(0, i-5):min(len(text), i+5+len(pattern))]
                    should_skip = False
                    for exclude in ERA_SINGLE_CHAR_EXCLUDE[era]:
                        if exclude in context:
                            should_skip = True
                            break
                    if should_skip:
                        continue
                return era
    return None


def infer_era(desc, tags):
    """综合推断朝代，优先tags"""
    return infer_era_from_tags(tags) or infer_era_from_desc(desc)


def infer_material(text):
    """从文本推断材质"""
    if not text:
        return None

    text = str(text)

    for material in MATERIAL_PATTERNS:
        if material in text:
            return material

    return None


def infer_museum(text):
    """从文本推断博物馆/收藏机构"""
    if not text:
        return None

    text = str(text)

    # 先匹配博物馆
    for pattern in MUSEUM_PATTERNS:
        match = re.search(pattern, text)
        if match:
            museum = match.group(1).strip()
            if museum.endswith('博物馆'):
                return museum
            return museum + '博物馆' if '博物馆' not in museum else museum

    # 再匹配图书馆/大学等
    for pattern in LIBRARY_PATTERNS:
        match = re.search(pattern, text)
        if match:
            return match.group(1).strip()

    return None


def infer_location(text):
    """从文本推断出土地点"""
    if not text:
        return None

    text = str(text)

    # 先匹配出土地点模式
    for pattern in LOCATION_PATTERNS:
        match = re.search(pattern, text)
        if match:
            loc = match.group(1).strip()
            # 清理常见后缀和无关内容
            loc = re.sub(r'[，。、；].*', '', loc)  # 遇到逗号等截断
            loc = re.sub(r'(，|$).*', '', loc)  # 截断到逗号
            loc = loc.rstrip('出土于。、，现藏')
            # 截取到合理长度（不超过30字）
            if len(loc) > 30:
                loc = loc[:30]
            if len(loc) >= 2:
                return loc

    # 再匹配省份
    for province in PROVINCES:
        if province in text:
            return province

    return None


def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 获取统计
    print("=" * 50)
    print("修复前统计：")
    for field in ['era', 'location', 'material', 'museum']:
        cursor.execute(f'SELECT COUNT(*) FROM artifacts WHERE {field} IS NULL OR {field} = ""')
        nulls = cursor.fetchone()[0]
        print(f"  {field}: {nulls} 个空值")

    # 获取需要修复的记录
    cursor.execute('''
        SELECT id, name, description, tags, era, location, material, museum
        FROM artifacts
        WHERE era IS NULL OR era = ""
           OR location IS NULL OR location = ""
           OR material IS NULL OR material = ""
           OR museum IS NULL OR museum = ""
    ''')
    records = cursor.fetchall()
    print(f"\n共有 {len(records)} 条记录需要修复")

    # 显示样本
    print("\n" + "=" * 50)
    print("推断样本（前5条）：")
    for i, row in enumerate(records[:5]):
        id_, name, desc, tags, era, loc, mat, mus = row
        inferred_era = infer_era(desc, tags)
        inferred_mat = infer_material(desc) or infer_material(tags)
        inferred_mus = infer_museum(desc)
        inferred_loc = infer_location(desc) or infer_location(tags)

        print(f"\n记录 {id_}: {name}")
        print(f"  描述片段: {(desc[:80] if desc else 'NULL') + '...'}")
        print(f"  标签: {tags}")
        print(f"  推断 era: {era or '空'} -> {inferred_era or '无法推断'}")
        print(f"  推断 material: {mat or '空'} -> {inferred_mat or '无法推断'}")
        print(f"  推断 museum: {mus or '空'} -> {inferred_mus or '无法推断'}")
        print(f"  推断 location: {loc or '空'} -> {inferred_loc or '无法推断'}")

    # 执行修复
    print("\n" + "=" * 50)
    print("开始修复...")

    fixed_count = {'era': 0, 'location': 0, 'material': 0, 'museum': 0}

    for row in records:
        id_, name, desc, tags, era, loc, mat, mus = row

        # 推断各字段
        inferred_era = infer_era(desc, tags)
        inferred_mat = infer_material(desc) or infer_material(tags)
        inferred_mus = infer_museum(desc)
        inferred_loc = infer_location(desc) or infer_location(tags)

        # 只更新空字段
        updates = {}
        if (not era or era == '') and inferred_era:
            updates['era'] = inferred_era
        if (not loc or loc == '') and inferred_loc:
            updates['location'] = inferred_loc
        if (not mat or mat == '') and inferred_mat:
            updates['material'] = inferred_mat
        if (not mus or mus == '') and inferred_mus:
            updates['museum'] = inferred_mus

        if updates:
            set_clause = ', '.join([f"{k} = ?" for k in updates.keys()])
            values = list(updates.values()) + [id_]
            cursor.execute(f"UPDATE artifacts SET {set_clause} WHERE id = ?", values)

            for field in updates.keys():
                fixed_count[field] += 1

    conn.commit()

    print("\n修复统计：")
    for field, count in fixed_count.items():
        print(f"  {field}: 修复了 {count} 条")

    # 获取修复后统计
    print("\n" + "=" * 50)
    print("修复后统计：")
    for field in ['era', 'location', 'material', 'museum']:
        cursor.execute(f'SELECT COUNT(*) FROM artifacts WHERE {field} IS NULL OR {field} = ""')
        nulls = cursor.fetchone()[0]
        print(f"  {field}: {nulls} 个空值")

    conn.close()
    print("\n完成！")


if __name__ == '__main__':
    main()
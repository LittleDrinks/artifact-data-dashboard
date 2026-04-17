"""
批量清洗 era/material/museum 字段的结构化 prompt 模板。

用法：
  1. 从 DB 查出需要清洗的记录（每批 20-30 条）
  2. 构建 input_data = [{"name": "...", "era": "原始值", "material": "原始值", "museum": "原始值"}, ...]
  3. 调用 Ollama qwen2.5:3b，prompt = CLEAN_FIELDS_PROMPT.format(input_data=json.dumps(input_data, ensure_ascii=False))
  4. 解析返回的 JSON 数组，更新回 DB

模型：Ollama qwen2.5:3b（OpenAI 兼容，base_url=http://localhost:11434/v1, api_key=ollama）
"""

CLEAN_FIELDS_PROMPT = """你是一个文物数据结构化清洗专家。我们要清洗以下文物的'年代(era)'、'材质(material)'和'馆藏(museum)'字段，请严格使用以下规则，并直接返回与输入等长的JSON数组。
1. 年代(era)：必须归一化为仅包含下列标准朝代名：新石器时代, 夏, 商, 西周, 东周, 春秋, 战国, 秦, 西汉, 东汉, 三国, 西晋, 东晋, 南北朝, 北魏, 东魏, 西魏, 北齐, 北周, 南朝, 隋, 唐, 五代十国, 北宋, 南宋, 辽, 金, 宋, 西夏, 元, 明, 清, 民国。如果是"商晚期"、"晚商"，统一填"商"；如果在范围内无法对应或者原数据为空，直接填""。
2. 材质(material)：不管之前写了什么句子，只能从中提取有效核心材质，像：青铜, 铜, 陶, 瓷, 玉, 金, 银, 石, 木, 丝, 纸, 漆等。如果提取不到或者本来就没有，填""。
3. 馆藏(museum)：去重并统一名称。比如：包含"北京故宫博物院"一律叫"故宫博物院"；包含"国立故宫博物院"一律叫"台北故宫博物院"；"湖南省博物馆"改叫"湖南博物院"。不要加"于"等介词前缀。
输入JSON：
{input_data}
只输出干净合法的纯JSON数组：[{{"name": "...", "era": "...", "material": "...", "museum": "..."}}]不要有任何其它的文字和Markdown修饰符号！"""

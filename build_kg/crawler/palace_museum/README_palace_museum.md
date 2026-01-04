# 故宫博物院（数字文物库）网页端采集

本目录提供一个最小可用的网页端采集脚本，用于从“藏品总目”页面的真实接口抓取故宫博物院中文藏品数据（默认 100 条），并落地为 JSON，供后续合并导出 Excel。

## 1) 抓取 100 条故宫藏品（中文）

在项目根目录执行：

```bash
python build_kg/crawler/palace_museum_web_crawler.py --limit 100
```

默认输出：`build_kg/crawler/palace_museum_artifacts.json`

可选参数：
- `--limit` 抓取条数
- `--page-size` 列表分页大小
- `--start-page` 从第几页开始
- `--sleep` 每条详情请求后的延迟（秒）

## 2) 合并深圳 + 故宫并导出 Excel

```bash
python build_kg/merge_and_export_excel.py \
  --shenzhen-json build_kg/crawler/artifact.json \
  --palace-json build_kg/crawler/palace_museum_artifacts.json \
  --output build_kg/data_merged.xlsx
```

说明：
- 导出格式与 `build_kg/data.xlsx` 的工作表/列名对齐。
- 目前故宫详情页可稳定抽取的字段主要是：名称、编号、类别、年代（Period）、颜色（如有）。其他字段会尽量从页面结构里扩展，但缺失时保持为空。 

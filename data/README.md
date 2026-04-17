# Data Directory

数据资产目录，包含文物数据、问答基准、处理脚本及中间产物。

## 目录结构

```
data/
├── scripts/           # 数据处理脚本
│   ├── clean_data.py      # 数据清洗脚本
│   └── generate_qa.py     # 问答数据生成脚本
│
├── intermediate/      # 中间产物（可删除）
│   ├── *_v*.json          # 数据版本迭代文件
│   ├── *_report.*         # 各类分析报告
│   ├── missing_*.json     # 数据补全过程的产物
│   └── validation_*       # 数据验证记录
│
├── final/             # 最终可用数据
│   ├── artifacts_list.json        # 文物列表（629条）
│   ├── artifacts_list_clean.json  # 清洗后的文物列表
│   ├── benchmark_qa.json          # 问答基准数据
│   ├── benchmark_qa_clean.json    # 清洗后的问答基准
│   ├── benchmark_README.md        # 问答基准说明
│   └── artifacts_detail/          # 文物详情（逐条JSON）
│
└── README.md          # 本文件
```

## 数据说明

### 文物数据
- `final/artifacts_list.json`: 629条文物元数据，包含 name、description、category、era、location、image_url、tags 字段
- `final/artifacts_detail/`: 每条文物独立JSON文件，含完整百科详情

### 问答基准
- `final/benchmark_qa.json`: 问答评估基准，用于AI回答质量测试
- 详见 `final/benchmark_README.md`

## 数据来源

文物数据源自百度百科爬取，经人工筛选与清洗。

## 注意事项

- `intermediate/` 目录下的文件为数据处理过程产物，可安全删除
- `scripts/` 下的脚本需要 Python 3.10+ 环境
- 文件读写请使用 `encoding='utf-8'` 参数（Windows环境）
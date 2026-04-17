# AI Q&A Benchmark for Chinese Cultural Heritage

## Overview
This benchmark is designed to evaluate AI systems' ability to answer questions about Chinese bronze artifacts and cultural heritage.

## Data Source
- **Primary Source**: Wikipedia Chinese artifact articles (维基百科)
- **Crawled Data**: 629 artifact entries with detailed information
- **Knowledge Origin**: All factual content comes from published Wikipedia articles, which are based on academic research and archaeological findings

## Principle
**LLM only does format conversion. All knowledge comes from published sources.**
- Questions are generated from verified artifact data
- Answers are extracted directly from source content
- No external knowledge hallucination

## Benchmark Statistics
- **Total Questions**: 1572
- **Categories**:
  - basic_fact: 280 (era, museum, material, location questions)
  - detailed_explanation: 515 (artifact descriptions)
  - identification: 582 (identify artifact from description)
  - comparative: 92 (compare similar artifacts)
  - relationship: 103 (knowledge graph style queries)

- **Difficulty Levels**:
  - easy: 280
  - medium: 656
  - hard: 636

## Question Format
```json
{
  "id": 1,
  "question": "后母戊鼎是什么时代的文物？",
  "answer": "商代",
  "source_artifact": "后母戊鼎",
  "category": "basic_fact",
  "difficulty": "easy"
}
```

## Coverage
- **Bronze Artifacts**: 鼎、簋、尊、爵、斝、觥、罍等
- **Key Sites**: 三星堆、殷墟、宝鸡、周原
- **Major Museums**: 中国国家博物馆、故宫博物院、三星堆博物馆、宝鸡青铜器博物院
- **Eras**: 商代、西周、东周、春秋、战国、汉代

## Usage
1. Load `benchmark_qa.json`
2. For each question, evaluate AI response against ground truth answer
3. Metrics: exact match, fuzzy match, semantic similarity

## Files
- `benchmark_qa.json`: Main benchmark questions
- `benchmark_source.json`: Source artifact data used for question generation
- `artifacts_detail/`: Individual artifact JSON files

## Methodology
Questions are generated programmatically from the artifact data using templates:
1. **Basic facts**: Direct extraction of era, museum, material fields
2. **Detailed explanations**: Using artifact summary/description
3. **Identification**: Creating description-to-name matching questions
4. **Comparative**: Grouping artifacts by era for listing questions
5. **Relationship**: Museum-era-artifact relationship queries
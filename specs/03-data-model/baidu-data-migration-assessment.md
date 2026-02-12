# 百度百科数据迁移 - 可行性评估报告

> **评估目标**：评估从百度百科博物馆频道迁移数据的工作量、风险和实施建议

---

## 现状分析

### 已有资源

| 资源 | 状态 | 说明 |
|------|------|------|
| 博物馆列表 API | ✅ 已确定 | `https://baike.baidu.com/api/museum/getmuseumlist` |
| 文物入口发现 | ✅ 已完成 | 用户已花 3 天完成 |
| 基础爬虫代码 | ✅ 已有 | `build_kg/crawler/baidu/` |
| 数据提取逻辑 | ✅ 已有 | `crawl_entry_pages.py` |
| 样本数据 | ✅ 已有 | `artifact_sample_50/` 等目录 |

### 现有代码结构

```
build_kg/crawler/baidu/
├── crawl_all_artifacts.py      # 主爬虫 - 获取博物馆和文物列表
├── crawl_entry_pages.py        # 详情页爬虫 - 提取文物详细信息
├── artifact_sample_5/          # 5 个样本（已清洗）
├── artifact_sample_50/         # 50 个样本
├── artifacts_by_museum/        # 按博物馆分目录存储
└── data_llm_*/                 # LLM 处理后的数据
```

### 样本数据分析

从 `11399_四川广汉三星堆博物馆.json` 样本可见：

**优势**：
- 数据结构化程度较好（metadata 字段完整）
- 图片资源丰富（491 张图片链接）
- 包含关系数据（馆藏精品关联其他文物）

**问题**：
- 部分字段需要清洗（如 "类    别" 有空格）
- HTML 正文需要提取纯文本
- 图片需要下载到本地

---

## 工作量评估

### 阶段 1：爬虫完善（3-5 天）

| 任务 | 工作量 | 难度 | 备注 |
|------|--------|------|------|
| 修复现有爬虫 Bug | 1 天 | 低 | 处理反爬、超时等 |
| 增加断点续爬 | 1 天 | 中 | 避免重复爬取 |
| 优化爬取速度 | 1 天 | 中 | 并发控制、频率限制 |
| 错误重试机制 | 0.5 天 | 低 | 失败自动重试 |
| 数据验证 | 0.5 天 | 低 | 检查必填字段 |

**风险点**：
- 百度百科反爬策略可能升级
- 部分文物页面结构不一致

### 阶段 2：数据清洗（5-7 天）

| 任务 | 工作量 | 难度 | 备注 |
|------|--------|------|------|
| 字段标准化 | 2 天 | 中 | 年代、类别、材质映射 |
| HTML 清洗 | 1 天 | 低 | 提取纯文本描述 |
| 数据去重 | 1 天 | 中 | 同名文物合并 |
| 质量评分 | 1 天 | 中 | 缺失字段检测 |
| 人工抽检 | 2 天 | 低 | 验证清洗效果 |

**示例 - 年代标准化**：
```javascript
// 需要处理的格式差异
"创作年代": "商代"     → "商"
"所属年代": "商"       → "商"
"年代": "商朝"         → "商"
"年代": "商代（约公元前1600-1046年）" → "商"
```

### 阶段 3：图片下载（3-5 天）

| 任务 | 工作量 | 难度 | 备注 |
|------|--------|------|------|
| 图片链接提取 | 0.5 天 | 低 | 从 JSON 提取 |
| 下载脚本 | 1 天 | 低 | 并发下载 |
| 压缩/缩略图 | 1 天 | 低 | 生成预览图 |
| 存储组织 | 0.5 天 | 低 | 按博物馆分目录 |
| 失败重试 | 1 天 | 低 | 断点续传 |

**预估存储**：
- 原图：~500GB（200,000 张 × 2.5MB）
- 缩略图：~50GB

### 阶段 4：数据入库（3-4 天）

| 任务 | 工作量 | 难度 | 备注 |
|------|--------|------|------|
| MySQL 入库脚本 | 1 天 | 中 | 批量插入 |
| Neo4j 入库脚本 | 1.5 天 | 中 | 关系构建 |
| 索引优化 | 0.5 天 | 低 | 加速查询 |
| 数据校验 | 1 天 | 中 | 一致性检查 |

### 阶段 5：增量更新（2-3 天）

| 任务 | 工作量 | 难度 | 备注 |
|------|--------|------|------|
| 更新检测 | 1 天 | 中 | 对比 upload_date |
| 增量爬取 | 0.5 天 | 低 | 只爬更新项 |
| 数据合并 | 0.5 天 | 中 | 合并新旧数据 |
| 定时任务 | 1 天 | 低 | 每周自动更新 |

---

## 风险与缓解

### 高风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 百度百科反爬升级 | 中 | 无法获取数据 | 1. 降低爬取频率<br>2. 使用代理池<br>3. 分布式爬取 |
| 页面结构变化 | 中 | 解析失败 | 1. 使用多种选择器<br>2. 增加异常处理<br>3. 监控告警 |
| 数据质量问题 | 高 | 需要大量清洗 | 1. 制定清洗规则<br>2. 人工抽检<br>3. 质量评分机制 |

### 中风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 图片下载失败 | 中 | 部分文物无图 | 1. 重试机制<br>2. 占位图<br>3. 记录失败日志 |
| 存储空间不足 | 低 | 无法存储图片 | 1. 监控存储<br>2. 压缩策略<br>3. 云存储备选 |
| 入库性能瓶颈 | 中 | 入库慢 | 1. 批量插入<br>2. 分批处理<br>3. 禁用索引后重建 |

---

## 两种实施方案

### 方案 A：全量迁移（推荐）

**范围**：爬取全部 500+ 博物馆，50,000+ 文物

**时间**：4-6 周

**人力**：1 人全职 + 1 人半职（审核）

**成本**：
- 人力：~5 人周
- 存储：~600GB（本地硬盘或 OSS）
- 带宽：下载图片消耗

**优势**：
- 数据完整，覆盖全面
- 一次投入，长期受益
- 支持后续分析挖掘

**劣势**：
- 工作量大
- 周期长
- 需要持续维护

### 方案 B：精选迁移（快速启动）

**范围**：精选 Top 20 博物馆，~5,000 文物

**时间**：1-2 周

**人力**：1 人全职

**筛选标准**：
1. 国家级博物馆（故宫、国博、上博等）
2. 数据质量高（字段完整、图片清晰）
3. 知名度高（便于演示）

**优势**：
- 快速见效
- 工作量可控
- 质量有保障

**劣势**：
- 数据量较小
- 覆盖面有限
- 后续仍需补充

### 方案 C：渐进式迁移（平衡）⭐ 推荐

**范围**：分批迁移，每批 5-10 个博物馆

**时间**：持续 2-3 个月

**实施步骤**：
1. **第一批（1周）**：Top 5 博物馆，~1,000 文物
2. **第二批（1周）**：再 10 个博物馆，~3,000 文物  
3. **第三批（2周）**：再 20 个博物馆，~10,000 文物
4. **第四批（4周）**：剩余博物馆

**优势**：
- 风险可控，每批可调整
- 早期就有可用数据
- 用户可以逐步使用

**劣势**：
- 需要分多批次
- 需要持续投入

---

## 推荐方案：C（渐进式）+ 自动化工具

### 第一阶段：基础设施（1 周）

**目标**：搭建完整的爬虫+清洗+入库流水线

```
爬虫流水线
    │
    ├── 爬虫调度器（控制频率、重试）
    │
    ├── 数据清洗器（标准化、去重、评分）
    │
    ├── 图片下载器（并发下载、压缩）
    │
    └── 数据入库器（MySQL + Neo4j）
```

**交付物**：
- [ ] 完善的爬虫代码
- [ ] 数据清洗脚本
- [ ] 入库脚本
- [ ] 监控和日志

### 第二阶段：种子数据（1 周）

**目标**：获取第一批高质量数据，验证流程

**选择博物馆**：
1. 故宫博物院（知名度最高）
2. 中国国家博物馆（文物丰富）
3. 三星堆博物馆（有特色）
4. 上海博物馆（数据质量好）
5. 河南博物院（青铜器和玉器）

**预期数据**：
- 文物：~1,500 件
- 图片：~5,000 张
- 存储：~15GB

### 第三阶段：批量迁移（按需）

**自动化**：
```bash
# 添加新博物馆到队列
python crawler_cli.py add-museum --name "南京博物院"

# 自动完成全流程
python crawler_cli.py process --museum "南京博物院"

# 批量处理
python crawler_cli.py batch-process --file museum_list.txt
```

---

## 技术实现建议

### 1. 爬虫架构优化

```python
# crawler/orchestrator.py
class CrawlOrchestrator:
    def __init__(self):
        self.museum_crawler = MuseumCrawler()
        self.artifact_crawler = ArtifactCrawler()
        self.entry_crawler = EntryCrawler()
        self.cleaner = DataCleaner()
        self.uploader = DataUploader()
    
    async def process_museum(self, museum_name):
        """处理单个博物馆的全流程"""
        try:
            # 1. 获取文物列表
            artifacts = await self.artifact_crawler.crawl(museum_name)
            
            # 2. 获取详情页
            for artifact in artifacts:
                detail = await self.entry_crawler.crawl(artifact['entry_url'])
                artifact['detail'] = detail
            
            # 3. 数据清洗
            cleaned = self.cleaner.clean(artifacts)
            
            # 4. 下载图片
            await self.download_images(cleaned)
            
            # 5. 数据入库
            await self.uploader.upload(cleaned)
            
            return {'success': True, 'count': len(cleaned)}
            
        except Exception as e:
            logger.error(f"Failed to process {museum_name}: {e}")
            return {'success': False, 'error': str(e)}
```

### 2. 数据质量监控

```python
# quality/monitor.py
class QualityMonitor:
    def check_artifact(self, artifact):
        """检查单条数据质量"""
        issues = []
        
        # 必填字段检查
        required_fields = ['name', 'era', 'category', 'museum']
        for field in required_fields:
            if not artifact.get(field):
                issues.append(f"Missing {field}")
        
        # 年代标准化检查
        if artifact.get('era') and not self.is_valid_era(artifact['era']):
            issues.append(f"Invalid era: {artifact['era']}")
        
        # 图片检查
        if not artifact.get('images'):
            issues.append("No images")
        
        # 计算质量分数
        score = self.calculate_score(artifact, issues)
        
        return {
            'score': score,
            'issues': issues,
            'passed': score >= 0.6
        }
```

### 3. 增量更新

```python
# sync/incremental.py
class IncrementalSync:
    def __init__(self):
        self.last_sync_time = self.load_last_sync()
    
    async def sync(self):
        """增量同步"""
        # 1. 获取已录入的博物馆列表
        museums = await self.get_tracked_museums()
        
        for museum in museums:
            # 2. 检查该博物馆是否有更新
            last_modified = await self.check_museum_update(museum)
            
            if last_modified > self.last_sync_time:
                # 3. 重新爬取该博物馆
                await self.re crawl_museum(museum)
        
        # 4. 更新同步时间
        self.save_last_sync(datetime.now())
```

---

## 决策建议

### 立即行动（本周）

1. **确认方案**：选择 C（渐进式）
2. **评估现有代码**：review `build_kg/crawler/baidu/` 代码质量
3. **选择种子博物馆**：确定第一批 5 个博物馆

### 短期行动（2 周内）

1. **完善爬虫**：修复现有代码问题
2. **搭建流水线**：爬虫 → 清洗 → 入库
3. **获取种子数据**：完成第一批博物馆数据

### 中期行动（1-2 月）

1. **批量迁移**：自动化工具批量处理
2. **质量监控**：建立数据质量报告
3. **增量更新**：实现定期同步机制

---

## 你需要做的决策

| 决策项 | 选项 | 建议 |
|--------|------|------|
| 迁移方案 | A（全量）/ B（精选）/ C（渐进） | **C** |
| 第一批博物馆 | 自选 5 个 | 故宫、国博、三星堆、上博、河南博物院 |
| 存储方式 | 本地 / 云存储 | 开发用本地，生产用阿里云 OSS |
| 是否保留旧数据 | 是 / 否 | 保留，做数据对比后决定 |

---

*文档版本：v1.0*
*评估日期：2026-02-13*
*下一步：确定方案后，开始完善爬虫代码*

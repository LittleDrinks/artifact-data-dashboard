# TEST-05: GitHub Actions CI 搭建

## 变更内容

修改文件：`.github/workflows/ci.yml`

### 1. Backend Job 新增 pytest 步骤
- 在 ruff 检查之后添加依赖安装：`pip install -r requirements.txt -r requirements-dev.txt`
- 添加测试运行：`pytest tests/ -v --tb=short`

### 2. Frontend Job 新增 build 检查
- 在 `npx tsc --noEmit` 之后添加：`npm run build`

### 3. PR 触发已存在
- `on: pull_request: branches: [main]` 已在原配置中，无需修改

## 验收验证

```
$ grep -n "pytest" .github/workflows/ci.yml
24:      - run: pytest tests/ -v --tb=short

$ grep -n "npm run build" .github/workflows/ci.yml
41:      - run: npm run build

$ grep -n "pull_request" .github/workflows/ci.yml
6:  pull_request:
```

全部通过。

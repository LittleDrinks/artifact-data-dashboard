# PR-Agent 配置说明

## 前置条件

需要在 GitHub 仓库的 Secrets 中配置以下变量：

| Secret 名称 | 说明 | 获取方式 |
|-------------|------|----------|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | [DeepSeek 开放平台](https://platform.deepseek.com/api_keys) |

> `GITHUB_TOKEN` 由 GitHub 自动提供，无需手动配置。

## 配置步骤

1. 打开 GitHub 仓库页面
2. 进入 **Settings** -> **Secrets and variables** -> **Actions**
3. 点击 **New repository secret**
4. Name 填写 `DEEPSEEK_API_KEY`
5. Secret 填写从 DeepSeek 平台获取的 API Key
6. 点击 **Add secret**

## 使用方法

### 自动触发

- 创建或重新打开 PR 时，会自动触发代码审查
- PR 标记为 ready_for_review 时也会触发

### 手动触发（通过评论）

在 PR 页面中发表评论，输入以下指令：

| 指令 | 功能 |
|------|------|
| `/review` | 请求代码审查 |
| `/describe` | 生成 PR 描述 |
| `/improve` | 获取代码改进建议 |
| `/ask <问题>` | 就代码提问 |

## 模型配置

- 主模型：`deepseek-chat`（通用对话模型）
- 备用模型：`deepseek-coder`（代码专用模型）

所有输出均为中文。

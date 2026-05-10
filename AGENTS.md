# Agent / Harness 使用规范

本文档定义项目中使用 Claude Code agent 的规范，防止死循环、资源浪费和状态泄漏。

---

## 1. 何时用单个 Agent，何时拆多个

| 场景 | 策略 | 原因 |
|------|------|------|
| 单一文件的小修复（<50行） | 单个 agent | 上下文小，探索空间可控 |
| 跨 2-3 个文件的关联修改 | 单个 agent | 需要理解关联逻辑 |
| 跨模块/超过 5 个文件的改动 | **拆多个并行 agent** | 防止探索空间过大导致死循环 |
| 纯查询类任务（找代码、读文档） | 单个 agent（`haiku` 模型） | 成本低，快速返回 |
| 复杂架构决策 | `opus` 模型单个 agent | 需要深层推理 |

**死循环预警信号**：agent 在 50 次 tool calling 后仍在重复读文件、grep 相同内容、没有实质性修改 → 立即 kill，重新拆任务派发。

---

## 2. Model 选择

派 agent 时**必须**指定 `model` 参数：

- `opus`：复杂架构决策（数据库设计、API 重构、算法选择）
- `sonnet`：**默认**，日常开发（bug 修复、功能实现、代码审查）
- `haiku`：简单查询（找文件、grep、读配置）

**禁止**：让 `opus` 做纯查询，或让 `haiku` 做架构决策。

---

## 3. Tool Calling 上限与监控

| 指标 | 建议上限 | 超限处理 |
|------|----------|----------|
| 单次 agent tool calls | 100 次 | kill，检查任务是否过宽 |
| 单次 agent 执行时间 | 5 分钟 | 检查是否卡在网络请求或死循环 |
| 并行 agent 数量 | 4-6 个 | 超过则排队，避免资源争抢 |

**监控命令**：
```bash
# 查看 agent tmux 会话
ls ~/.claude/teams/{team}/

# 查看 agent 输出日志
cat ~/.claude/teams/{team}/*.output 2>/dev/null | tail -50
```

---

## 4. 任务指令规范

### 必须包含的信息
1. **目标** — 要修什么问题 / 实现什么功能
2. **范围** — 具体涉及哪些文件（给出路径）
3. **已知的坑** — 之前踩过什么坑，避免重复踩
4. **验收标准** — 怎么算完成（通过测试？CI 绿？浏览器验证？）

### 禁止的操作
- "基于你的发现，修复问题"（把理解推给 agent）
- "看看有没有 bug"（范围无限大）
- 不给文件路径让 agent 自己找（探索空间失控）

### Kimi CLI 特殊规则
- Prompt **必须 <500 字符**
- **不传 diff** 给 Kimi（它读不懂）
- 失败先 **retry** 一次，再拆任务

---

## 5. Agent 完成后的清理检查清单

每个 agent 任务结束后必须执行：

- [ ] 确认 agent 已退出（不是挂起在 tmux 中）
- [ ] `tmux kill-pane` 关闭残留 pane（`shutdown_request` 不够）
- [ ] 删除 team 目录：`rm -rf ~/.claude/teams/{team}`（`TeamDelete` 经常失败）
- [ ] 确认修改提交到了正确的分支（不是 detatched HEAD）
- [ ] 确认没有未提交的临时文件

**一键清理脚本**（保存为 `scripts/clean-agents.sh`）：
```bash
#!/bin/bash
# 清理残留 agent 会话和目录
for team in ~/.claude/teams/*/; do
    [ -d "$team" ] || continue
    echo "Cleaning: $team"
    rm -rf "$team"
done
# 清理残留 tmux 会话
tmux ls 2>/dev/null | grep -E '^[0-9]+:' | cut -d: -f1 | xargs -r tmux kill-session -t 2>/dev/null
echo "Done."
```

---

## 6. 常见踩坑与规避

| 问题 | 根因 | 规避方法 |
|------|------|----------|
| Agent 死循环（500+ tool calls） | 任务范围过大，agent 在无限探索 | 拆任务，给明确文件路径 |
| Agent 提交到错误分支 | 未确认当前分支就 commit | 在 prompt 中明确要求 `git branch --show-current` |
| Team 目录残留 | `TeamDelete` API 不可靠 | 用 `rm -rf` 兜底 |
| Tmux pane 残留 | `shutdown_request` 不杀 pane | 显式 `tmux kill-pane` |
| Agent 修改了不应改的文件 | 范围描述不清 | 用 `"只修改 X 文件，不要动其他"` 明确限制 |

---

## 7. 与 GSD Workflow 的配合

- `/gsd-execute-phase` 派 agent 时，每个 plan 对应一个 agent 任务
- Orchestrator 负责监控进度，不执行代码
- Generator agent 只做分配的任务，不自行扩展范围
- 若 agent 报告"需要更多信息"，orchestrator 应给出更精确的指令，而不是让 agent 自己猜

---

## 8. 前端改动的特殊要求

**前端改动必须用浏览器验证** — 启动 dev server，打开页面，确认数据和交互正常。

Agent 完成前端任务后，orchestrator 应检查：
- `npm run build` 通过
- `npm run lint` 无新错误
- 关键交互路径在浏览器中验证过

---

*本文档随实际踩坑持续更新。发现问题立即追加到对应章节。*

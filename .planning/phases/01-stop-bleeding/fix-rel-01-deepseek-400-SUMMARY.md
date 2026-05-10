# REL-01 Summary: 修复 DeepSeek API 400 — 剥离非 reasoner 模型的 reasoning_content

## 问题
非 reasoner 模型（如 deepseek-v4-flash）在流式响应中可能返回 `reasoning_content` 字段，
但后端构建 assistant message 历史时未区分模型类型，一律将 `reasoning_content` 回传给 API，
导致切换到非 reasoner 模型时 API 拒绝该字段返回 400。

## 修改文件
- `backend/app/services/chat.py`

## 变更详情

### 1. 新增 REASONER_MODELS 集合（第 39 行）
```python
REASONER_MODELS = {"deepseek-reasoner"}
```

### 2. load_history() 条件恢复 reasoning_content（第 227 行）
```python
if m.reasoning_content and settings.AI_MODEL_NAME in REASONER_MODELS:
    msg_dict["reasoning_content"] = m.reasoning_content
```
仅在当前配置模型为官方 reasoner 模型时，才从历史消息中恢复 `reasoning_content` 到 API 消息字典。

### 3. _react_gen() 条件传递 reasoning_content（第 534 行）
```python
if thinking_text and settings.AI_MODEL_NAME in REASONER_MODELS:
    assistant_msg["reasoning_content"] = thinking_text
```
仅在模型属于 `REASONER_MODELS` 时，才将 `thinking_text` 放入 assistant message 传给 API。

### 4. 非 reasoner 模型的 thinking_text 仍保存到数据库
`stream_chat_response()` 末尾的 `save_message()` 调用保持不变，`combined_reasoning` 仍作为
`reasoning_content` 存入数据库，供前端展示思考过程。只是不再将其回传给 API。

## 验证结果

- `grep -n "REASONER_MODELS" backend/app/services/chat.py`：3 处匹配（定义 + 2 处条件判断）
- `grep -n "reasoning_content" backend/app/services/chat.py`：条件判断包裹确认
- `pytest backend/tests/test_chat.py -v`：**17 passed, 2 warnings**

## 提交
- Commit: `fix(chat): strip reasoning_content for non-reasoner models (REL-01)`

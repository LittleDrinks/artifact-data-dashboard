# 开发踩坑记录

> 开发过程中遇到的所有非显而易见的问题，实时追加。

---

*最后更新：2026-04-14*

### [2026-04-14] Python 3.9 不支持 `str | None` 联合类型语法
- **现象**：SQLAlchemy model 中使用 `Mapped[str | None]` 语法，运行时报 `TypeError: unsupported operand type(s) for |: 'type' and 'NoneType'`
- **原因**：`X | None` 联合类型语法是 Python 3.10+ 才引入的，当前环境是 Python 3.9.13
- **解决**：所有模型和配置中的 `str | None` / `list[str]` 替换为 `Optional[str]` / `List[str]`（from typing import Optional, List）
- **教训**：开发前先确认 Python 版本，3.9 环境下必须用 `typing` 模块的兼容写法

### [2026-04-14] Windows 下 Python open() 读取含中文 JSON 必须指定 encoding
- **现象**：`open('artifacts_list.json')` 在 Windows 上默认用 GBK 编码，读取含中文的 JSON 抛 UnicodeDecodeError
- **原因**：Windows 系统 locale 默认编码不是 UTF-8
- **解决**：所有 `open()` 调用都加 `encoding='utf-8'` 参数
- **教训**：Windows 环境下处理中文文件，永远显式指定 encoding='utf-8'

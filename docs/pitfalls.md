# 开发踩坑记录

> 开发过程中遇到的所有非显而易见的问题，实时追加。

---

*最后更新：2026-04-14*

### [2026-04-14] 默认 Python 3.9 无法创建兼容的虚拟环境
- **现象**：`python -m venv .venv` 创建了 Python 3.9 的虚拟环境，安装 SQLAlchemy 时 greenlet 编译失败（需要 MSVC 14.0+），且项目使用了 `X | None` 语法（3.10+）
- **原因**：系统中 `python` 命令指向 Python 3.9.13，而 miniforge 安装了 Python 3.12.12
- **解决**：使用 `E:/miniforge3/python.exe -m venv .venv` 创建基于 Python 3.12 的虚拟环境
- **教训**：Windows 系统可能安装多个 Python 版本，创建虚拟环境前先确认目标 Python 路径和版本

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

### [2026-04-14] recharts Tooltip formatter 和 Pie label 的 TypeScript 类型严格检查
- **现象**：`formatter={(value: number) => ...}` 报 TS2322，`label={({ name, percent }) => ...}` 报 TS2769
- **原因**：recharts 的 Tooltip formatter 参数类型是 `ValueType | undefined`，Pie label 参数类型是 `PieLabelRenderProps`（name 为 `string | undefined`），不能窄化为非可选类型
- **解决**：formatter 去掉类型标注用隐式推断，Pie label 导入 `PieLabelRenderProps` 类型并正确处理可选属性
- **教训**：recharts v2 的 TypeScript 类型定义很严格，不要给回调参数手动标注更窄的类型

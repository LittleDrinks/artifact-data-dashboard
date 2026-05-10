# Phase 1 - fix-sec-04-repair-ssrf 执行总结

## Task
- **ID**: SEC-04
- **Title**: repair.py 图片下载 SSRF 防护

## 修改文件
- `backend/app/routers/repair.py`

## 变更内容
在 `download_image()` 函数前增加了 `_validate_image_url()` 独立校验函数，实现四重 SSRF 防护：

1. **IP 校验**：使用 `ipaddress.ip_address()` 判断 hostname 是否为纯 IP，拒绝 `is_private` 和 `is_loopback` 地址。
2. **域名校验**：通过正则拒绝内网域名（`localhost`, `*.local`, `127.*`, `10.*`, `192.168.*`, `172.16-31.*`）。
3. **大小校验**：设置 `stream=True`，分块读取，最大允许 10MB，超过则截断并抛异常。
4. **Content-Type 校验**：仅允许 `image/*` 类型的响应。
5. **超时设置**：连接超时 5 秒，读取超时 10 秒（原 15 秒单一超时）。

## 验证结果
- `grep -n "_validate_image_url" backend/app/routers/repair.py` -> 匹配（第 40 行）
- `grep -n "is_private\|is_loopback" backend/app/routers/repair.py` -> 匹配（第 57 行）
- `grep -n "image/" backend/app/routers/repair.py` -> 匹配（第 90 行）
- `pytest tests/ -v`: 71 passed, 1 failed（失败项 `test_delete_success_admin` 为已有问题，与本次修改无关）

## 提交
- Commit: `feat(repair): add SSRF protection for image download (SEC-04)`

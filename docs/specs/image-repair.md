# 图像修复模块规格说明

> 最后更新：2026-04-17
> 当前实现状态：**OpenCV inpainting 已实现，认证已添加**

---

## 当前实现状态

| 功能 | 状态 | 说明 |
|------|------|------|
| OpenCV Inpainting | ✅ 已实现 | TELEA 和 Navier-Stokes 两种算法 |
| 遮罩绘制 | ✅ 已实现 | Canvas 绘制 + 下载 |
| 前后对比展示 | ✅ 已实现 | 修复前/后图片对比 |
| 认证保护 | ✅ 已实现 | POST 端点需 JWT token |

---

## 1. 需求概述

图像修复是系统的特色功能，展示 AI 工具作为插件集成到平台的理念。用户可在文物详情页绘制遮罩，调用 OpenCV inpainting 算法修复破损区域。

### 1.1 页面位置

- 嵌入在 `/artifacts/:id` 文物详情页
- 作为独立组件 `ImageRepair.tsx`

### 1.2 业务需求

| 需求 | 描述 | 优先级 |
|------|------|--------|
| 遮罩绘制 | Canvas 上涂抹标记破损区域 | P0 |
| Inpainting 修复 | OpenCV 算法修复遮罩区域 | P0 |
| 前后对比 | 展示修复前/后图片 | P0 |
| 认证保护 | 需登录才能使用 | P1 |

---

## 2. API 接口

### 2.1 端点

| 端点 | 方法 | 认证 | 说明 |
|------|------|------|------|
| `/api/artifacts/:id/repair-image` | POST | 需要 | 执行图像修复 |

### 2.2 请求参数

```
POST /api/artifacts/:id/repair-image
Content-Type: multipart/form-data

参数：
- mask: File (PNG, 白色区域为待修复区域)
- radius: int (修复半径, 1-20, 默认 3)
- method: string ("telea" 或 "ns", 默认 "telea")
```

### 2.3 响应格式

```json
{
  "success": true,
  "artifact_id": 1,
  "artifact_name": "后母戊鼎",
  "repaired_image": "base64_encoded_png",
  "method": "telea",
  "radius": 3
}
```

### 2.4 认证实现

**位置**：`backend/app/routers/repair.py:48`

```python
@router.post("/{artifact_id}/repair-image")
async def repair_image(
    artifact_id: int,
    mask: UploadFile = File(...),
    current_user: User = Depends(get_current_user),  # 认证依赖
    ...
):
```

> **修复历史**：Round 2 审查发现端点缺少认证，已添加 `Depends(get_current_user)`。

---

## 3. 后端实现

### 3.1 OpenCV Inpainting 算法

**位置**：`backend/app/routers/repair.py:78-107`

```python
# TELEA 算法
cv2.INPAINT_TELEA

# Navier-Stokes 算法
cv2.INPAINT_NS
```

两种算法对比：
- TELEA：基于快速行进法，速度快
- Navier-Stokes：基于流体动力学，大面积修复效果好

### 3.2 处理流程

1. 获取文物信息（检查 image_url）
2. 下载原图（从外部 URL）
3. 读取用户上传的遮罩
4. 调整遮罩尺寸与原图匹配
5. 执行 inpainting
6. 编码为 base64 返回

### 3.3 图片下载

**位置**：`backend/app/routers/repair.py:24-38`

```python
def download_image(url: str) -> np.ndarray:
    resp = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
    pil_img = Image.open(io.BytesIO(resp.content))
    return np.array(pil_img)
```

> **已知限制**：从外部 URL 下载原图，网络延迟可能导致响应较慢。

---

## 4. 前端实现

### 4.1 ImageRepair 组件

**位置**：`frontend/src/pages/ImageRepair.tsx`

功能：
- Canvas 绘制遮罩（鼠标涂抹）
- 遮罩下载（PNG 格式）
- 上传遮罩调用 API
- 展示修复结果对比

### 4.2 Canvas 绘制

```tsx
// 绘制白色遮罩
canvas.onmousedown = startDraw
canvas.onmousemove = draw
canvas.onmouseup = endDraw

// 导出 PNG
const maskUrl = canvas.toDataURL('image/png')
```

### 4.3 API 调用

```typescript
// 上传遮罩 + 获取修复结果
const formData = new FormData()
formData.append('mask', maskFile)
formData.append('radius', '3')
formData.append('method', 'telea')

const response = await fetch(`/api/artifacts/${artifactId}/repair-image`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: formData,
})
```

---

## 5. 已知问题

| ID | 问题 | 来源 | 优先级 | 说明 |
|-----|------|------|--------|------|
| REPAIR-1 | 下载原图耗时 | [实现] | P2 | 从外部 Wikipedia URL 下载原图，网络延迟可能导致响应慢（15s timeout） |
| REPAIR-2 | 单一修复方法 | [ADR-006] | P3 | 仅实现 OpenCV inpainting，未集成 IOPaint/LaMa 等更先进的算法 |
| UX-1 | 遮罩绘制体验待优化 | [设计] | P3 | Canvas 绘制不支持撤销、擦除等精细操作 |

---

## 6. 验收标准

| 检查项 | 标准 | 当前状态 |
|--------|------|---------|
| 遮罩绘制 | Canvas 涂抹生成遮罩 | ✅ 已实现 |
| Inpainting | OpenCV TELEA/NS 算法 | ✅ 已实现 |
| 认证保护 | JWT required | ✅ 已实现（Round 2 修复） |
| 前后对比 | 修复结果展示 | ✅ 已实现 |
| 响应格式 | base64 PNG 返回 | ✅ 已实现 |

---

## 7. 设计理念

图像修复功能是"插件化架构"的演示：
- 作为独立模块集成到文物详情页
- 展示第三方 AI 工具（OpenCV）如何作为插件接入
- 为后续 IOPaint/LaMa 等更先进算法预留接口

---

## 8. 关键文件索引

| 文件 | 负责内容 |
|------|---------|
| `backend/app/routers/repair.py` | API 端点、OpenCV inpainting |
| `frontend/src/pages/ImageRepair.tsx` | Canvas 绘制、遮罩上传 |
| `frontend/src/pages/ArtifactDetail.tsx` | 详情页入口 |

---

*最后更新：2026-04-18*
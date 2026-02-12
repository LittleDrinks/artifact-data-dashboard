# 图像修复 (Inpainting) API 调研报告

## 概述

本文档调研主流图像修复 API 服务，评估其适用性、成本、接入难度，为系统设计提供决策依据。

---

## 服务对比总览

| 服务 | 单次价格 | 免费额度 | 国内访问 | 实名认证 | 推荐指数 | 特点 |
|------|----------|----------|----------|----------|----------|------|
| **阿里云视觉智能** | 0.01-0.1元 | 100次/月/能力 | ✅ 顺畅 | 需要 | ⭐⭐⭐⭐⭐ | 性价比高，功能丰富 |
| **百度智能云** | 0.045元 | 1500次 | ✅ 顺畅 | 需要 | ⭐⭐⭐⭐ | 免费额度高，技术成熟 |
| **腾讯云数据万象** | ~0.037元 | 无 | ✅ 顺畅 | 需要 | ⭐⭐⭐ | 需配合 COS 使用 |
| **Replicate** | $0.0026-0.086 | 无 | ⚠️ 需翻墙 | 不需要 | ⭐⭐⭐ | SOTA 模型，灵活 |
| **Stability AI** | ~0.35元 | 5次 | ⚠️ 需翻墙 | 不需要 | ⭐⭐ | 官方出品，效果稳定 |

---

## 详细调研

### 1. 阿里云视觉智能开放平台 ⭐ 推荐

#### API 信息
- **图像标志擦除**: `https://imageenhan.cn-shanghai.aliyuncs.com/?Action=RemoveImageWatermark`
- **图像人体擦除**: `https://imageenhan.cn-shanghai.aliyuncs.com/?Action=RemoveImageSubtitles`
- **人脸修复增强**: `https://facebody.cn-shanghai.aliyuncs.com/?Action=EnhanceFace`
- **图像超分辨率**: `https://imageenhan.cn-shanghai.aliyuncs.com/?Action=IncreaseImageResolution`
- **黑白图像上色**: `https://imageenhan.cn-shanghai.aliyuncs.com/?Action=ColorizeImage`
- **鉴权方式**: AccessKey ID + AccessKey Secret 签名

#### 定价

| 能力 | 按量付费 | 免费额度 | 资源包优惠 |
|------|----------|----------|------------|
| 图像标志擦除 | 0.01元/次 | 100次/月 | 5000点/50元（首次免费试用） |
| 图像人体擦除 | 0.06元/次 | 100次/月 | 同上 |
| 人脸修复增强 | 0.1元/次 | 100次/月 | 同上 |
| 图像超分 | 0.02元/次 | 100次/月 | 同上 |
| 图像上色 | 0.1元/次 | 100次/月 | 同上 |

#### 支持的修复类型
- ✅ Logo/台标去除
- ✅ 人体/人像擦除
- ✅ 老照片修复、人脸去模糊
- ✅ 图像超分辨率（2x/4x）
- ✅ 黑白照片上色
- ✅ 字幕擦除
- ✅ 图像色彩增强

#### 接入示例

```python
import requests
import json
import base64
from urllib.parse import quote

def remove_watermark(image_url, access_key_id, access_key_secret):
    """调用阿里云图像标志擦除 API"""
    url = "https://imageenhan.cn-shanghai.aliyuncs.com/"
    
    # 构建请求参数（需要签名）
    params = {
        "Action": "RemoveImageWatermark",
        "ImageURL": image_url,
        # ... 其他公共参数和签名
    }
    
    response = requests.get(url, params=params, timeout=30)
    return response.json()

# 使用 Base64 编码的图片
def remove_watermark_base64(image_base64, access_key_id, access_key_secret):
    url = "https://imageenhan.cn-shanghai.aliyuncs.com/"
    params = {
        "Action": "RemoveImageWatermark",
        "ImageBase64": image_base64,
        # ... 签名参数
    }
    response = requests.post(url, data=params, timeout=30)
    return response.json()
```

#### 优缺点
- ✅ **优点**: 价格最低（0.01元/次起），免费额度充足，国内访问稳定，SDK 完善
- ❌ **缺点**: 需要实名认证，功能粒度较粗（无法自定义修复区域）

---

### 2. 百度智能云

#### API 信息
- **Endpoint**: `https://aip.baidubce.com/rest/2.0/image-process/v1/inpainting`
- **鉴权方式**: OAuth 2.0（Access Token）

#### 定价

| 计费方式 | 价格 | 免费额度 |
|----------|------|----------|
| 按量后付费 | 45元/千次（0.045元/次） | 1500次 |
| 次数包（1万次） | 430元 | - |

#### 支持的修复类型
- ✅ 图像修复（支持指定矩形区域）
- ✅ 去噪、去模糊
- ✅ 黑白图像上色
- ✅ 图像清晰度增强
- ✅ 拉伸图像恢复

#### 接入示例

```python
import requests
import base64

def get_access_token(api_key, secret_key):
    """获取百度 AI Access Token"""
    url = f"https://aip.baidubce.com/oauth/2.0/token"
    params = {
        "grant_type": "client_credentials",
        "client_id": api_key,
        "client_secret": secret_key
    }
    response = requests.post(url, params=params)
    return response.json().get("access_token")

def inpaint_image(image_path, access_token, rectangle):
    """
    图像修复
    rectangle: [{"width": 92, "top": 95, "height": 36, "left": 543}]
    """
    url = f"https://aip.baidubce.com/rest/2.0/image-process/v1/inpainting?access_token={access_token}"
    
    with open(image_path, "rb") as f:
        image_base64 = base64.b64encode(f.read()).decode()
    
    payload = {
        "image": image_base64,
        "rectangle": rectangle
    }
    headers = {'Content-Type': 'application/json'}
    
    response = requests.post(url, json=payload, headers=headers)
    return response.json()
```

#### 优缺点
- ✅ **优点**: 免费额度高（1500次），支持指定修复区域，文档完善
- ❌ **缺点**: 单次价格略高于阿里云，需要实名认证

---

### 3. 腾讯云数据万象

#### API 信息
- **服务名称**: ImageRepair（图像修复/标志擦除）
- **Endpoint**: `https://<BucketName-APPID>.cos.<Region>.myqcloud.com/<ObjectKey>?ci-process=ImageRepair`
- **鉴权方式**: COS 签名鉴权

#### 定价
- **图像修复**: 0.0052美元/次（约0.037元/次）
- **免费额度**: 无明确免费额度

#### 支持的修复类型
- ✅ 标志擦除（去除图片中的常见标志/水印）
- ✅ 智能修复（对擦除部分进行智能填充）
- ✅ 支持 MaskPic（遮罩图片）或 MaskPoly（多边形坐标）指定修复区域

#### 接入方式
腾讯云需要配合 COS 存储桶使用，流程：
1. 上传图片到 COS
2. 调用图像修复接口
3. 下载修复后的图片

#### 优缺点
- ✅ **优点**: 价格适中，支持精细的修复区域控制
- ❌ **缺点**: 必须配合 COS 使用，流程复杂，无免费额度

---

### 4. Replicate

#### API 信息
- **Endpoint**: `https://api.replicate.com/v1/predictions`
- **鉴权方式**: API Token

#### 定价（按模型计费）

| 模型 | 价格 | 特点 |
|------|------|------|
| SDXL Inpainting | ~$0.0026/次 | 高质量，性价比高 |
| FLUX DEV Inpainting | ~$0.068/次 | 最新 SOTA 模型 |
| FLUX ControlNet Inpaint | ~$0.086/次 | ControlNet 引导修复 |

#### 支持的修复类型
- ✅ 高质量图像修复
- ✅ 支持 ControlNet 引导
- ✅ 可自定义模型

#### 接入示例

```python
import requests
import time

def replicate_inpainting(image_url, mask_url, api_token):
    """
    使用 Replicate 进行图像修复
    """
    headers = {
        "Authorization": f"Token {api_token}",
        "Content-Type": "application/json"
    }
    
    # 创建预测任务
    data = {
        "version": "95b72277f6ad62d55705d43ed071042c12a5196a6b38e5c00b44df74d09a2edb",
        "input": {
            "image": image_url,
            "mask": mask_url,
            "prompt": "high quality, detailed"
        }
    }
    
    response = requests.post(
        "https://api.replicate.com/v1/predictions",
        headers=headers,
        json=data
    )
    prediction = response.json()
    
    # 轮询获取结果
    prediction_id = prediction["id"]
    while True:
        status_response = requests.get(
            f"https://api.replicate.com/v1/predictions/{prediction_id}",
            headers=headers
        )
        status = status_response.json()
        
        if status["status"] == "succeeded":
            return status["output"]
        elif status["status"] == "failed":
            raise Exception(f"Prediction failed: {status.get('error')}")
        
        time.sleep(1)
```

#### 优缺点
- ✅ **优点**: 模型最新（FLUX），效果最好，无需实名认证
- ❌ **缺点**: 国内访问需翻墙，延迟较高，成本较高

---

### 5. Stability AI

#### API 信息
- **Endpoint**: `https://api.stability.ai/v2beta/stable-image/edit/inpaint`
- **鉴权方式**: API Key

#### 定价
- **计费单位**: Credits（1 credit = $0.01）

| 服务 | Credits | 人民币约 |
|------|---------|----------|
| Inpaint | 5 | 0.35元/次 |
| Erase Object | 5 | 0.35元/次 |
| Outpaint | 4 | 0.28元/次 |
| Creative Upscaler | 60 | 4.2元/次 |

- **免费额度**: 25 credits（约5次）

#### 优缺点
- ✅ **优点**: Stable Diffusion 官方出品，API 设计简洁
- ❌ **缺点**: 价格较高，国内访问需翻墙，免费额度极少

---

## 推荐方案

### 场景一：个人开发者/小型团队（成本敏感）

**推荐：阿里云视觉智能**

理由：
1. 价格最优（0.01元/次起）
2. 免费额度充足（100次/月/能力）
3. 新用户 5000点资源包首次免费试用
4. 国内访问稳定，延迟低

**预估成本**：
- 月调用 1000 次标志擦除：约 10 元
- 月调用 1000 次人脸修复：约 100 元

### 场景二：需要精细控制修复区域

**推荐：百度智能云**

理由：
1. 支持通过 `rectangle` 参数指定修复区域
2. 免费额度最高（1500次）
3. 文档完善，Python SDK 友好

### 场景三：追求最佳效果（预算充足）

**推荐：Replicate + FLUX**

理由：
1. FLUX 是当前最先进的开源图像生成模型
2. 支持 ControlNet 精细控制
3. 按实际使用付费，无月租

---

## 用户自定义 API 配置设计

系统应支持用户配置自己的 API Key，实现 BYOK（Bring Your Own Key）模式：

### 配置表设计

```sql
CREATE TABLE user_api_configs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    provider ENUM('aliyun', 'baidu', 'replicate', 'stability', 'custom') NOT NULL,
    api_key_encrypted VARCHAR(500),      -- 加密存储
    api_secret_encrypted VARCHAR(500),   -- 加密存储（阿里云/百度需要）
    endpoint_url VARCHAR(500),           -- 自定义端点（可选）
    is_active BOOLEAN DEFAULT TRUE,
    monthly_budget DECIMAL(10, 2),       -- 月度预算上限（可选）
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### 使用流程

```
1. 用户在系统设置页面添加 API 配置
   - 选择服务商（阿里云/百度/Replicate/自定义）
   - 输入 API Key（前端加密传输）
   - 设置月度预算上限（可选）

2. 系统进行 API Key 有效性验证
   - 调用测试接口确认 Key 可用
   - 显示服务商返回的余额/额度信息

3. 用户发起图像修复请求
   - 系统查询用户配置的 API
   - 优先使用用户自己的 API Key
   - 如无配置，使用系统默认 Key（如有）

4. 成本追踪
   - 记录每次调用的成本
   - 接近预算上限时提醒用户
```

### 安全考虑

1. **加密存储**: API Key 使用 AES-256 加密存储
2. **传输加密**: 使用 HTTPS 传输，前端预加密敏感字段
3. **权限隔离**: 用户只能访问自己的 API 配置
4. **审计日志**: 记录所有 API 调用，便于追踪

---

## MCP 工具设计

图像修复功能可以通过 MCP 工具暴露给 AI 使用：

```javascript
// backend/src/services/tools/inpainting.tool.js
module.exports = {
  name: 'inpaint_image',
  description: '对文物图像进行 AI 修复（去噪、去划痕、补全）',
  parameters: {
    type: 'object',
    properties: {
      image_url: {
        type: 'string',
        description: '需要修复的图像 URL'
      },
      repair_type: {
        type: 'string',
        enum: ['denoise', 'remove_scratch', 'inpaint', 'upscale', 'colorize'],
        description: '修复类型'
      },
      mask_url: {
        type: 'string',
        description: '修复区域遮罩图（可选，白色为修复区域）'
      }
    },
    required: ['image_url', 'repair_type']
  },
  
  async execute({ image_url, repair_type, mask_url }, context) {
    // 1. 获取用户的 API 配置
    const userConfig = await getUserApiConfig(context.userId);
    
    // 2. 根据配置选择服务商
    const provider = userConfig?.provider || 'aliyun';
    
    // 3. 调用对应服务商的 API
    const result = await callInpaintingAPI({
      provider,
      apiKey: userConfig?.api_key_encrypted,
      imageUrl: image_url,
      repairType: repair_type,
      maskUrl: mask_url
    });
    
    // 4. 保存修复记录
    await saveRepairRecord({
      userId: context.userId,
      originalImage: image_url,
      repairedImage: result.url,
      cost: result.cost,
      provider
    });
    
    return {
      original_url: image_url,
      repaired_url: result.url,
      cost: result.cost,
      provider
    };
  }
};
```

---

## 下一步行动

1. **选择服务商**: 根据预算和需求选择主用服务商
2. **实现 API 配置模块**: 开发用户 API 配置管理功能
3. **开发 MCP 工具**: 实现 `inpaint_image` MCP 工具
4. **前端界面**: 开发图像修复界面（上传 → 预览 → 确认 → 保存）

# 阿里云图像修复 API 接入指南

> **目标**：手把手教你申请阿里云图像修复 API，并接入本系统
> 
> **预计时间**：30 分钟
> 
> **预计费用**：0.01-0.1元/次，新用户有免费额度

---

## 目录

1. [申请阿里云账号](#第一步申请阿里云账号)
2. [开通视觉智能服务](#第二步开通视觉智能服务)
3. [创建 AccessKey](#第三步创建-accesskey)
4. [获取配置信息](#第四步获取配置信息)
5. [配置到本系统](#第五步配置到本系统)
6. [测试验证](#第六步测试验证)
7. [费用控制和告警](#第七步费用控制和告警)

---

## 第一步：申请阿里云账号

### 1.1 注册账号

1. 访问 [阿里云官网](https://www.aliyun.com/)
2. 点击右上角「免费注册」
3. 选择注册方式：
   - 手机号注册（推荐）
   - 支付宝快捷登录
   - 钉钉登录

### 1.2 实名认证

**必须完成实名认证才能使用 API**

1. 登录后点击右上角头像 → 「实名认证」
2. 选择认证类型：
   - **个人认证**：上传身份证正反面，1分钟自动审核
   - 企业认证：需要营业执照（如后续需要开票选这个）

> 💡 **建议**：个人项目选个人认证即可，认证通过后立即生效

---

## 第二步：开通视觉智能服务

### 2.1 进入视觉智能控制台

1. 登录阿里云控制台：[https://www.aliyun.com/](https://www.aliyun.com/)
2. 搜索栏输入「视觉智能」→ 选择「视觉智能开放平台」

或者直接访问：[https://vision.aliyun.com/](https://vision.aliyun.com/)

### 2.2 开通服务

1. 点击「立即开通」或「开通服务」按钮
2. 勾选服务协议 → 点击「立即开通」
3. 开通成功后会显示「已开通」

> 💡 **注意**：开通是免费的，只有实际调用 API 才会产生费用

### 2.3 确认可用能力

开通后，在控制台可以看到各种视觉能力：

| 能力名称 | 我们需要的 | 文档链接 |
|----------|-----------|----------|
| 图像标志擦除 | ✅ 主要用这个 | [文档](https://help.aliyun.com/document_detail/155645.html) |
| 人脸修复增强 | ✅ 老照片修复用 | [文档](https://help.aliyun.com/document_detail/163826.html) |
| 图像超分辨率 | ✅ 提高清晰度 | [文档](https://help.aliyun.com/document_detail/155642.html) |
| 图像上色 | ✅ 黑白照片上色 | [文档](https://help.aliyun.com/document_detail/155646.html) |

---

## 第三步：创建 AccessKey

### 3.1 为什么需要 AccessKey？

阿里云 API 通过 **AccessKey ID** 和 **AccessKey Secret** 进行身份验证，相当于用户名和密码。

### 3.2 创建步骤

1. 鼠标悬停在右上角头像 → 点击「AccessKey 管理」

   或者直接访问：[https://ram.console.aliyun.com/manage/ak](https://ram.console.aliyun.com/manage/ak)

2. 点击「创建 AccessKey」

3. 安全验证：需要手机验证码

4. 创建成功后，**立即保存**两个信息：
   - **AccessKey ID**：类似 `LTAI5t8Z3y8Y7X7Y7X7Y7X7Y`
   - **AccessKey Secret**：类似 `Kx9x9x9x9x9x9x9x9x9x9x9x9x9x9x9`

> ⚠️ **重要**：AccessKey Secret 只在创建时显示一次，务必保存好！
> 
> 如果丢失，只能删除重新创建。

### 3.3 安全建议

为了安全，建议创建 **RAM 子账号**，只授予视觉智能的权限：

1. 访问 [RAM 控制台](https://ram.console.aliyun.com/)
2. 左侧菜单「身份管理」→「用户」→「创建用户」
3. 勾选「OpenAPI 调用访问」
4. 创建成功后，给该用户添加权限：
   - 搜索「视觉智能」→ 选择「AliyunVIAPIFullAccess」
5. 用子账号的 AccessKey 接入系统（更加安全）

---

## 第四步：获取配置信息

### 4.1 汇总需要的配置项

接入系统需要以下信息：

| 配置项 | 获取位置 | 示例值 |
|--------|----------|--------|
| `ALIYUN_ACCESS_KEY_ID` | AccessKey 页面 | `LTAI5t8Z3y8Y7X7Y7X7Y7X7Y` |
| `ALIYUN_ACCESS_KEY_SECRET` | AccessKey 页面 | `Kx9x9x9x9x9x9x9x9x9x9x9x9x9x9x9` |
| `ALIYUN_REGION` | 固定值 | `cn-shanghai` |

### 4.2 支持的 Region

视觉智能 API 目前主要支持：
- `cn-shanghai`（上海，推荐）
- `cn-hangzhou`（杭州）

---

## 第五步：配置到本系统

### 5.1 环境变量配置（推荐）

在系统根目录的 `.env` 文件中添加：

```bash
# ============================================
# 阿里云视觉智能 API 配置（图像修复）
# ============================================

# AccessKey ID（从阿里云控制台获取）
ALIYUN_ACCESS_KEY_ID=your_access_key_id_here

# AccessKey Secret（从阿里云控制台获取）
ALIYUN_ACCESS_KEY_SECRET=your_access_key_secret_here

# 服务区域（默认上海）
ALIYUN_REGION=cn-shanghai

# 图像修复默认使用的能力（可选）
# watermark_removal: 去水印
# face_enhance: 人脸修复
# upscale: 超分辨率
# colorize: 上色
ALIYUN_INPAINTING_DEFAULT_CAPABILITY=watermark_removal
```

### 5.2 后端配置读取

后端代码中通过环境变量读取：

```javascript
// backend/src/config/aliyun.js
module.exports = {
  accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
  region: process.env.ALIYUN_REGION || 'cn-shanghai',
  defaultCapability: process.env.ALIYUN_INPAINTING_DEFAULT_CAPABILITY || 'watermark_removal',
  
  // 验证配置是否完整
  isConfigured() {
    return !!(this.accessKeyId && this.accessKeySecret);
  }
};
```

### 5.3 Docker 环境变量传递

确保 `docker-compose.yml` 中传递这些环境变量：

```yaml
services:
  backend:
    environment:
      - ALIYUN_ACCESS_KEY_ID=${ALIYUN_ACCESS_KEY_ID}
      - ALIYUN_ACCESS_KEY_SECRET=${ALIYUN_ACCESS_KEY_SECRET}
      - ALIYUN_REGION=${ALIYUN_REGION:-cn-shanghai}
      - ALIYUN_INPAINTING_DEFAULT_CAPABILITY=${ALIYUN_INPAINTING_DEFAULT_CAPABILITY:-watermark_removal}
```

---

## 第六步：测试验证

### 6.1 使用系统内置测试

1. 启动系统：`docker-compose up -d`
2. 进入系统管理后台 → 「系统设置」→ 「API 配置」
3. 点击「测试阿里云图像修复 API」
4. 上传一张测试图片，确认能正常返回修复结果

### 6.2 命令行测试（可选）

如果你想先验证阿里云 API 是否可用，可以用 curl：

```bash
# 安装阿里云 CLI（可选）
curl -O https://aliyuncli.alicdn.com/aliyun-cli-linux-latest-amd64.tgz
tar -xvf aliyun-cli-linux-latest-amd64.tgz
sudo mv aliyun /usr/local/bin/

# 配置凭证
aliyun configure
# 输入 AccessKey ID 和 Secret

# 调用图像标志擦除 API（需要构造完整签名，较复杂）
# 建议直接使用 SDK
```

### 6.3 使用 Node.js SDK 测试

```javascript
// test-aliyun.js
const RPCClient = require('@alicloud/pop-core').RPCClient;

const client = new RPCClient({
  accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
  endpoint: 'https://imageenhan.cn-shanghai.aliyuncs.com',
  apiVersion: '2019-09-30'
});

async function testRemoveWatermark() {
  try {
    const result = await client.request('RemoveImageWatermark', {
      ImageURL: 'https://example.com/test-image.jpg'
    });
    console.log('成功:', result);
  } catch (error) {
    console.error('失败:', error);
  }
}

testRemoveWatermark();
```

运行测试：
```bash
cd backend
npm install @alicloud/pop-core
node test-aliyun.js
```

---

## 第七步：费用控制和告警

### 7.1 查看费用

1. 登录阿里云控制台
2. 右上角头像 → 「费用」→ 「费用中心」
3. 可以查看视觉智能服务的消费明细

### 7.2 设置预算告警

1. 进入「费用中心」→ 「预算管理」
2. 点击「创建预算」
3. 设置每月预算上限（如 100 元）
4. 设置告警阈值（如 80%）
5. 设置通知方式（短信/邮件）

### 7.3 费用预估

| 使用场景 | 调用次数/月 | 预估费用 |
|----------|-------------|----------|
| 个人测试 | 100 次 | 免费（在免费额度内） |
| 小规模使用 | 1,000 次 | ~10 元 |
| 中等规模 | 10,000 次 | ~100 元 |
| 大规模 | 100,000 次 | ~1,000 元 |

> 💡 **省钱技巧**：
> - 充分利用每月 100 次免费额度
> - 购买资源包比按量付费更便宜
> - 只对必要的图片调用 API，先用缩略图筛选

---

## 常见问题排查

### Q1: 调用 API 返回 "InvalidAccessKeyId.NotFound"

**原因**：AccessKey ID 错误或不存在

**解决**：
1. 检查 `.env` 文件中的 `ALIYUN_ACCESS_KEY_ID` 是否正确
2. 确认 AccessKey 没有被删除
3. 重新创建 AccessKey 并更新配置

### Q2: 调用 API 返回 "SignatureDoesNotMatch"

**原因**：AccessKey Secret 错误

**解决**：
1. 检查 `ALIYUN_ACCESS_KEY_SECRET` 是否正确
2. 注意 Secret 中可能有特殊字符，需要用引号包裹

### Q3: 调用 API 返回 "InvalidAction.NotFound"

**原因**：调用的 API 不存在或未开通

**解决**：
1. 确认视觉智能服务已开通
2. 检查 API 名称拼写是否正确

### Q4: 图片 URL 访问失败

**原因**：阿里云需要能访问到图片 URL

**解决**：
- 确保图片 URL 是公网可访问的
- 如果是本地图片，先上传到对象存储（如阿里云 OSS）

---

## 配置检查清单

在系统上线前，确认以下配置：

- [ ] 阿里云账号已完成实名认证
- [ ] 视觉智能服务已开通
- [ ] AccessKey 已创建并保存
- [ ] `.env` 文件中已配置 ALIYUN_ACCESS_KEY_ID
- [ ] `.env` 文件中已配置 ALIYUN_ACCESS_KEY_SECRET
- [ ] `docker-compose.yml` 中已传递环境变量
- [ ] 已测试 API 调用成功
- [ ] 已设置费用告警

---

## 下一步

完成以上配置后，系统将能够：
1. 调用阿里云图像修复 API
2. 支持去水印、人脸修复、超分辨率、上色等功能
3. 记录每次调用的成本

接下来可以开发图像修复前端界面（上传 → 预览 → 确认 → 保存）。

---

*文档版本：v1.0*
*最后更新：2026-02-13*
*如有问题，参考 [阿里云视觉智能文档](https://help.aliyun.com/product/412402.html)*

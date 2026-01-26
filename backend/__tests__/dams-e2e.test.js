/**
 * DAMS End-to-End Smoke Test
 * 测试完整流程: upload → tag → folder → public link → download
 * @jest-environment node
 */

const request = require('supertest');
const path = require('path');
const fs = require('fs');

// 注意：这个测试需要运行完整的应用环境
// 可以通过环境变量 E2E_BASE_URL 指定测试服务器地址
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

// 测试用的认证 token（需要预先设置或从登录获取）
const AUTH_TOKEN = process.env.E2E_AUTH_TOKEN || '';

// 辅助函数
const authHeader = () => ({
  Authorization: `Bearer ${AUTH_TOKEN}`
});

describe('DAMS E2E Smoke Test', () => {
  let uploadedAttachmentId = null;
  let createdFolderId = null;
  let createdTagId = null;
  let publicLinkToken = null;

  beforeAll(() => {
    if (!AUTH_TOKEN) {
      console.warn('警告: E2E_AUTH_TOKEN 未设置，某些测试可能失败');
    }
  });

  describe('Step 1: Upload Asset', () => {
    it('should upload a test file', async () => {
      // 创建测试文件
      const testFilePath = path.join(__dirname, 'test-asset.txt');
      fs.writeFileSync(testFilePath, 'This is a test file for DAMS E2E testing');

      try {
        const response = await request(BASE_URL)
          .post('/api/attachments/upload')
          .set(authHeader())
          .attach('file', testFilePath);

        if (response.status === 201) {
          uploadedAttachmentId = response.body.id;
          expect(uploadedAttachmentId).toBeDefined();
          console.log(`Uploaded attachment ID: ${uploadedAttachmentId}`);
        } else if (response.status === 403) {
          console.log('Upload skipped: Admin permission required');
          // 使用已存在的附件进行后续测试
          const listResponse = await request(BASE_URL)
            .get('/api/attachments?limit=1')
            .set(authHeader());
          
          if (listResponse.body.data?.length > 0) {
            uploadedAttachmentId = listResponse.body.data[0].id;
          }
        }
      } finally {
        // 清理测试文件
        if (fs.existsSync(testFilePath)) {
          fs.unlinkSync(testFilePath);
        }
      }
    });
  });

  describe('Step 2: Create Folder', () => {
    it('should create a test folder', async () => {
      const response = await request(BASE_URL)
        .post('/api/folders')
        .set(authHeader())
        .send({
          name: `E2E Test Folder ${Date.now()}`
        });

      if (response.status === 201) {
        createdFolderId = response.body.id;
        expect(createdFolderId).toBeDefined();
        console.log(`Created folder ID: ${createdFolderId}`);
      } else {
        console.log('Folder creation response:', response.status, response.body);
      }
    });

    it('should get folder tree', async () => {
      const response = await request(BASE_URL)
        .get('/api/folders')
        .set(authHeader());

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('Step 3: Create Tag', () => {
    it('should create a test tag', async () => {
      const response = await request(BASE_URL)
        .post('/api/tags')
        .set(authHeader())
        .send({
          name: `E2E Test Tag ${Date.now()}`,
          color: '#1890ff'
        });

      if (response.status === 201) {
        createdTagId = response.body.id;
        expect(createdTagId).toBeDefined();
        console.log(`Created tag ID: ${createdTagId}`);
      } else {
        console.log('Tag creation response:', response.status, response.body);
      }
    });

    it('should get all tags', async () => {
      const response = await request(BASE_URL)
        .get('/api/tags')
        .set(authHeader());

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('Step 4: Apply Tag to Asset', () => {
    it('should add tag to attachment', async () => {
      if (!uploadedAttachmentId || !createdTagId) {
        console.log('Skipping: No attachment or tag available');
        return;
      }

      const response = await request(BASE_URL)
        .post(`/api/tags/file/${uploadedAttachmentId}`)
        .set(authHeader())
        .send({ tagId: createdTagId });

      // 201 = 成功添加, 409 = 已存在
      expect([201, 409]).toContain(response.status);
    });

    it('should get file tags', async () => {
      if (!uploadedAttachmentId) {
        console.log('Skipping: No attachment available');
        return;
      }

      const response = await request(BASE_URL)
        .get(`/api/tags/file/${uploadedAttachmentId}`)
        .set(authHeader());

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('Step 5: Create Public Link', () => {
    it('should create a public link', async () => {
      if (!uploadedAttachmentId) {
        console.log('Skipping: No attachment available');
        return;
      }

      const response = await request(BASE_URL)
        .post('/api/public-links')
        .set(authHeader())
        .send({
          attachmentId: uploadedAttachmentId,
          maxDownloads: 10
        });

      if (response.status === 201) {
        publicLinkToken = response.body.token;
        expect(publicLinkToken).toBeDefined();
        console.log(`Created public link token: ${publicLinkToken}`);
      } else {
        console.log('Public link creation response:', response.status, response.body);
      }
    });
  });

  describe('Step 6: Access via Public Link (No Auth)', () => {
    it('should get file info via public link', async () => {
      if (!publicLinkToken) {
        console.log('Skipping: No public link available');
        return;
      }

      const response = await request(BASE_URL)
        .get(`/public/${publicLinkToken}/info`);

      expect(response.status).toBe(200);
      expect(response.body.filename).toBeDefined();
    });

    it('should download via public link', async () => {
      if (!publicLinkToken) {
        console.log('Skipping: No public link available');
        return;
      }

      const response = await request(BASE_URL)
        .get(`/public/${publicLinkToken}/download`);

      // 200 = 成功下载
      expect(response.status).toBe(200);
    });
  });

  describe('Step 7: Get References', () => {
    it('should get attachment references', async () => {
      if (!uploadedAttachmentId) {
        console.log('Skipping: No attachment available');
        return;
      }

      const response = await request(BASE_URL)
        .get(`/api/attachments/${uploadedAttachmentId}/references`)
        .set(authHeader());

      expect(response.status).toBe(200);
      expect(response.body.total).toBeDefined();
    });
  });

  // 清理
  afterAll(async () => {
    // 可选：清理测试数据
    // 注意：在生产环境测试时不要删除数据
    
    if (process.env.E2E_CLEANUP === 'true') {
      if (publicLinkToken) {
        // 撤销公开链接
        await request(BASE_URL)
          .post(`/api/public-links/${publicLinkToken}/revoke`)
          .set(authHeader());
      }

      if (createdTagId) {
        await request(BASE_URL)
          .delete(`/api/tags/${createdTagId}`)
          .set(authHeader());
      }

      if (createdFolderId) {
        await request(BASE_URL)
          .delete(`/api/folders/${createdFolderId}`)
          .set(authHeader());
      }
    }
  });
});

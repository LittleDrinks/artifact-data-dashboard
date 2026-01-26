/**
 * Attachment References Tests
 * @jest-environment node
 */

// 模拟数据库
jest.mock('../src/config/database', () => ({
  mysqlPool: {
    execute: jest.fn()
  }
}));

const { mysqlPool } = require('../src/config/database');
const { AttachmentService } = require('../src/services/attachment.service');

describe('AttachmentService.listReferences', () => {
  let attachmentService;

  beforeEach(() => {
    jest.clearAllMocks();
    attachmentService = new AttachmentService();
  });

  it('should return empty references when no relations exist', async () => {
    // 模拟 attachment_refs 查询返回空
    mysqlPool.execute
      .mockResolvedValueOnce([[]])  // attachment_refs
      .mockResolvedValueOnce([[{ owner_type: null, owner_id: null }]])  // attachments
      .mockResolvedValueOnce([[{ id: 1 }]])  // attachment exists
      .mockResolvedValueOnce([[]]);  // artifacts with image_url

    const result = await attachmentService.listReferences(1);

    expect(result.total).toBe(0);
    expect(result.artifacts).toEqual([]);
    expect(result.chats).toEqual([]);
  });

  it('should return artifact references from attachment_refs table', async () => {
    // 模拟 attachment_refs 返回一个 artifact 引用
    mysqlPool.execute
      .mockResolvedValueOnce([[
        { owner_type: 'artifact', owner_id: 100, relation_type: 'image', created_at: '2024-01-01' }
      ]])  // attachment_refs
      .mockResolvedValueOnce([[
        { id: 100, name: '青铜器', category: '礼器', era: '商代' }
      ]])  // artifact details
      .mockResolvedValueOnce([[{ owner_type: null, owner_id: null }]])  // attachments owner
      .mockResolvedValueOnce([[{ id: 1 }]])  // attachment exists
      .mockResolvedValueOnce([[]]);  // artifacts with image_url

    const result = await attachmentService.listReferences(1);

    expect(result.total).toBe(1);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].name).toBe('青铜器');
    expect(result.artifacts[0].relationType).toBe('image');
  });

  it('should return chat references from attachment_refs table', async () => {
    mysqlPool.execute
      .mockResolvedValueOnce([[
        { owner_type: 'chat', owner_id: 50, relation_type: 'attachment', created_at: '2024-01-02' }
      ]])  // attachment_refs
      .mockResolvedValueOnce([[
        { id: 50, user_id: 1, created_at: '2024-01-02' }
      ]])  // chat details
      .mockResolvedValueOnce([[{ owner_type: null, owner_id: null }]])  // attachments owner
      .mockResolvedValueOnce([[{ id: 1 }]])  // attachment exists
      .mockResolvedValueOnce([[]]);  // artifacts with image_url

    const result = await attachmentService.listReferences(1);

    expect(result.total).toBe(1);
    expect(result.chats).toHaveLength(1);
    expect(result.chats[0].id).toBe(50);
    expect(result.chats[0].relationType).toBe('attachment');
  });

  it('should include owner from attachments table', async () => {
    mysqlPool.execute
      .mockResolvedValueOnce([[]])  // attachment_refs empty
      .mockResolvedValueOnce([[{ owner_type: 'artifact', owner_id: 200 }]])  // attachments owner
      .mockResolvedValueOnce([[
        { id: 200, name: '玉器', category: '玉石', era: '周代' }
      ]])  // artifact details
      .mockResolvedValueOnce([[{ id: 1 }]])  // attachment exists
      .mockResolvedValueOnce([[]]);  // artifacts with image_url

    const result = await attachmentService.listReferences(1);

    expect(result.total).toBe(1);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].name).toBe('玉器');
    expect(result.artifacts[0].relationType).toBe('owner');
  });

  it('should find artifacts referencing via image_url', async () => {
    mysqlPool.execute
      .mockResolvedValueOnce([[]])  // attachment_refs empty
      .mockResolvedValueOnce([[{ owner_type: null, owner_id: null }]])  // attachments owner
      .mockResolvedValueOnce([[{ id: 1 }]])  // attachment exists
      .mockResolvedValueOnce([[
        { id: 300, name: '陶器', category: '陶瓷', era: '汉代' }
      ]]);  // artifacts with image_url

    const result = await attachmentService.listReferences(1);

    expect(result.total).toBe(1);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].name).toBe('陶器');
    expect(result.artifacts[0].relationType).toBe('image_url');
  });

  it('should deduplicate references across sources', async () => {
    // 同一个 artifact 出现在 attachment_refs 和 owner
    mysqlPool.execute
      .mockResolvedValueOnce([[
        { owner_type: 'artifact', owner_id: 100, relation_type: 'image', created_at: '2024-01-01' }
      ]])  // attachment_refs
      .mockResolvedValueOnce([[
        { id: 100, name: '青铜器', category: '礼器', era: '商代' }
      ]])  // artifact details
      .mockResolvedValueOnce([[{ owner_type: 'artifact', owner_id: 100 }]])  // attachments owner (same artifact)
      .mockResolvedValueOnce([[{ id: 1 }]])  // attachment exists
      .mockResolvedValueOnce([[]]);  // artifacts with image_url

    const result = await attachmentService.listReferences(1);

    // 应该只有一条记录，不重复
    expect(result.total).toBe(1);
    expect(result.artifacts).toHaveLength(1);
  });

  it('should handle database errors gracefully', async () => {
    mysqlPool.execute
      .mockRejectedValueOnce(new Error('DB error'))  // attachment_refs fails
      .mockResolvedValueOnce([[{ owner_type: null, owner_id: null }]])  // attachments owner
      .mockResolvedValueOnce([[{ id: 1 }]])  // attachment exists
      .mockResolvedValueOnce([[]]);  // artifacts with image_url

    // 不应该抛出错误，应该返回空结果
    const result = await attachmentService.listReferences(1);

    expect(result).toBeDefined();
    expect(result.total).toBe(0);
  });
});

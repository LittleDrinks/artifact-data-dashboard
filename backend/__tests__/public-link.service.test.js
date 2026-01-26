/**
 * Public Link Service Unit Tests
 * @jest-environment node
 */

// 模拟依赖
jest.mock('uuid', () => ({
  v4: jest.fn(() => '12345678-1234-1234-1234-123456789012')
}));

jest.mock('../src/models/public_link.model');
jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

const PublicLinkModel = require('../src/models/public_link.model');
const publicLinkService = require('../src/services/public-link.service');

describe('PublicLinkService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createLink', () => {
    it('should create a new public link with generated token', async () => {
      const mockLink = {
        id: 1,
        attachment_id: 100,
        token: '1234567812341234123412345678901223',
        created_by: 1
      };
      PublicLinkModel.create.mockResolvedValue(1);
      PublicLinkModel.findById.mockResolvedValue(mockLink);

      const result = await publicLinkService.createLink({ attachmentId: 100 }, 1);

      expect(PublicLinkModel.create).toHaveBeenCalled();
      expect(result.url).toContain('/public/');
    });

    it('should create link with expiration date', async () => {
      const expiresAt = '2025-12-31T23:59:59Z';
      const mockLink = { id: 1, token: 'abc123', expires_at: expiresAt };
      PublicLinkModel.create.mockResolvedValue(1);
      PublicLinkModel.findById.mockResolvedValue(mockLink);

      await publicLinkService.createLink({ attachmentId: 100, expiresAt }, 1);

      expect(PublicLinkModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ expires_at: expiresAt })
      );
    });

    it('should create link with download limit', async () => {
      const mockLink = { id: 1, token: 'abc123', max_downloads: 10 };
      PublicLinkModel.create.mockResolvedValue(1);
      PublicLinkModel.findById.mockResolvedValue(mockLink);

      await publicLinkService.createLink({ attachmentId: 100, maxDownloads: 10 }, 1);

      expect(PublicLinkModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ max_downloads: 10 })
      );
    });

    it('should create link with password', async () => {
      const mockLink = { id: 1, token: 'abc123', password: 'secret' };
      PublicLinkModel.create.mockResolvedValue(1);
      PublicLinkModel.findById.mockResolvedValue(mockLink);

      await publicLinkService.createLink({ attachmentId: 100, password: 'secret' }, 1);

      expect(PublicLinkModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ password: 'secret' })
      );
    });
  });

  describe('validateAndAccess', () => {
    it('should validate and allow access for valid link', async () => {
      const mockLink = {
        id: 1,
        token: 'validtoken',
        attachment_id: 100,
        is_revoked: false,
        expires_at: null,
        max_downloads: null,
        download_count: 0,
        password: null
      };
      PublicLinkModel.findByToken.mockResolvedValue(mockLink);
      PublicLinkModel.logAccess.mockResolvedValue(true);
      PublicLinkModel.incrementAccessCount.mockResolvedValue(true);

      const result = await publicLinkService.validateAndAccess(
        'validtoken', null, '127.0.0.1', 'TestAgent'
      );

      expect(result.valid).toBe(true);
      expect(result.attachmentId).toBe(100);
      expect(PublicLinkModel.logAccess).toHaveBeenCalledWith(1, '127.0.0.1', 'TestAgent');
      expect(PublicLinkModel.incrementAccessCount).toHaveBeenCalledWith(1);
    });

    it('should reject revoked link', async () => {
      const mockLink = { id: 1, is_revoked: true };
      PublicLinkModel.findByToken.mockResolvedValue(mockLink);

      await expect(publicLinkService.validateAndAccess('revokedtoken', null, '', ''))
        .rejects.toThrow('该链接已被撤销');
    });

    it('should reject expired link', async () => {
      const mockLink = {
        id: 1,
        is_revoked: false,
        expires_at: '2020-01-01T00:00:00Z' // 过期时间
      };
      PublicLinkModel.findByToken.mockResolvedValue(mockLink);

      await expect(publicLinkService.validateAndAccess('expiredtoken', null, '', ''))
        .rejects.toThrow('该链接已过期');
    });

    it('should reject link that exceeded max downloads', async () => {
      const mockLink = {
        id: 1,
        is_revoked: false,
        expires_at: null,
        max_downloads: 5,
        download_count: 5
      };
      PublicLinkModel.findByToken.mockResolvedValue(mockLink);

      await expect(publicLinkService.validateAndAccess('maxedtoken', null, '', ''))
        .rejects.toThrow('该链接已达到最大下载次数');
    });

    it('should reject wrong password', async () => {
      const mockLink = {
        id: 1,
        is_revoked: false,
        expires_at: null,
        max_downloads: null,
        download_count: 0,
        password: 'correctpassword'
      };
      PublicLinkModel.findByToken.mockResolvedValue(mockLink);

      await expect(publicLinkService.validateAndAccess('pwtoken', 'wrongpassword', '', ''))
        .rejects.toThrow('访问密码错误');
    });

    it('should accept correct password', async () => {
      const mockLink = {
        id: 1,
        token: 'pwtoken',
        attachment_id: 100,
        is_revoked: false,
        expires_at: null,
        max_downloads: null,
        download_count: 0,
        password: 'correctpassword'
      };
      PublicLinkModel.findByToken.mockResolvedValue(mockLink);
      PublicLinkModel.logAccess.mockResolvedValue(true);
      PublicLinkModel.incrementAccessCount.mockResolvedValue(true);

      const result = await publicLinkService.validateAndAccess(
        'pwtoken', 'correctpassword', '127.0.0.1', 'TestAgent'
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('revokeLink', () => {
    it('should revoke existing link', async () => {
      const mockLink = { id: 1, token: 'abc123' };
      PublicLinkModel.findById.mockResolvedValue(mockLink);
      PublicLinkModel.revoke.mockResolvedValue(true);

      await publicLinkService.revokeLink(1);

      expect(PublicLinkModel.revoke).toHaveBeenCalledWith(1);
    });

    it('should throw 404 for non-existent link', async () => {
      PublicLinkModel.findById.mockResolvedValue(null);

      await expect(publicLinkService.revokeLink(999))
        .rejects.toThrow('链接不存在');
    });
  });

  describe('getAccessLogs', () => {
    it('should return access logs for link', async () => {
      const mockLink = { id: 1 };
      const mockLogs = [
        { id: 1, ip_address: '127.0.0.1', accessed_at: '2024-01-01' },
        { id: 2, ip_address: '192.168.1.1', accessed_at: '2024-01-02' }
      ];
      PublicLinkModel.findById.mockResolvedValue(mockLink);
      PublicLinkModel.getAccessLogs.mockResolvedValue(mockLogs);

      const result = await publicLinkService.getAccessLogs(1);

      expect(result).toEqual(mockLogs);
    });
  });
});

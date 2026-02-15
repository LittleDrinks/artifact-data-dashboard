/**
 * Folder Routes - 文件夹管理 API 路由
 * @module routes/folder
 */
const express = require('express');
const router = express.Router();
const folderService = require('../services/core/folder.service');
const { authMiddleware } = require('../middleware/auth.middleware');

// 所有路由都需要认证
router.use(authMiddleware);

/**
 * GET /api/folders
 * 获取文件夹树
 */
router.get('/', async (req, res) => {
  try {
    const flat = req.query.flat === 'true';
    const folders = await folderService.getFolderTree({ flat });
    res.json({ data: folders });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/folders
 * 创建文件夹
 */
router.post('/', async (req, res) => {
  try {
    const { name, parentId } = req.body;
    const createdBy = req.user.id;
    
    const folder = await folderService.createFolder({
      name,
      parentId: parentId || null,
      createdBy
    });
    
    res.status(201).json(folder);
  } catch (error) {
    if (error.message.includes('已存在') || error.message.includes('不能为空')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/folders/:id
 * 获取文件夹详情
 */
router.get('/:id', async (req, res) => {
  try {
    const folder = await folderService.getFolderById(parseInt(req.params.id, 10));
    res.json(folder);
  } catch (error) {
    if (error.message === '文件夹不存在') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/folders/:id
 * 更新文件夹（重命名）
 */
router.put('/:id', async (req, res) => {
  try {
    const { name } = req.body;
    const folder = await folderService.updateFolder(parseInt(req.params.id, 10), { name });
    res.json(folder);
  } catch (error) {
    if (error.message === '文件夹不存在') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.includes('已存在') || error.message.includes('不能为空')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/folders/:id
 * 删除文件夹
 */
router.delete('/:id', async (req, res) => {
  try {
    const result = await folderService.deleteFolder(parseInt(req.params.id, 10));
    res.json(result);
  } catch (error) {
    if (error.message === '文件夹不存在') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/folders/:id/move
 * 移动文件夹
 */
router.put('/:id/move', async (req, res) => {
  try {
    const { parentId } = req.body;
    const folder = await folderService.moveFolder(
      parseInt(req.params.id, 10),
      parentId === undefined ? null : parentId
    );
    res.json(folder);
  } catch (error) {
    if (error.message === '文件夹不存在' || error.message === '目标文件夹不存在') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.includes('不能') || error.message.includes('已存在')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/folders/:id/files
 * 获取文件夹内的文件
 */
router.get('/:id/files', async (req, res) => {
  try {
    const folderId = req.params.id === 'root' ? null : parseInt(req.params.id, 10);
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
    const tagIds = req.query.tagIds 
      ? req.query.tagIds.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id))
      : [];
    
    const result = await folderService.getFolderFiles(folderId, { page, limit, tagIds });
    res.json(result);
  } catch (error) {
    if (error.message === '文件夹不存在') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

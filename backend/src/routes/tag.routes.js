/**
 * 标签路由
 * 提供标签管理的 REST API 端点
 */
const express = require('express');
const router = express.Router();
const tagService = require('../services/tag.service');
const { authMiddleware } = require('../middleware/auth.middleware');
const logger = require('../config/logger');

/**
 * 获取所有标签
 * GET /api/tags
 * Query:
 *   - includeStats: boolean - 是否包含使用统计
 */
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const includeStats = req.query.includeStats === 'true';
    const tags = await tagService.getAllTags({ includeStats });
    res.json(tags);
  } catch (error) {
    logger.error('Failed to get tags:', error);
    next(error);
  }
});

/**
 * 创建标签
 * POST /api/tags
 * Body:
 *   - name: string - 标签名称
 *   - color: string - 标签颜色（十六进制）
 */
router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { name, color } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: '标签名称不能为空' });
    }

    const tag = await tagService.createTag({ name: name.trim(), color }, req.user.id);
    res.status(201).json(tag);
  } catch (error) {
    if (error.status === 409) {
      return res.status(409).json({ error: error.message });
    }
    logger.error('Failed to create tag:', error);
    next(error);
  }
});

/**
 * 获取单个标签
 * GET /api/tags/:id
 */
router.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    const tagId = parseInt(req.params.id, 10);
    if (isNaN(tagId)) {
      return res.status(400).json({ error: '无效的标签ID' });
    }

    const tag = await tagService.getTagById(tagId);
    res.json(tag);
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ error: error.message });
    }
    logger.error('Failed to get tag:', error);
    next(error);
  }
});

/**
 * 更新标签
 * PUT /api/tags/:id
 * Body:
 *   - name: string - 标签名称
 *   - color: string - 标签颜色
 */
router.put('/:id', authMiddleware, async (req, res, next) => {
  try {
    const tagId = parseInt(req.params.id, 10);
    if (isNaN(tagId)) {
      return res.status(400).json({ error: '无效的标签ID' });
    }

    const { name, color } = req.body;
    const tag = await tagService.updateTag(tagId, { name: name?.trim(), color });
    res.json(tag);
  } catch (error) {
    if (error.status === 404 || error.status === 409) {
      return res.status(error.status).json({ error: error.message });
    }
    logger.error('Failed to update tag:', error);
    next(error);
  }
});

/**
 * 删除标签
 * DELETE /api/tags/:id
 */
router.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    const tagId = parseInt(req.params.id, 10);
    if (isNaN(tagId)) {
      return res.status(400).json({ error: '无效的标签ID' });
    }

    await tagService.deleteTag(tagId);
    res.status(204).send();
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ error: error.message });
    }
    logger.error('Failed to delete tag:', error);
    next(error);
  }
});

/**
 * 获取文件的标签
 * GET /api/tags/file/:attachmentId
 */
router.get('/file/:attachmentId', authMiddleware, async (req, res, next) => {
  try {
    const attachmentId = parseInt(req.params.attachmentId, 10);
    if (isNaN(attachmentId)) {
      return res.status(400).json({ error: '无效的附件ID' });
    }

    const tags = await tagService.getFileTags(attachmentId);
    res.json(tags);
  } catch (error) {
    logger.error('Failed to get file tags:', error);
    next(error);
  }
});

/**
 * 给文件添加标签
 * POST /api/tags/file/:attachmentId
 * Body:
 *   - tagId: number - 标签ID
 */
router.post('/file/:attachmentId', authMiddleware, async (req, res, next) => {
  try {
    const attachmentId = parseInt(req.params.attachmentId, 10);
    const { tagId } = req.body;

    if (isNaN(attachmentId)) {
      return res.status(400).json({ error: '无效的附件ID' });
    }
    if (!tagId) {
      return res.status(400).json({ error: '标签ID不能为空' });
    }

    await tagService.addTagToFile(attachmentId, tagId, req.user.id);
    res.status(201).json({ success: true, message: '标签已添加' });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ error: error.message });
    }
    logger.error('Failed to add tag to file:', error);
    next(error);
  }
});

/**
 * 从文件移除标签
 * DELETE /api/tags/file/:attachmentId/:tagId
 */
router.delete('/file/:attachmentId/:tagId', authMiddleware, async (req, res, next) => {
  try {
    const attachmentId = parseInt(req.params.attachmentId, 10);
    const tagId = parseInt(req.params.tagId, 10);

    if (isNaN(attachmentId) || isNaN(tagId)) {
      return res.status(400).json({ error: '无效的ID' });
    }

    await tagService.removeTagFromFile(attachmentId, tagId);
    res.status(204).send();
  } catch (error) {
    logger.error('Failed to remove tag from file:', error);
    next(error);
  }
});

module.exports = router;

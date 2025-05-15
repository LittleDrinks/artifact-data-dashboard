const express = require('express');
const nodejieba = require('nodejieba');
const { mysqlPool } = require('../config/database');

const router = express.Router();

/**
 * @swagger
 * /api/wordcloud/analyze:
 *   get:
 *     summary: 获取词云分析数据
 *     tags: [Wordcloud]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: 按类别筛选
 *       - in: query
 *         name: era
 *         schema:
 *           type: string
 *         description: 按年代筛选
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: 返回词数量限制
 *     responses:
 *       200:
 *         description: 返回词云数据
 */
router.get('/analyze', async (req, res) => {
  try {
    const { category, era } = req.query;
    const limit = parseInt(req.query.limit) || 100;
    
    // 构建查询
    let query = `
      SELECT name, description, tags 
      FROM artifacts 
      WHERE 1=1
    `;
    let params = [];
    
    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    
    if (era) {
      query += ' AND era = ?';
      params.push(era);
    }
    
    // 执行查询
    const [artifacts] = await mysqlPool.execute(query, params);
    
    // 合并所有文本
    let allText = '';
    for (const artifact of artifacts) {
      allText += artifact.name + ' ' + artifact.description + ' ' + (artifact.tags || '');
    }    
    // 使用jieba分词
    const words = nodejieba.cut(allText);
    // 计算词频
    const wordFrequency = {};
    const stopWords = new Set(['的', '了', '和', '在', '是', '与', '为', '等', '这', '那', '有', '它']);
    
    for (const word of words) {
      // 过滤掉停用词和单个字符
      if (word.length < 2 || stopWords.has(word)) {
        continue;
      }
      
      wordFrequency[word] = (wordFrequency[word] || 0) + 1;
    }
    
    // 转换为词云数据格式并排序
    const wordcloudData = Object.entries(wordFrequency)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
    
    res.status(200).json({
      wordcloudData,
      meta: {
        category,
        era,
        totalWords: words.length,
        uniqueWords: Object.keys(wordFrequency).length
      }
    });
  } catch (error) {
    console.error('词云分析错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /api/wordcloud/categories:
 *   get:
 *     summary: 获取各类别文物的词云数据
 *     tags: [Wordcloud]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 返回各类别词云数据
 */
router.get('/categories', async (req, res) => {
  try {
    // 获取所有类别
    const [categories] = await mysqlPool.execute(
      'SELECT DISTINCT category FROM artifacts'
    );
    
    const result = {};
    
    // 为每个类别生成词云数据
    for (const { category } of categories) {
      // 获取该类别的文物
      const [artifacts] = await mysqlPool.execute(
        'SELECT name, description, tags FROM artifacts WHERE category = ?',
        [category]
      );
      
      // 合并所有文本
      let allText = '';
      for (const artifact of artifacts) {
        allText += artifact.name + ' ' + artifact.description + ' ' + (artifact.tags || '');
      }      
      // 分词
      const words = nodejieba.cut(allText);
      // 计算词频
      const wordFrequency = {};
      const stopWords = new Set(['的', '了', '和', '在', '是', '与', '为', '等', '这', '那', '有', '它']);
      
      for (const word of words) {
        if (word.length < 2 || stopWords.has(word)) {
          continue;
        }
        
        wordFrequency[word] = (wordFrequency[word] || 0) + 1;
      }
      
      // 转换为词云数据格式并排序
      result[category] = Object.entries(wordFrequency)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 50); // 每个类别限制50个词
    }
    
    res.status(200).json(result);
  } catch (error) {
    console.error('获取类别词云错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

module.exports = router;

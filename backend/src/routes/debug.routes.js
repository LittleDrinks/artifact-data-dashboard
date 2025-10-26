const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { mysqlPool } = require('../config/database');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

const SUPPORTED_TABLES = ['artifacts'];

const parseBoolean = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['1', 'true', 'yes', 'y', '是'].includes(normalized);
  }
  return false;
};

const normaliseTags = (value) => {
  if (Array.isArray(value)) {
    return value.join(',');
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
};

router.get('/export', async (req, res, next) => {
  const table = req.query.table || 'artifacts';

  if (!SUPPORTED_TABLES.includes(table)) {
    return res.status(400).json({ message: '暂不支持导出该数据表' });
  }

  try {
    const [rows] = await mysqlPool.query(`SELECT * FROM ${table}`);

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, table);

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

    res.setHeader('Content-Disposition', `attachment; filename=${table}-${Date.now()}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
});

router.post('/import', upload.single('file'), async (req, res, next) => {
  const table = req.body.table || 'artifacts';

  if (!SUPPORTED_TABLES.includes(table)) {
    return res.status(400).json({ message: '暂不支持导入该数据表' });
  }

  if (!req.file) {
    return res.status(400).json({ message: '请上传Excel文件' });
  }

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

    if (!rows.length) {
      return res.status(400).json({ message: 'Excel文件为空或无法解析' });
    }

    const connection = await mysqlPool.getConnection();

    try {
      await connection.beginTransaction();

      let inserted = 0;
      let updated = 0;

      for (const row of rows) {
        const normalized = {
          name: row.name || row.名称 || '',
          description: row.description || row.描述 || '',
          category: row.category || row.类别 || null,
          era: row.era || row.年代 || null,
          location: row.location || row.地点 || null,
          image_url: row.image_url || row.imageUrl || row.图片 || null,
          tags: normaliseTags(row.tags || row.标签),
          is_cataloged: parseBoolean(row.is_cataloged ?? row.已入藏 ?? row.已編目 ?? row.已编目),
          is_digitized: parseBoolean(row.is_digitized ?? row.已数字化 ?? row.已數字化),
          needs_repair: parseBoolean(row.needs_repair ?? row.需修复 ?? row.需修復)
        };

        const id = row.id || row.ID || row.Id;

        if (id) {
          const [result] = await connection.query(
            `INSERT INTO artifacts (id, name, description, category, era, location, image_url, tags, is_cataloged, is_digitized, needs_repair)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               name = VALUES(name),
               description = VALUES(description),
               category = VALUES(category),
               era = VALUES(era),
               location = VALUES(location),
               image_url = VALUES(image_url),
               tags = VALUES(tags),
               is_cataloged = VALUES(is_cataloged),
               is_digitized = VALUES(is_digitized),
               needs_repair = VALUES(needs_repair)` ,
            [
              id,
              normalized.name,
              normalized.description,
              normalized.category,
              normalized.era,
              normalized.location,
              normalized.image_url,
              normalized.tags,
              normalized.is_cataloged,
              normalized.is_digitized,
              normalized.needs_repair
            ]
          );
          if (result.affectedRows === 1) {
            inserted += 1;
          } else {
            updated += 1;
          }
        } else {
          await connection.query(
            `INSERT INTO artifacts (name, description, category, era, location, image_url, tags, is_cataloged, is_digitized, needs_repair)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
            [
              normalized.name,
              normalized.description,
              normalized.category,
              normalized.era,
              normalized.location,
              normalized.image_url,
              normalized.tags,
              normalized.is_cataloged,
              normalized.is_digitized,
              normalized.needs_repair
            ]
          );
          inserted += 1;
        }
      }

      await connection.commit();

      return res.json({
        message: '导入成功',
        total: rows.length,
        inserted,
        updated
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    return next(error);
  }
});

module.exports = router;

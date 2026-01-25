const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const neo4j = require('neo4j-driver');
const { mysqlPool, neo4jDriver } = require('../config/database');
const { GRAPH_NODE_EXPORTS, GRAPH_REL_EXPORTS, EXCEL_SCHEMA } = require('../config/excel-schema');
const { authMiddleware } = require('../middleware/auth.middleware');
const { createLogger } = require('../utils/logger');

const logger = createLogger('DebugRoutes');
const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

// 仅限管理员访问调试接口
router.use(authMiddleware);
router.use((req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: '需要管理员权限' });
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

const MAX_UNSIGNED_BIGINT = BigInt('18446744073709551615');

const ensureArtifactsTable = async (connection) => {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS artifacts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
      description TEXT COLLATE utf8mb4_unicode_ci,
      category VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      era VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      location VARCHAR(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      image_url VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      tags TEXT COLLATE utf8mb4_unicode_ci,
      is_cataloged TINYINT(1) DEFAULT 0,
      is_digitized TINYINT(1) DEFAULT 0,
      needs_repair TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      FULLTEXT KEY idx_artifact_fulltext (name, description, tags),
      FULLTEXT KEY name (name, description, tags)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [columns] = await connection.query(`
    SELECT DATA_TYPE, COLUMN_TYPE
    FROM information_schema.COLUMNS
    WHERE table_schema = DATABASE()
      AND table_name = 'artifacts'
      AND column_name = 'id'
  `);

  const columnInfo = columns && columns[0];
  if (columnInfo && columnInfo.DATA_TYPE !== 'bigint') {
    await connection.query(`
      ALTER TABLE artifacts
      MODIFY id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT
    `);
  }
};

const normalizeNumericId = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  const raw = String(value).trim();
  if (!raw || !/^\d+$/.test(raw)) {
    return null;
  }
  try {
    const candidate = BigInt(raw);
    if (candidate < 1n || candidate > MAX_UNSIGNED_BIGINT) {
      return null;
    }
    return raw;
  } catch (err) {
    return null;
  }
};

const toSheetNameMap = (workbook) => {
  return workbook.SheetNames.reduce((acc, sheetName) => {
    acc[sheetName.toLowerCase()] = sheetName;
    return acc;
  }, {});
};

const pickValue = (row, candidates) => {
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const raw = row[key];
      if (raw === null || raw === undefined) {
        continue;
      }
      if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed) {
          return trimmed;
        }
      } else if (raw !== '') {
        return raw;
      }
    }
  }
  return null;
};

const buildRelationMap = (rows, keyCandidates, valueCandidates) => {
  const map = new Map();
  for (const row of rows) {
    const key = pickValue(row, keyCandidates);
    const value = pickValue(row, valueCandidates);
    if (!key || !value || map.has(String(key))) {
      continue;
    }
    map.set(String(key), value);
  }
  return map;
};

const getWorksheetHeaderRow = (worksheet) => {
  const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (!Array.isArray(matrix) || matrix.length === 0) {
    return [];
  }
  return (matrix[0] || []).map(cell => String(cell ?? '').trim());
};

const validateWorkbookSchema = (workbook) => {
  const sheetNameMap = toSheetNameMap(workbook);
  const issues = {
    missingSheets: [],
    sheets: {}
  };

  const expectedSheets = [...EXCEL_SCHEMA.nodes, ...EXCEL_SCHEMA.relations];

  for (const expected of expectedSheets) {
    const resolvedName = sheetNameMap[expected.sheet.toLowerCase()];
    if (!resolvedName) {
      issues.missingSheets.push(expected.sheet);
      continue;
    }

    const worksheet = workbook.Sheets[resolvedName];
    const actualHeaders = getWorksheetHeaderRow(worksheet);
    const expectedHeaders = expected.headers;

    const missingColumns = expectedHeaders.filter((h) => !actualHeaders.includes(h));
    const extraColumns = actualHeaders.filter((h) => h && !expectedHeaders.includes(h));
    const sameOrder =
      actualHeaders.length === expectedHeaders.length &&
      expectedHeaders.every((h, idx) => actualHeaders[idx] === h);

    if (missingColumns.length || extraColumns.length || !sameOrder) {
      issues.sheets[expected.sheet] = {
        expected: expectedHeaders,
        actual: actualHeaders,
        missingColumns,
        extraColumns,
        orderMatches: sameOrder
      };
    }
  }

  const hasErrors =
    issues.missingSheets.length > 0 ||
    Object.keys(issues.sheets).length > 0;

  return { ok: !hasErrors, issues };
};

const splitTagValues = (value) => {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value
      .map(item => (typeof item === 'string' ? item.trim() : String(item)))
      .filter(Boolean);
  }
  return String(value)
    .split(/[,;，；\n\r\t]+/)
    .map(tag => tag.trim())
    .filter(Boolean);
};

const syncArtifactsToNeo4j = async () => {
  const [artifactRows] = await mysqlPool.query(`
    SELECT id, name, description, category, era, location, image_url, tags,
           is_cataloged, is_digitized, needs_repair
    FROM artifacts
  `);

  const artifacts = artifactRows.map(row => {
    const mysqlId = row.id != null ? String(row.id) : null;
    return {
      id: mysqlId ? `artifact-${mysqlId}` : `artifact-${Date.now()}-${Math.random()}`,
      mysqlId,
      name: row.name || (mysqlId ? `文物-${mysqlId}` : '未命名文物'),
      description: row.description || '',
      tags: splitTagValues(row.tags),
      isCataloged: !!row.is_cataloged,
      isDigitized: !!row.is_digitized,
      needsRepair: !!row.needs_repair,
      imageUrl: row.image_url || null,
      category: row.category || null,
      era: row.era || null,
      location: row.location || null
    };
  });

  artifacts.forEach((artifact, index) => {
    const baseName = artifact.name || `未命名文物-${artifact.mysqlId || index + 1}`;
    artifact.displayName = baseName;
    artifact.name = baseName;
  });

  const duplicateBuckets = new Map();
  artifacts.forEach(artifact => {
    const key = artifact.displayName;
    if (!duplicateBuckets.has(key)) {
      duplicateBuckets.set(key, []);
    }
    duplicateBuckets.get(key).push(artifact);
  });

  duplicateBuckets.forEach((bucket) => {
    if (bucket.length <= 1) {
      return;
    }
    bucket.forEach((artifact, idx) => {
      const suffix = artifact.mysqlId || `${idx + 1}`;
      artifact.name = `${artifact.displayName} (#${suffix})`;
    });
  });

  const categoryRelations = [];
  const eraRelations = [];
  const locationRelations = [];
  const tagRelations = [];

  artifacts.forEach(artifact => {
    if (artifact.category) {
      categoryRelations.push({ artifactId: artifact.id, name: artifact.category });
    }
    if (artifact.era) {
      eraRelations.push({ artifactId: artifact.id, name: artifact.era });
    }
    if (artifact.location) {
      locationRelations.push({ artifactId: artifact.id, name: artifact.location });
    }
    if (artifact.tags.length) {
      artifact.tags.forEach(tag => {
        tagRelations.push({ artifactId: artifact.id, name: tag });
      });
    }
  });

  const session = neo4jDriver.session();
  const tx = session.beginTransaction();

  try {
    await tx.run(`
      MATCH (n)
      WHERE n:Artifact OR n:Category OR n:Era OR n:Location OR n:Tag
      DETACH DELETE n
    `);

    if (artifacts.length) {
      await tx.run(
        `
          UNWIND $artifacts AS data
          MERGE (a:Artifact {id: data.id})
          SET a.name = data.name,
              a.description = data.description,
              a.tags = data.tags,
              a.isCataloged = data.isCataloged,
              a.isDigitized = data.isDigitized,
              a.needsRepair = data.needsRepair,
              a.imageUrl = data.imageUrl,
              a.mysqlId = data.mysqlId,
              a.category = data.category,
              a.era = data.era,
              a.location = data.location,
              a.displayName = data.displayName,
              a.searchName = data.displayName,
              a.syncedAt = datetime()
        `,
        { artifacts }
      );
    }

    if (categoryRelations.length) {
      await tx.run(
        `
          UNWIND $relations AS rel
          MATCH (a:Artifact {id: rel.artifactId})
          MERGE (c:Category {name: rel.name})
          MERGE (a)-[:HAS_CATEGORY]->(c)
        `,
        { relations: categoryRelations }
      );
    }

    if (eraRelations.length) {
      await tx.run(
        `
          UNWIND $relations AS rel
          MATCH (a:Artifact {id: rel.artifactId})
          MERGE (e:Era {name: rel.name})
          MERGE (a)-[:BELONGS_TO_ERA]->(e)
        `,
        { relations: eraRelations }
      );
    }

    if (locationRelations.length) {
      await tx.run(
        `
          UNWIND $relations AS rel
          MATCH (a:Artifact {id: rel.artifactId})
          MERGE (l:Location {name: rel.name})
          MERGE (a)-[:STORED_AT]->(l)
        `,
        { relations: locationRelations }
      );
    }

    if (tagRelations.length) {
      await tx.run(
        `
          UNWIND $relations AS rel
          MATCH (a:Artifact {id: rel.artifactId})
          MERGE (t:Tag {name: rel.name})
          MERGE (a)-[:HAS_TAG]->(t)
        `,
        { relations: tagRelations }
      );
    }

    await tx.commit();
    logger.info(`Neo4j同步完成: ${artifacts.length} 条文物节点, ${categoryRelations.length} 条类别关系, ${eraRelations.length} 条年代关系, ${locationRelations.length} 条地点关系, ${tagRelations.length} 条标签关系。`);
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    await session.close();
  }
};

// Graph export definitions describe each worksheet we want to produce.
// Moved to config/excel-schema.js

const safeSheetName = (name) => {
  const cleaned = name.replace(/[\\/?*\[\]:]/g, '_').trim();
  if (!cleaned) {
    return 'Sheet';
  }
  return cleaned.length > 31 ? cleaned.slice(0, 31) : cleaned;
};

const toNativeValue = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (neo4j.isInt(value)) {
    if (typeof value.inSafeRange === 'function' && !value.inSafeRange()) {
      return value.toString();
    }
    return value.toNumber();
  }
  if (Array.isArray(value)) {
    return value.map(item => toNativeValue(item));
  }
  return value;
};

const formatExportValue = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.map(item => formatExportValue(item)).join('; ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value;
};

const mapRecordToRow = (record, headers) => {
  const row = {};
  headers.forEach(header => {
    const raw = record.has(header) ? record.get(header) : null;
    row[header] = formatExportValue(toNativeValue(raw));
  });
  return row;
};

const runStructuredQuery = async (session, config) => {
  const result = await session.run(config.query);
  return result.records.map(record => mapRecordToRow(record, config.headers));
};

const buildWorksheet = (rows, headers) => {
  if (!rows.length) {
    return XLSX.utils.aoa_to_sheet([headers]);
  }
  return XLSX.utils.json_to_sheet(rows, { header: headers });
};

router.get('/export', async (req, res, next) => {
  const table = req.query.table || 'artifacts';

  if (!SUPPORTED_TABLES.includes(table)) {
    return res.status(400).json({ message: '暂不支持导出该数据表' });
  }

  const session = neo4jDriver.session();

  try {
    const workbook = XLSX.utils.book_new();

    for (const config of GRAPH_NODE_EXPORTS) {
      const rows = await runStructuredQuery(session, config);
      const worksheet = buildWorksheet(rows, config.headers);
      XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(config.sheet));
    }

    for (const config of GRAPH_REL_EXPORTS) {
      const rows = await runStructuredQuery(session, config);
      const worksheet = buildWorksheet(rows, config.headers);
      XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(config.sheet));
    }

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

    res.setHeader('Content-Disposition', `attachment; filename=knowledge-graph-${Date.now()}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (error) {
    return next(error);
  } finally {
    await session.close();
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
    // Strict schema validation (sheet presence + exact column set + exact order)
    const validation = validateWorkbookSchema(workbook);
    if (!validation.ok) {
      return res.status(400).json({
        message: 'Excel schema 不匹配：请使用系统导出或按固定 schema 生成的文件',
        issues: validation.issues
      });
    }

    const sheetNameMap = toSheetNameMap(workbook);
    const getRowsByExpectedSheet = (expectedSheetName) => {
      const resolvedName = sheetNameMap[expectedSheetName.toLowerCase()];
      const worksheet = workbook.Sheets[resolvedName];
      return XLSX.utils.sheet_to_json(worksheet, { defval: null });
    };

    const rows = getRowsByExpectedSheet('Artifacts');
    if (!rows.length) {
      return res.status(400).json({ message: 'Artifacts sheet 为空或无法解析' });
    }

    const categoryMap = buildRelationMap(
      getRowsByExpectedSheet('REL_HAS_CATEGORY'),
      ['artifact_id'],
      ['category_name']
    );
    const eraMap = buildRelationMap(
      getRowsByExpectedSheet('REL_BELONGS_TO_ERA'),
      ['artifact_id'],
      ['era_name']
    );
    const locationMap = buildRelationMap(
      getRowsByExpectedSheet('REL_STORED_AT'),
      ['artifact_id'],
      ['location_name']
    );

    const connection = await mysqlPool.getConnection();
    let transactionStarted = false;
    let inserted = 0;
    let updated = 0;

    try {
      await ensureArtifactsTable(connection);
      await connection.beginTransaction();
      transactionStarted = true;

      await connection.query('DELETE FROM artifacts');
      await connection.query('ALTER TABLE artifacts AUTO_INCREMENT = 1');

      const processedKeys = new Set();

      for (const row of rows) {
        const artifactKey = pickValue(row, ['artifact_id']);
        const normalized = {
          name: pickValue(row, ['name']) || '',
          description: pickValue(row, ['description']) || '',
          category: artifactKey ? categoryMap.get(String(artifactKey)) : null,
          era: artifactKey ? eraMap.get(String(artifactKey)) : null,
          location: artifactKey ? locationMap.get(String(artifactKey)) : null,
          image_url: null,
          tags: normaliseTags(row.tags),
          is_cataloged: parseBoolean(row.isCataloged),
          is_digitized: parseBoolean(row.isDigitized),
          needs_repair: parseBoolean(row.needsRepair)
        };

        const id = artifactKey ? normalizeNumericId(artifactKey) : null;

        const dedupeKey = artifactKey
          ? `artifact:${artifactKey}`
          : normalized.name
            ? `name:${normalized.name}|${normalized.location || ''}|${normalized.era || ''}`
            : null;

        if (dedupeKey && processedKeys.has(dedupeKey)) {
          continue;
        }
        if (dedupeKey) {
          processedKeys.add(dedupeKey);
        }

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
      transactionStarted = false;
    } catch (error) {
      if (transactionStarted) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          logger.error('回滚导入事务失败:', rollbackError);
        }
      }
      throw error;
    } finally {
      connection.release();
    }

    try {
      await syncArtifactsToNeo4j();
    } catch (error) {
      logger.error('同步Neo4j数据失败:', error);
      return res.status(500).json({
        message: '数据已导入MySQL，但同步Neo4j失败',
        error: error.message
      });
    }

    return res.json({
      message: '导入成功',
      total: rows.length,
      inserted,
      updated,
      neo4jSynced: true
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;

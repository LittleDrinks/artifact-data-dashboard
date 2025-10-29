const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const neo4j = require('neo4j-driver');
const { mysqlPool, neo4jDriver } = require('../config/database');

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
    console.log(`Neo4j同步完成: ${artifacts.length} 条文物节点, ${categoryRelations.length} 条类别关系, ${eraRelations.length} 条年代关系, ${locationRelations.length} 条地点关系, ${tagRelations.length} 条标签关系。`);
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    await session.close();
  }
};

// Graph export definitions describe each worksheet we want to produce.
const GRAPH_NODE_EXPORTS = [
  {
    sheet: 'Artifacts',
    headers: ['artifact_id', 'name', 'description', 'tags', 'isCataloged', 'isDigitized', 'needsRepair'],
    query: `
      MATCH (a:Artifact)
      RETURN coalesce(a.id, toString(id(a))) AS artifact_id,
             a.name AS name,
             a.description AS description,
             a.tags AS tags,
             a.isCataloged AS isCataloged,
             a.isDigitized AS isDigitized,
             a.needsRepair AS needsRepair
      ORDER BY artifact_id
    `
  },
  {
    sheet: 'Categories',
    headers: ['name', 'description'],
    query: `
      MATCH (c:Category)
      RETURN c.name AS name,
             c.description AS description
      ORDER BY name
    `
  },
  {
    sheet: 'Eras',
    headers: ['name', 'startYear', 'endYear'],
    query: `
      MATCH (e:Era)
      RETURN e.name AS name,
             e.startYear AS startYear,
             e.endYear AS endYear
      ORDER BY startYear, name
    `
  },
  {
    sheet: 'Locations',
    headers: ['name', 'region', 'longitude', 'latitude'],
    query: `
      MATCH (l:Location)
      RETURN l.name AS name,
             l.region AS region,
             l.longitude AS longitude,
             l.latitude AS latitude
      ORDER BY name
    `
  },
  {
    sheet: 'Materials',
    headers: ['name', 'description'],
    query: `
      MATCH (m:Material)
      RETURN m.name AS name,
             m.description AS description
      ORDER BY name
    `
  },
  {
    sheet: 'Dimensions',
    headers: ['label', 'value', 'unit'],
    query: `
      MATCH (d:Dimension)
      RETURN d.label AS label,
             d.value AS value,
             d.unit AS unit
      ORDER BY label
    `
  },
  {
    sheet: 'DamageTypes',
    headers: ['name', 'severity', 'description'],
    query: `
      MATCH (dg:DamageType)
      RETURN dg.name AS name,
             dg.severity AS severity,
             dg.description AS description
      ORDER BY name
    `
  },
  {
    sheet: 'RestorationMethods',
    headers: ['name', 'description'],
    query: `
      MATCH (rm:RestorationMethod)
      RETURN rm.name AS name,
             rm.description AS description
      ORDER BY name
    `
  },
  {
    sheet: 'ReinforcementMethods',
    headers: ['name', 'description'],
    query: `
      MATCH (rf:ReinforcementMethod)
      RETURN rf.name AS name,
             rf.description AS description
      ORDER BY name
    `
  },
  {
    sheet: 'InspectionTechniques',
    headers: ['name', 'description'],
    query: `
      MATCH (it:InspectionTechnique)
      RETURN it.name AS name,
             it.description AS description
      ORDER BY name
    `
  },
  {
    sheet: 'ProtectiveMaterials',
    headers: ['name', 'description'],
    query: `
      MATCH (pm:ProtectiveMaterial)
      RETURN pm.name AS name,
             pm.description AS description
      ORDER BY name
    `
  },
  {
    sheet: 'InspectionMetrics',
    headers: ['name', 'unit', 'idealRange'],
    query: `
      MATCH (im:InspectionMetric)
      RETURN im.name AS name,
             im.unit AS unit,
             im.idealRange AS idealRange
      ORDER BY name
    `
  }
];

const GRAPH_REL_EXPORTS = [
  {
    sheet: 'REL_HAS_CATEGORY',
    headers: ['artifact_id', 'category_name'],
    query: `
      MATCH (a:Artifact)-[:HAS_CATEGORY]->(c:Category)
      RETURN coalesce(a.id, toString(id(a))) AS artifact_id,
             c.name AS category_name
      ORDER BY artifact_id, category_name
    `
  },
  {
    sheet: 'REL_BELONGS_TO_ERA',
    headers: ['artifact_id', 'era_name'],
    query: `
      MATCH (a:Artifact)-[:BELONGS_TO_ERA]->(e:Era)
      RETURN coalesce(a.id, toString(id(a))) AS artifact_id,
             e.name AS era_name
      ORDER BY artifact_id, era_name
    `
  },
  {
    sheet: 'REL_STORED_AT',
    headers: ['artifact_id', 'location_name'],
    query: `
      MATCH (a:Artifact)-[:STORED_AT]->(l:Location)
      RETURN coalesce(a.id, toString(id(a))) AS artifact_id,
             l.name AS location_name
      ORDER BY artifact_id, location_name
    `
  },
  {
    sheet: 'REL_MADE_OF',
    headers: ['artifact_id', 'material_name'],
    query: `
      MATCH (a:Artifact)-[:MADE_OF]->(m:Material)
      RETURN coalesce(a.id, toString(id(a))) AS artifact_id,
             m.name AS material_name
      ORDER BY artifact_id, material_name
    `
  },
  {
    sheet: 'REL_HAS_DIMENSION',
    headers: ['artifact_id', 'dimension_label'],
    query: `
      MATCH (a:Artifact)-[:HAS_DIMENSION]->(d:Dimension)
      RETURN coalesce(a.id, toString(id(a))) AS artifact_id,
             d.label AS dimension_label
      ORDER BY artifact_id, dimension_label
    `
  },
  {
    sheet: 'REL_HAS_DAMAGE',
    headers: ['artifact_id', 'damage_name'],
    query: `
      MATCH (a:Artifact)-[:HAS_DAMAGE]->(dg:DamageType)
      RETURN coalesce(a.id, toString(id(a))) AS artifact_id,
             dg.name AS damage_name
      ORDER BY artifact_id, damage_name
    `
  },
  {
    sheet: 'REL_USES_RESTORATION',
    headers: ['artifact_id', 'restoration_name'],
    query: `
      MATCH (a:Artifact)-[:USES_RESTORATION]->(rm:RestorationMethod)
      RETURN coalesce(a.id, toString(id(a))) AS artifact_id,
             rm.name AS restoration_name
      ORDER BY artifact_id, restoration_name
    `
  },
  {
    sheet: 'REL_USES_REINFORCEMENT',
    headers: ['artifact_id', 'reinforcement_name'],
    query: `
      MATCH (a:Artifact)-[:USES_REINFORCEMENT]->(rf:ReinforcementMethod)
      RETURN coalesce(a.id, toString(id(a))) AS artifact_id,
             rf.name AS reinforcement_name
      ORDER BY artifact_id, reinforcement_name
    `
  },
  {
    sheet: 'REL_INSPECTED_BY',
    headers: ['artifact_id', 'technique_name'],
    query: `
      MATCH (a:Artifact)-[:INSPECTED_BY]->(it:InspectionTechnique)
      RETURN coalesce(a.id, toString(id(a))) AS artifact_id,
             it.name AS technique_name
      ORDER BY artifact_id, technique_name
    `
  },
  {
    sheet: 'REL_PROTECTED_WITH',
    headers: ['artifact_id', 'protective_material_name'],
    query: `
      MATCH (a:Artifact)-[:PROTECTED_WITH]->(pm:ProtectiveMaterial)
      RETURN coalesce(a.id, toString(id(a))) AS artifact_id,
             pm.name AS protective_material_name
      ORDER BY artifact_id, protective_material_name
    `
  },
  {
    sheet: 'REL_MEASURED_BY',
    headers: ['artifact_id', 'metric_name'],
    query: `
      MATCH (a:Artifact)-[:MEASURED_BY]->(im:InspectionMetric)
      RETURN coalesce(a.id, toString(id(a))) AS artifact_id,
             im.name AS metric_name
      ORDER BY artifact_id, metric_name
    `
  }
];

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
    const sheetNameMap = toSheetNameMap(workbook);
    const getRows = (target) => {
      const resolvedName = sheetNameMap[target.toLowerCase()];
      if (!resolvedName) {
        return [];
      }
      const worksheet = workbook.Sheets[resolvedName];
      return XLSX.utils.sheet_to_json(worksheet, { defval: null });
    };

    const artifactRows = getRows('artifacts');
    const rows = artifactRows.length
      ? artifactRows
      : XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: null });

    if (!rows.length) {
      return res.status(400).json({ message: 'Excel文件为空或无法解析' });
    }

    const categoryMap = buildRelationMap(
      getRows('rel_has_category'),
      ['artifact_id', 'artifactId', 'artifactID', 'id', 'ID', 'Id'],
      ['category_name', 'categoryName', 'name']
    );
    const eraMap = buildRelationMap(
      getRows('rel_belongs_to_era'),
      ['artifact_id', 'artifactId', 'artifactID', 'id', 'ID', 'Id'],
      ['era_name', 'eraName', 'name']
    );
    const locationMap = buildRelationMap(
      getRows('rel_stored_at'),
      ['artifact_id', 'artifactId', 'artifactID', 'id', 'ID', 'Id'],
      ['location_name', 'locationName', 'name']
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
        const artifactKey = pickValue(row, ['artifact_id', 'artifactId', 'artifactID', 'id', 'ID', 'Id']);
        const normalized = {
          name: pickValue(row, ['name', '名称']) || '',
          description: pickValue(row, ['description', '描述']) || '',
          category:
            pickValue(row, ['category', '类别', 'category_name', 'categoryName']) ||
            (artifactKey ? categoryMap.get(String(artifactKey)) : null),
          era:
            pickValue(row, ['era', '年代', 'era_name', 'eraName']) ||
            (artifactKey ? eraMap.get(String(artifactKey)) : null),
          location:
            pickValue(row, ['location', '地点', 'location_name', 'locationName']) ||
            (artifactKey ? locationMap.get(String(artifactKey)) : null),
          image_url: pickValue(row, ['image_url', 'imageUrl', '图片']) || null,
          tags: normaliseTags(row.tags || row.标签),
          is_cataloged: parseBoolean(row.is_cataloged ?? row.已入藏 ?? row.已編目 ?? row.已编目),
          is_digitized: parseBoolean(row.is_digitized ?? row.已数字化 ?? row.已數字化),
          needs_repair: parseBoolean(row.needs_repair ?? row.需修复 ?? row.需修復)
        };

        let id = normalizeNumericId(pickValue(row, ['id', 'ID', 'Id']));
        if (!id && artifactKey) {
          id = normalizeNumericId(artifactKey);
        }

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
          console.error('回滚导入事务失败:', rollbackError);
        }
      }
      throw error;
    } finally {
      connection.release();
    }

    try {
      await syncArtifactsToNeo4j();
    } catch (error) {
      console.error('同步Neo4j数据失败:', error);
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

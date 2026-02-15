// MySQL 到 Neo4j 数据同步脚本
// 在 reset_data.bat 中 MySQL 初始化完成后调用

const { mysqlPool, neo4jDriver } = require('../src/config/database');
const { createLogger } = require('../src/utils/logger');

const logger = createLogger('SyncMySQLToNeo4j');

const MAX_UNSIGNED_BIGINT = BigInt('18446744073709551615');

const splitTagValues = (value) => {
	if (Array.isArray(value)) {
		return value.filter(Boolean);
	}
	if (typeof value !== 'string' || !value.trim()) {
		return [];
	}
	return value
		.split(/[,;]/)
		.map((s) => s.trim())
		.filter(Boolean);
};

const toNativeValue = (value) => {
	if (value === null || value === undefined) {
		return null;
	}
	const neo4j = require('neo4j-driver');
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

const syncArtifactsToNeo4j = async () => {
	logger.info('开始从 MySQL 同步数据到 Neo4j...');

	// 从 MySQL 读取文物数据
	const [artifactRows] = await mysqlPool.query(`
		SELECT id, name, description, category, era, location, image_url, tags,
				 is_cataloged, is_digitized, needs_repair
		FROM artifacts
	`);

	logger.info(`从 MySQL 读取到 ${artifactRows.length} 条文物记录`);

	if (artifactRows.length === 0) {
		logger.warn('MySQL 中没有文物数据，跳过同步');
		return { synced: 0 };
	}

	// 转换数据格式
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

	// 处理重复名称
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

	// 构建关系数据
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

	logger.info(`准备创建 ${artifacts.length} 个文物节点`);
	logger.info(`关系统计: 分类=${categoryRelations.length}, 时代=${eraRelations.length}, 位置=${locationRelations.length}, 标签=${tagRelations.length}`);

	// 写入 Neo4j
	const session = neo4jDriver.session();
	const tx = session.beginTransaction();

	try {
		// 清空现有的图谱数据
		logger.info('清空 Neo4j 中的现有数据...');
		await tx.run(`
			MATCH (n)
			WHERE n:Artifact OR n:Category OR n:Era OR n:Location OR n:Tag
			DETACH DELETE n
		`);

		// 创建文物节点
		if (artifacts.length) {
			logger.info('创建文物节点...');
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

		// 创建分类关系
		if (categoryRelations.length) {
			logger.info('创建分类关系...');
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

		// 创建时代关系
		if (eraRelations.length) {
			logger.info('创建时代关系...');
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

		// 创建位置关系
		if (locationRelations.length) {
			logger.info('创建位置关系...');
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

		// 创建标签关系
		if (tagRelations.length) {
			logger.info('创建标签关系...');
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
		logger.info('数据同步完成！');

		return {
			synced: artifacts.length,
			categories: categoryRelations.length,
			eras: eraRelations.length,
			locations: locationRelations.length,
			tags: tagRelations.length
		};
	} catch (error) {
		await tx.rollback();
		logger.error('同步失败，已回滚', { error: error.message });
		throw error;
	} finally {
		await session.close();
	}
};

// 主函数
const main = async () => {
	try {
		logger.info('========================================');
		logger.info('MySQL 到 Neo4j 数据同步脚本启动');
		logger.info('========================================');

		const result = await syncArtifactsToNeo4j();

		logger.info('----------------------------------------');
		logger.info('同步结果:');
		logger.info(`  - 文物节点: ${result.synced}`);
		logger.info(`  - 分类关系: ${result.categories || 0}`);
		logger.info(`  - 时代关系: ${result.eras || 0}`);
		logger.info(`  - 位置关系: ${result.locations || 0}`);
		logger.info(`  - 标签关系: ${result.tags || 0}`);
		logger.info('----------------------------------------');

		// 关闭连接
		await mysqlPool.end();
		await neo4jDriver.close();

		logger.info('脚本执行完成');
		process.exit(0);
	} catch (error) {
		logger.error('脚本执行失败:', error.message);
		console.error(error);

		// 尝试关闭连接
		try {
			await mysqlPool.end();
		} catch (e) {
			// ignore
		}
		try {
			await neo4jDriver.close();
		} catch (e) {
			// ignore
		}

		process.exit(1);
	}
};

// 执行
main();

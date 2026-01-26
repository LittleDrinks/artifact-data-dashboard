#!/usr/bin/env node
/**
 * 数据库迁移脚本运行器
 * 用法: node scripts/migrate.js [migration-file]
 * 示例: node scripts/migrate.js 004-dams-enhancement
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const log = (msg) => console.log(`[migrate] ${msg}`);
const error = (msg) => console.error(`[migrate] ERROR: ${msg}`);

const getConnection = async () => {
  return mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'artifact_dashboard',
    multipleStatements: true,
    charset: 'utf8mb4'
  });
};

const runMigration = async (filename) => {
  const filePath = path.join(MIGRATIONS_DIR, filename.endsWith('.sql') ? filename : `${filename}.sql`);
  
  if (!fs.existsSync(filePath)) {
    error(`迁移文件不存在: ${filePath}`);
    process.exit(1);
  }
  
  log(`运行迁移: ${path.basename(filePath)}`);
  
  const sql = fs.readFileSync(filePath, 'utf8');
  const conn = await getConnection();
  
  try {
    // 分割 SQL 语句（处理存储过程等复杂语句）
    const statements = sql
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const stmt of statements) {
      if (stmt.trim()) {
        try {
          await conn.query(stmt);
          log(`  ✓ 执行成功`);
        } catch (err) {
          // 某些错误可以忽略（如表/索引已存在）
          if (err.code === 'ER_TABLE_EXISTS_ERROR' || 
              err.code === 'ER_DUP_KEYNAME' ||
              err.code === 'ER_DUP_FIELDNAME' ||
              err.code === 'ER_DUP_KEY') {
            log(`  ⚠ 跳过（已存在）: ${err.message.substring(0, 50)}...`);
          } else {
            throw err;
          }
        }
      }
    }
    
    log(`迁移完成: ${path.basename(filePath)}`);
  } finally {
    await conn.end();
  }
};

const listMigrations = async () => {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
  
  log('可用的迁移文件:');
  files.forEach(f => log(`  - ${f}`));
  return files;
};

const runAllMigrations = async () => {
  const files = await listMigrations();
  log(`\n运行所有迁移 (${files.length} 个文件)...\n`);
  
  for (const file of files) {
    await runMigration(file);
    log('');
  }
  
  log('所有迁移完成！');
};

// 主入口
const main = async () => {
  const arg = process.argv[2];
  
  try {
    if (!arg || arg === '--all') {
      await runAllMigrations();
    } else if (arg === '--list') {
      await listMigrations();
    } else {
      await runMigration(arg);
    }
  } catch (err) {
    error(err.message);
    console.error(err);
    process.exit(1);
  }
};

main();

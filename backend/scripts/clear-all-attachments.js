#!/usr/bin/env node
/**
 * 清空所有附件脚本
 * 
 * 功能：
 * 1. 删除数据库中的所有附件记录
 * 2. 删除文件系统中的所有附件文件（包括缩略图）
 * 
 * 用法: 
 *   node scripts/clear-all-attachments.js [--force]
 *   docker compose exec backend node scripts/clear-all-attachments.js --force
 * 
 * 选项:
 *   --force  跳过确认提示直接执行
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const mysql = require('mysql2/promise');
const readline = require('readline');
require('dotenv').config();

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

const log = (msg) => console.log(`[clear-attachments] ${msg}`);
const error = (msg) => console.error(`[clear-attachments] ERROR: ${msg}`);
const warn = (msg) => console.warn(`[clear-attachments] WARN: ${msg}`);

const getConnection = async () => {
  return mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'artifact_dashboard',
    charset: 'utf8mb4'
  });
};

/**
 * 提示用户确认
 */
const confirm = async (message) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
};

/**
 * 删除目录下所有文件（保留目录结构）
 */
const clearDirectory = async (dirPath, stats = { deleted: 0, failed: 0 }) => {
  if (!fs.existsSync(dirPath)) {
    return stats;
  }

  const entries = await fsp.readdir(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    
    if (entry.isDirectory()) {
      // 递归处理子目录
      await clearDirectory(fullPath, stats);
      // 尝试删除空目录（保留 uploads 和 thumbnails 目录）
      const baseName = path.basename(fullPath);
      if (baseName !== 'uploads' && baseName !== 'thumbnails') {
        try {
          await fsp.rmdir(fullPath);
        } catch (err) {
          // 目录非空则忽略
        }
      }
    } else {
      // 删除文件
      try {
        await fsp.unlink(fullPath);
        stats.deleted++;
      } catch (err) {
        warn(`无法删除文件 ${fullPath}: ${err.message}`);
        stats.failed++;
      }
    }
  }
  
  return stats;
};

/**
 * 主清理逻辑
 */
const clearAllAttachments = async (options = {}) => {
  const { force = false } = options;
  
  log('='.repeat(50));
  log('附件清理脚本');
  log('='.repeat(50));
  
  // 连接数据库
  const conn = await getConnection();
  
  try {
    // 获取附件统计
    const [[{ count: attachmentCount }]] = await conn.query(
      'SELECT COUNT(*) AS count FROM attachments'
    );
    
    let folderCount = 0;
    let tagCount = 0;
    let fileTagCount = 0;
    
    try {
      const [[{ count }]] = await conn.query('SELECT COUNT(*) AS count FROM folders');
      folderCount = count;
    } catch (err) {
      // 表可能不存在
    }
    
    try {
      const [[{ count }]] = await conn.query('SELECT COUNT(*) AS count FROM tags');
      tagCount = count;
    } catch (err) {
      // 表可能不存在
    }
    
    try {
      const [[{ count }]] = await conn.query('SELECT COUNT(*) AS count FROM file_tags');
      fileTagCount = count;
    } catch (err) {
      // 表可能不存在
    }
    
    log('');
    log('当前状态:');
    log(`  - 附件记录: ${attachmentCount} 条`);
    log(`  - 文件夹: ${folderCount} 个`);
    log(`  - 标签: ${tagCount} 个`);
    log(`  - 文件标签关联: ${fileTagCount} 条`);
    log(`  - 上传目录: ${UPLOAD_DIR}`);
    log('');
    
    if (attachmentCount === 0) {
      log('没有附件需要清理。');
      return;
    }
    
    // 确认操作
    if (!force) {
      log('⚠️  警告: 此操作将永久删除所有附件文件和相关数据！');
      log('');
      const confirmed = await confirm('确定要继续吗?');
      if (!confirmed) {
        log('操作已取消。');
        return;
      }
    }
    
    log('');
    log('开始清理...');
    
    // 1. 删除数据库记录
    log('');
    log('[1/4] 清理文件标签关联...');
    try {
      const [result] = await conn.query('DELETE FROM file_tags');
      log(`  ✓ 删除了 ${result.affectedRows} 条文件标签关联`);
    } catch (err) {
      if (err.code !== 'ER_NO_SUCH_TABLE') {
        warn(`  清理文件标签失败: ${err.message}`);
      }
    }
    
    log('[2/4] 清理附件引用...');
    try {
      const [result] = await conn.query('DELETE FROM attachment_refs');
      log(`  ✓ 删除了 ${result.affectedRows} 条附件引用`);
    } catch (err) {
      if (err.code !== 'ER_NO_SUCH_TABLE') {
        warn(`  清理附件引用失败: ${err.message}`);
      }
    }
    
    log('[3/4] 清理附件记录...');
    const [deleteResult] = await conn.query('DELETE FROM attachments');
    log(`  ✓ 删除了 ${deleteResult.affectedRows} 条附件记录`);
    
    // 2. 删除文件系统中的文件
    log('[4/4] 清理文件系统...');
    
    if (fs.existsSync(UPLOAD_DIR)) {
      const stats = await clearDirectory(UPLOAD_DIR);
      log(`  ✓ 删除了 ${stats.deleted} 个文件`);
      if (stats.failed > 0) {
        warn(`  ${stats.failed} 个文件删除失败`);
      }
    } else {
      log(`  ⚠ 上传目录不存在: ${UPLOAD_DIR}`);
    }
    
    log('');
    log('='.repeat(50));
    log('清理完成！');
    log('='.repeat(50));
    
  } finally {
    await conn.end();
  }
};

// 主入口
const main = async () => {
  const args = process.argv.slice(2);
  const force = args.includes('--force') || args.includes('-f');
  
  try {
    await clearAllAttachments({ force });
  } catch (err) {
    error(err.message);
    console.error(err);
    process.exit(1);
  }
};

main();

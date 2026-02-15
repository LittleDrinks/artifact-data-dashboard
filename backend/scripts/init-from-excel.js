const fs = require('fs');
const path = require('path');
const { importKnowledgeGraphFromXlsxBuffer } = require('../src/services/utils/excel-kg.service');
const { createLogger } = require('../src/utils/logger');

const logger = createLogger('InitFromExcel');
const EXCEL_FILE_PATH = path.join(__dirname, '..', '..', 'data', 'data.xlsx');

const main = async () => {
  try {
    const strategy = process.argv[2] || 'append';
    
    if (!['append', 'overwrite'].includes(strategy)) {
      logger.error(`无效的导入策略: ${strategy}`);
      logger.error("用法: node scripts/init-from-excel.js [append|overwrite]");
      process.exit(1);
    }

    logger.info('========================================');
    logger.info('统一数据初始化脚本');
    logger.info('========================================');
    logger.info(`Excel 文件路径: ${EXCEL_FILE_PATH}`);
    logger.info(`导入策略: ${strategy}`);
    logger.info('');

    if (!fs.existsSync(EXCEL_FILE_PATH)) {
      logger.error(`错误: Excel 文件不存在: ${EXCEL_FILE_PATH}`);
      logger.error('请确保 data/data.xlsx 文件存在');
      process.exit(1);
    }

    logger.info('读取 Excel 文件...');
    const buffer = fs.readFileSync(EXCEL_FILE_PATH);
    const fileSizeMB = (buffer.length / 1024 / 1024).toFixed(2);
    logger.info(`文件大小: ${fileSizeMB} MB`);
    logger.info('');

    logger.info('开始导入数据到 MySQL...');
    const result = await importKnowledgeGraphFromXlsxBuffer({ buffer, strategy });
    
    logger.info('');
    logger.info('----------------------------------------');
    logger.info('导入结果:');
    logger.info(`  - Excel 记录总数: ${result.total}`);
    logger.info(`  - MySQL 新增: ${result.inserted}`);
    logger.info(`  - MySQL 更新: ${result.updated}`);
    logger.info(`  - MySQL 跳过: ${result.skipped}`);
    logger.info(`  - 导入策略: ${result.strategy}`);
    logger.info(`  - Neo4j 同步: 已完成`);
    logger.info('----------------------------------------');
    logger.info('');
    logger.info('数据初始化完成！');
    logger.info('MySQL 和 Neo4j 现在包含相同的数据。');
    logger.info('========================================');
    
    process.exit(0);
  } catch (error) {
    logger.error('');
    logger.error('========================================');
    logger.error('数据初始化失败！');
    logger.error('========================================');
    logger.error(error.message);
    
    if (error.issues) {
      logger.error('');
      logger.error('详细错误信息:');
      logger.error(JSON.stringify(error.issues, null, 2));
    }
    
    process.exit(1);
  }
};

main();

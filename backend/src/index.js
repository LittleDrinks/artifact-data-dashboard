require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

// 导入路由
const authRoutes = require('./routes/auth.routes');
const artifactRoutes = require('./routes/artifact.routes');
const statsRoutes = require('./routes/stats.routes');
const graphRoutes = require('./routes/graph.routes');
const wordcloudRoutes = require('./routes/wordcloud.routes');
const chatRoutes = require('./routes/chat.routes');

// 导入中间件
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');
const { authMiddleware } = require('./middleware/auth.middleware');

// 初始化Express应用
const app = express();
const PORT = process.env.PORT || 3000;

// 基本中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(helmet());
app.use(morgan('combined'));

// 限流配置
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100 // 每个IP在windowMs时间内最多请求100次
});
app.use(limiter);

// Swagger文档配置
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '文物数据管理系统 API',
      version: '1.0.0',
      description: '文物大数据与人工智能集成系统API文档',
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: '开发服务器',
      },
    ],
  },
  apis: ['./src/routes/*.js'], // 路径到API路由文件
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// 路由注册
app.use('/api/auth', authRoutes);
app.use('/api/artifacts', authMiddleware, artifactRoutes);
app.use('/api/stats', authMiddleware, statsRoutes);
app.use('/api/graph', authMiddleware, graphRoutes);
app.use('/api/wordcloud', authMiddleware, wordcloudRoutes);
app.use('/api/chat', authMiddleware, chatRoutes);

// API文档路由
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// 处理404错误 - 必须放在所有路由之后
app.use(notFoundHandler);

// 全局错误处理中间件
app.use(errorHandler);

// 启动服务器
app.listen(PORT, () => {
  console.log(`服务器已启动，运行在端口 ${PORT}`);
  console.log(`API文档可在 http://localhost:${PORT}/api-docs 访问`);
});

module.exports = app; // 用于测试

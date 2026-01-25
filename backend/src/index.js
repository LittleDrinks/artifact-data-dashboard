const { loadAndValidateEnv } = require('./config/env');
const { ok, diagnostics } = loadAndValidateEnv();

// stdout: structured startup diagnostics (redacted)
console.log(JSON.stringify(diagnostics));

if (!ok) {
  process.exit(1);
}

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
const aiPluginsRoutes = require('./routes/ai-plugins.routes');
const mcpRoutes = require('./routes/mcp.routes');
const modeRoutes = require('./routes/mode.routes');
const cypherRoutes = require('./routes/cypher.routes');
const debugRoutes = require('./routes/debug.routes');
const attachmentRoutes = require('./routes/attachment.routes');

// 注册工具
const { registerAllTools } = require('./services/tools');
registerAllTools();

// 初始化AI服务依赖关系
const modeManager = require('./services/ai/mode-manager');
const healthCheckService = require('./services/ai/health-check.service');
const modeNotifier = require('./services/ai/mode-notifier');
const { redisClient } = require('./config/database');

// 初始化服务依赖
modeManager.init({ healthCheckService, modeNotifier });
healthCheckService.init({ modeManager });
modeNotifier.init({ redisClient });

// 启动健康检查
healthCheckService.startHealthChecks();

// 导入中间件
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');
const { authMiddleware, roleMiddleware } = require('./middleware/auth.middleware');

// 初始化Express应用
const app = express();
const PORT = process.env.PORT || 3000;

// honor proxy headers issued by Docker/NGINX so rate limiting can resolve client IPs
const rawTrustProxy = process.env.TRUST_PROXY;
if (rawTrustProxy === undefined) {
  app.set('trust proxy', 1);
} else if (rawTrustProxy === 'true') {
  app.set('trust proxy', true);
} else if (rawTrustProxy === 'false') {
  app.set('trust proxy', false);
} else if (!Number.isNaN(Number(rawTrustProxy))) {
  app.set('trust proxy', Number(rawTrustProxy));
} else {
  app.set('trust proxy', rawTrustProxy);
}

// 基本中间件
app.use(express.json({ limit: '10mb' })); // 限制请求体大小
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS配置 - 根据环境变量配置允许的源
const allowedOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:8080', 'http://localhost:3000'];

app.use(cors({
  origin: function (origin, callback) {
    // 允许无origin的请求（如Postman、服务端调用）
    if (!origin || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('不允许的CORS来源'));
    }
  },
  credentials: true, // 允许携带凭据
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
app.use(morgan('combined'));

// 限流配置
// NOTE: 批量上传会产生大量请求，开发环境默认放宽限流；生产环境保持更严格的默认值。
const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const defaultMax = process.env.NODE_ENV === 'production' ? 100 : 2000;
const max = Number(process.env.RATE_LIMIT_MAX || defaultMax);

const limiter = rateLimit({
  windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 15 * 60 * 1000,
  max: Number.isFinite(max) && max > 0 ? max : defaultMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return res.status(429).json({
      message: '请求过于频繁，请稍后重试',
      statusCode: 429
    });
  }
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
    },    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: '开发服务器',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [
    './src/routes/*.js',
    __dirname + '/routes/*.js'
  ], // 路径到API路由文件
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: '服务器运行正常' });
});

// 路由注册
app.use('/api/auth', authRoutes);
app.use('/api/artifacts', authMiddleware, artifactRoutes);
app.use('/api/stats', authMiddleware, statsRoutes);
app.use('/api/graph', authMiddleware, graphRoutes);
app.use('/api/wordcloud', authMiddleware, wordcloudRoutes);
app.use('/api/chat', authMiddleware, chatRoutes);
app.use('/api/attachments', authMiddleware, attachmentRoutes);
app.use('/api/ai-plugins', authMiddleware, roleMiddleware(['admin']), aiPluginsRoutes);
app.use('/api/mcp', mcpRoutes); // Middleware defined in route file to support mixed access if needed
app.use('/api/mode', modeRoutes);
app.use('/api/cypher', cypherRoutes); // US4 - Cypher query execution API
app.use('/api/debug', authMiddleware, roleMiddleware(['admin']), debugRoutes);

// API文档路由 - 必须在其他路由之后注册
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

# 后端Dockerfile
FROM crpi-kl2yo8a1hefddu65.cn-hangzhou.personal.cr.aliyuncs.com/csj_images/node:16-alpine

# 安装构建 bcrypt 所需的依赖
RUN apk add --no-cache python3 make g++ gcc

WORKDIR /app

# 复制package.json并安装依赖
COPY package*.json ./
RUN npm install --registry=https://registry.npmmirror.com
# 确保安装新版本的jieba或者使用命令行直接安装
RUN npm uninstall jieba && npm install nodejieba axios --registry=https://registry.npmmirror.com

# 复制源代码
COPY . .

# 统一shell脚本行结尾，防止Windows换行导致执行失败
RUN sed -i 's/\r$//' start.sh

# 设置环境变量
ENV NODE_ENV=production

# 设置启动脚本可执行权限
RUN chmod +x start.sh

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["./start.sh"]

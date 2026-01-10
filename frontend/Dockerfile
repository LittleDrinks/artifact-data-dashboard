# 前端Dockerfile
# FROM crpi-kl2yo8a1hefddu65.cn-hangzhou.personal.cr.aliyuncs.com/csj_images/node:16-alpine AS build
FROM docker.io/library/node:16-alpine AS build

# 安装构建依赖
RUN apk add --no-cache python3 make g++ gcc

WORKDIR /app

# 复制package.json并安装依赖
COPY package*.json ./
RUN npm install --registry=https://registry.npmmirror.com

# 复制源代码并构建
COPY . .
RUN npm run build

# 部署阶段
FROM crpi-kl2yo8a1hefddu65.cn-hangzhou.personal.cr.aliyuncs.com/csj_images/nginx:alpine

# 复制构建产物到Nginx
COPY --from=build /app/build /usr/share/nginx/html

# 复制Nginx配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

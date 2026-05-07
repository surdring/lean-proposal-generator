# 精益提案生成器

基于AI的精益改善提案与需求文档生成工具。支持生成《月度精益改善自主性提案》和《项目需求规格说明书》(PRD)。

## 架构

```
浏览器 (React + Vite)  →  Express 后端  →  AI API
     :5173 (dev)            :3001 (dev)       :3000 (prod)
```

- **前端**: React + TailwindCSS，通过 SSE 接收流式响应
- **后端**: Express 服务器，代理 AI API 调用，API Key 仅存于服务端

## 快速开始

**前置条件:** Node.js >= 18

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，设置 AI_API_KEY="你的API密钥"

# 3. 启动开发服务（前后端同时启动）
npm run dev
```

开发模式访问: http://localhost:5173

## 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 同时启动前端(Vite :5173)和后端(:3001) |
| `npm run dev:client` | 仅启动前端开发服务器 |
| `npm run dev:server` | 仅启动后端开发服务器（支持热重载） |
| `npm run build` | 构建前端到 dist/ |
| `npm run start` | 生产模式启动（需先 build） |
| `npm run preview` | 构建并启动生产服务 |
| `npm run clean` | 清除 dist/ |
| `npm run lint` | TypeScript 类型检查 |

## 生产部署

```bash
npm run build
npm run start
# 访问 http://localhost:3000
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `AI_API_KEY` | ❌ | AI 服务商的 API Key，本地模型可留空 |
| `AI_BASE_URL` | ❌ | API 基础地址，非 Google 服务商或本地模型需设置 |
| `AI_MODEL` | ❌ | 模型名称，默认 `gemini-3-flash-preview` |
| `PORT` | ❌ | 服务端口，生产默认 3000，开发默认 3001 |

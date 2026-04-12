<div align="center">
  <h1>🪄 Neowow Studio</h1>
  <p><strong>AI 助手实验室：极速构建、一键发布的云原生多租户应用平台</strong></p>
  <p>
    <a href="https://neowow.studio">官网</a> • 
    <a href="https://github.com/feifeixp/neostudio">GitHub</a>
  </p>
</div>

## ✨ 项目简介

**Neowow Studio** 是专为创作者与开发者打造的新一代 AI 助手实验室解决方案。通过自然语言交互，项目可以在几秒内自动编写出完整的单文件网页应用（基于 HTML/CSS/JS），并一键托管发布到**边缘计算节点（Cloudflare Workers/Pages + 阿里云 FC）**。

无需复杂的服务器配置、无需学习部署流，创建完的应用即刻获得一个 **专属子域链接**（例如：`https://your-app.neowow.studio`），可以立刻分享并提供给全球用户独立访问。

> *"从突发的灵感到可分享的成熟产品，这段路程被极大地缩短。"*

---

## 🚀 核心架构与模块

本项目由多个核心功能引擎组成，满足低延迟代码生成、专业编辑器配置、多租户沙箱隔离以及边缘路由分发的需求。

- 📦 **`dashboard/` (Control Panel)**: 
  基于 **Next.js** 的可视化云端面板，提供用户无感会话管理、Prompt 工作流交互、Vibe 多阶段任务推演（分析建模 + 界面生成）、实时效果预览和强大的 Monaco Editor 在线代码微调交互功能。

- 🌐 **`cf-proxy/` (Edge Router & Gateway)**: 
  基于 **Cloudflare Workers** 的动态智能网关。负责捕获域名请求树下如 `*.neowow.studio` 的全局动态匹配请求，并依据请求中的 Host 请求头信息将流量精准分发至对应租户的 Worker 应用当中（例如自动将 `app.neowow.studio` 排除并透传给控制台面板）。

- ⚙️ **`router-function/` & `deploy-pipeline/` (Serverless Foundation)**: 
  基础架构的边缘部署流水线和路由支持核心，内置对云原生 TableStore 等边缘持久性路由表的通讯对接，对运行时的沙箱安全与文件流传输做生命周期管理。

- 🎨 **`landing/`**: 
  Neowow Studio 高级交互官网的前端源码与 CSS 文件，包含现代的毛玻璃（Glassmorphism）视觉要素展示、浮动光球与终端智能流式模拟动画。

---

## 💡 核心特性

- **低代码零准入门槛 (Low Code)**：自然语言表达，利用系统内置抽象 Prompt 生成高可用且符合现代审美的响应网页应用。
- **深度定制与专业化 (Deep Customize)**：在简单对话之上，平台提供 **Monaco Editor** 和重构级双栏编辑视窗，支持硬核微调代码与热重载。
- **多租户数据互隔离 (Multi-Tenant Hub)**：纯 Serverless 和边缘架构配置，让每一名用户、每一个 App 都独享隔离的算力和边缘路由线路。
- **创建即分发 (Instant Publish)**：没有打包时间成本，秒级冷启动并同步下发至全球就近节点快速访问。

---

## 💻 本地运行与开发指南

项目支持本地极速仿真测试引擎，可以在本机利用终端建立完整的运行全景链路：

### 1. 完善依赖与环境变量
确保你安装了 `Node.js (v18+)` 。根据各业务模块目录下 `.env` 范例创建你局部的配置文件：
- `dashboard/.env.local`  配置数据库会话密钥、OpenRouter / Neodomain 平台的 `API_KEY` 等关键请求头。
- `router-function/.env`  云服务的鉴权网关注册相关配置。

### 2. 启动验证环境集群
使用本地集成的自动化服务拉起脚本，一键初始化并打开监听端口群：
```bash
./dev.sh
```

**或者独立剥离启动测试业务：**
```bash
# 启动 Dashboard 控制台面板 (默认端口 3000)
cd dashboard && npm run dev

# 启动本地持久化/虚拟部署路由服务
node deploy-pipeline/src/index.js
node worker-runtime/dev-server.js 9000
node router-function/dev-server.js
```

---

## 🌍 云端上线指南

项目中前端和后端的发布已经被封装化到标准的 Cloudflare CLI 处理流程中中：

1. **发布官方主控制台 (Dashboard)**：
   配合 Edge 运行时编译发布。
   ```bash
   cd dashboard 
   npx @cloudflare/next-on-pages
   npm run deploy
   ```
2. **发布动态主域名网关 (Edge Proxy)**：
   将子域名捕获和反代理控制端推送至边缘节点，即刻生效。
   ```bash
   cd cf-proxy 
   npx wrangler deploy
   ```

---

## 🛡️ License 与协议
本项目由 **[Neowow Studio](https://neowow.studio/)** 提供。遵循 MIT 开源协议。

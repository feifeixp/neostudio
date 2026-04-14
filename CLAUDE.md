# Worker Platform — Quick Reference

## Architecture

```
Browser / curl
    │
    ▼
router-function :8080  (routes by hostname → MOCK/TableStore/FC)
    │
    ▼  POST /invoke (local) or FC.invokeFunction (cloud)
    │
worker-runtime  :9000  (serves files from codes/{workerName}/)
```

## Port Map

| Port | Service          | Notes                                  |
|------|------------------|----------------------------------------|
| 3000 | dashboard        | Next.js control panel                  |
| 8080 | router-function  | Routes by Host header                  |
| 8081 | deploy-pipeline  | REST API: POST /deploy, GET /workers   |
| 9000 | worker-runtime   | Executes / serves deployed workers     |

## Start Local Dev

```bash
./dev.sh
```

Or individually:
```bash
# Terminal 1
node worker-runtime/dev-server.js 9000

# Terminal 2
node router-function/dev-server.js

# Terminal 3
node deploy-pipeline/src/index.js

# Terminal 4
cd dashboard && npm run dev
```

## Deploy a Worker (local)

```bash
curl -X POST http://localhost:8081/deploy \
  -H 'Content-Type: application/json' \
  -d '{
    "workerName": "my-app",
    "files": [{"name":"index.html","content":"<h1>Hello</h1>"}]
  }'
```

Access at: `curl -H 'Host: my-app.localhost' http://localhost:8080/`

## Test Full Chain

```bash
# Health check
curl http://localhost:9000/health

# Route through router
curl -H 'Host: my-app.localhost' http://localhost:8080/

# List workers
curl http://localhost:8081/workers
```

## Environment Variables

### router-function/.env
```
ALIBABA_CLOUD_ACCESS_KEY_ID=...
ALIBABA_CLOUD_ACCESS_KEY_SECRET=...
# FC_ACCOUNT_ID=...     ← comment out for local dev (uses localhost:9000)
FC_REGION=cn-shanghai
FC_DEFAULT_SERVICE=worker-service
# TABLESTORE_ENDPOINT=...
# TABLESTORE_INSTANCE_NAME=...
```

### deploy-pipeline/.env
```
ALIBABA_CLOUD_ACCESS_KEY_ID=...
ALIBABA_CLOUD_ACCESS_KEY_SECRET=...
FC_ACCOUNT_ID=...
FC_REGION=cn-shanghai
FC_DEFAULT_SERVICE=worker-service
# TABLESTORE_ENDPOINT=...
PORT=8081
```

### dashboard/.env.local
```
ANTHROPIC_API_KEY=sk-ant-...    ← required for AI generation
DEPLOY_PIPELINE_URL=http://localhost:8081
```

## Cloud Deployment

```bash
# Configure Serverless Devs
s config add --AccountID 31046663 \
             --AccessKeyID *** \
             --AccessKeySecret ***

# Deploy router function to FC
cd router-function && s deploy

# Set FC_ACCOUNT_ID in router-function/.env after cloud deploy
```

## Standard DevOps Deployment Pipeline (Neowow Ai Studio)

Here is the standardized workflow to deploy the three core modules of this platform:

```bash
# 1. Dashboard UI Platform (Cloudflare Pages)
cd dashboard && npm run deploy:cf

# 2. Global CF Proxy (Cloudflare Workers)
# NOTE: Make sure to copy landing/index.html to cf-proxy/src/landing.html before deploying
# if you edited the landing page, since the proxy workers serve it locally.
cd cf-proxy && npx wrangler deploy

# 3. Backend Runtime Worker (Aliyun FC)
cd worker-runtime && npm run deploy
```

## Alibaba Cloud Resources

| Resource             | Value                                             |
|----------------------|---------------------------------------------------|
| Account ID           | 31046663                                          |
| FC Region            | cn-shanghai                                       |
| AK ID                | ***                          |
| FC Service           | worker-service                                    |
| TableStore Instance  | neodevcn (cn-hangzhou)                            |
| TableStore Endpoint  | https://neodevcn.cn-hangzhou.ots.aliyuncs.com     |
| TableStore Table     | router_table                                      |

## TableStore Setup

```bash
# 1. 在控制台添加本机 IP 到白名单：
#    表格存储 → neodevcn → 网络管理 → 添加 IP（运行下面命令获取）
curl -s https://api.ipify.org

# 2. 建表 + 种子数据
cd router-function && node ../scripts/setup-tablestore.mjs
```

## Key Files

| File                                           | Purpose                                  |
|------------------------------------------------|------------------------------------------|
| `router-function/src/store/routes.json`        | Dynamic routing table (local dev)        |
| `worker-runtime/codes/{workerName}/`           | Deployed worker files                    |
| `router-function/src/store/tablestore.js`      | Route resolution (routes.json → TS → mock) |
| `router-function/src/dispatch/fc.js`           | Dispatch to FC or localhost:9000         |
| `worker-runtime/index.js`                      | Multi-tenant code serving                |
| `deploy-pipeline/src/index.js`                 | Deploy API + local file save             |
| `dashboard/src/app/api/generate/route.ts`      | Claude AI code generation                |

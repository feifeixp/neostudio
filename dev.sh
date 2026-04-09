#!/usr/bin/env bash
# 本地全栈调试启动脚本
# 端口分配：
#   9000 — worker-runtime  (FC Worker，含全景前端 + Neo API 代理)
#   8080 — router-function (按 hostname 路由，转发到 worker-runtime)
#   8081 — deploy-pipeline (部署流水线 API，dashboard 调用)
#   3000 — dashboard       (Next.js 控制台)
#   3001 — hdri-panorama   (Vite 开发服务器，直连 Neo API，独立调试用)

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

# 清理退出时杀掉所有子进程
cleanup() {
  echo ""
  echo "正在停止所有服务..."
  kill 0
}
trap cleanup EXIT INT TERM

echo "========================================"
echo "  本地开发环境启动"
echo "========================================"
echo "  worker-runtime  → http://localhost:9000"
echo "  router-function → http://localhost:8080"
echo "  deploy-pipeline → http://localhost:8081"
echo "  dashboard       → http://localhost:3000"
echo "  hdri-panorama   → http://localhost:3001 (独立)"
echo "========================================"
echo ""

# 1. worker-runtime（FC Worker，端口 9000）
echo "[1/4] 启动 worker-runtime..."
cd "$ROOT/worker-runtime"
node dev-server.js 9000 &
WORKER_PID=$!

# 2. router-function（路由网关，端口 8080）
echo "[2/4] 启动 router-function..."
cd "$ROOT/router-function"
node dev-server.js &
ROUTER_PID=$!

# 3. deploy-pipeline（部署流水线，端口 8081）
echo "[3/4] 启动 deploy-pipeline..."
cd "$ROOT/deploy-pipeline"
node src/index.js &
PIPELINE_PID=$!

# 4. dashboard（Next.js，端口 3000）
echo "[4/4] 启动 dashboard..."
cd "$ROOT/dashboard"
npm run dev -- --port 3000 &
DASH_PID=$!

echo ""
echo "所有服务已启动，按 Ctrl+C 全部停止"
echo ""
echo "调试方式："
echo "  全链路请求:  curl -H 'Host: worker1.localhost' http://localhost:8080/health"
echo "  直连 Worker: curl http://localhost:9000/health"
echo "  部署接口:    curl -X POST http://localhost:8081/deploy -H 'Content-Type: application/json' \\"
echo "               -d '{\"workerName\":\"test\",\"files\":[{\"name\":\"index.js\",\"content\":\"...\"}]}'"
echo "  控制台:      http://localhost:3000"
echo ""

wait

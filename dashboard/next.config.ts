import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // ESLint 问题不阻断 CF Pages 构建
  },
  typescript: {
    ignoreBuildErrors: true, // Vercel 环境 TS 严格模式不阻断构建；本地用 tsc --noEmit 单独检查
  },
};

export default nextConfig;

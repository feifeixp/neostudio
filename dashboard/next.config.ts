import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // ESLint 问题不阻断 CF Pages 构建
  },
  typescript: {
    ignoreBuildErrors: false, // 保留 TS 类型检查
  },
};

export default nextConfig;

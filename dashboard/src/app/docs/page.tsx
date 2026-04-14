"use client";

import { useState, useEffect } from 'react';
import styles from './page.module.css';

export default function DocsPage() {
  const [activeTab, setActiveTab] = useState<'api' | 'cli'>('api');
  const [token, setToken] = useState<string>('');

  useEffect(() => {
    try {
      const sessionStr = localStorage.getItem('neoStudioSession');
      if (sessionStr) {
        const session = JSON.parse(sessionStr);
        setToken(session.authorization || '');
      }
    } catch { /* ignore */ }
  }, []);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>开发者指南</h1>
        <p>Neodomain 底层 API 和 CLI 命令行工具完全向开发者与 AI 智能体开放。</p>
      </header>

      <div className={styles.tokenAlert}>
        <span>🔑</span>
        <div>
          <p><strong>您的个人访问令牌 (Access Token)</strong><br />在调用接口或执行 CLI 操作时，请在 Header 中附加此 Token 以进行身份验证。</p>
          <div className={styles.tokenBox}>
            {token ? token : '未检测到登录状态，请先在控制台主页登录。'}
          </div>
        </div>
      </div>

      <div className={styles.tabs}>
        <button 
          className={`${styles.tabBtn} ${activeTab === 'api' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('api')}
        >
          REST API 参考
        </button>
        <button 
          className={`${styles.tabBtn} ${activeTab === 'cli' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('cli')}
        >
          CLI 工具 & AI Agent
        </button>
      </div>

      {activeTab === 'api' && (
        <div className={styles.contentArea}>
          <h2>🌐 REST API 参考录</h2>
          <p style={{marginBottom: 20, color: 'var(--text-secondary)'}}>所有接口 URL Base: <code>https://story.neodomain.cn</code></p>
          
          <div className={styles.section}>
            <h3>1. AI 视频生成</h3>
            <p><strong>POST</strong> /agent/user/video/generate</p>
            <pre className={styles.codeBlock}>
{`{
  "modelName": "kling-v3-omni",
  "generationType": "T2V",   // T2V(文), I2V(图), U2V(全能)
  "prompt": "一段描述画面的文字...",
  "aspectRatio": "16:9",
  "duration": "5s"
}`}
            </pre>
          </div>

          <div className={styles.section}>
            <h3>2. AI 图像生成</h3>
            <p><strong>POST</strong> /agent/ai-image-generation/generate</p>
            <pre className={styles.codeBlock}>
{`{
  "modelName": "doubao-seedream-4-0",
  "prompt": "赛博朋克风格...",
  "numImages": "1",
  "aspectRatio": "16:9"
}`}
            </pre>
            <p style={{marginTop: 10}}>查询图片生成结果:</p>
            <p><strong>GET</strong> /agent/ai-image-generation/result/&#123;taskCode&#125;</p>
          </div>

          <div className={styles.section}>
            <h3>3. 创建支付订单</h3>
            <p><strong>POST</strong> /agent/pay/order/create</p>
            <pre className={styles.codeBlock}>
{`{
  "subject": "积分充值",
  "amount": 9.9,
  "payType": 1 // 微信支付
}`}
            </pre>
          </div>
        </div>
      )}

      {activeTab === 'cli' && (
        <div className={styles.contentArea}>
          <h2>🤖 AI-Friendly CLI 工具</h2>
          <p style={{marginBottom: 20, color: 'var(--text-secondary)', lineHeight: 1.6}}>
            我们提供了一个原生的 <code>neodomain-cli</code> 工具，专为 Cursor、Claude Code、OpenClaw 等 AI Agent 离线调用而设计。<br/>
            该工具所有的输出格式皆为严格的 <code>JSON</code> 结构。
          </p>
          
          <div className={styles.section}>
            <h3>全局参数</h3>
            <pre className={styles.codeBlock}>
{`npx neodomain-cli <module> <action> --token "YOUR_TOKEN" [--param value]`}
            </pre>
          </div>

          <div className={styles.section}>
            <h3>使用样例</h3>
            <pre className={styles.codeBlock}>
{`# 1. 查模型列表
npx neodomain-cli video get-models --token "xxx"

# 2. 生成视频
npx neodomain-cli video generate \\
  --token "xxx" \\
  --modelName "kling-v3-omni" \\
  --generationType "T2V" \\
  --prompt "A dog flying in space"

# 3. 生成图片
npx neodomain-cli image generate \\
  --token "xxx" \\
  --modelName "doubao-seedream-4-0" \\
  --prompt "A beautiful digital artwork" \\
  --numImages 1`}
            </pre>
          </div>

          <div className={styles.section}>
            <h3>AI System Prompt 贴士</h3>
            <p style={{color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.6'}}>
              您可以直接把本工程根目录下的 <code>neodomain-cli/AI_MANUAL.md</code> 喂给您的 AI，它会自动学会如何帮您操作平台。
            </p>
          </div>

          <div className={styles.section}>
            <h3>DevOps 全栈发布部署架构与指令</h3>
            <p style={{color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.6', marginBottom: 12}}>
              本平台当前架构由边缘服务、代理与云函数三方面构成。通过以下标准化指令可迅速完成构建及部署：
            </p>
            <pre className={styles.codeBlock}>
{`# 1. Dashboard UI 平台 (Cloudflare Pages)
cd dashboard && npm run deploy:cf

# 2. API 统一网关层 (Cloudflare CF Proxy)
cd cf-proxy && npx wrangler deploy

# 3. 后端业务与代理运行时 (Aliyun FC)
cd worker-runtime && npm run deploy`}
            </pre>
          </div>
        </div>
      )}

    </div>
  );
}

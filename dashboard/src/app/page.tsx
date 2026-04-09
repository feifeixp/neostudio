"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

interface WorkerData {
  id: string;
  name: string;
  url: string;
  status: string;
  requests: string;
  latency: string;
}

type DeployMode = 'page' | 'assistant';

export default function Home() {
  const [workers, setWorkers] = useState<WorkerData[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<DeployMode>('page');
  const [lines, setLines] = useState<string[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);

  const fetchWorkers = () => {
    fetch('/api/workers')
      .then(res => res.json())
      .then(data => {
        if (data.workers) setWorkers(data.workers);
      })
      .catch(err => console.error("Failed to fetch workers:", err));
  };

  useEffect(() => {
    fetchWorkers();
  }, []);
  
  const handleDeploy = async () => {
    if (!prompt.trim() || isDeploying) return;
    setIsDeploying(true);
    const modePrefix = mode === 'assistant' ? '[AI助手]' : '[网页]';
    setLines([`> ${modePrefix} 接收任务解析中: "${prompt}"...`]);

    try {
      const modeLabel = mode === 'assistant' ? 'AI 对话助手' : '网页应用';
      setLines(prev => [...prev, `✓ 正在连接 Claude AI 引擎（模式：${modeLabel}）...`]);

      // ── Step 1: Stream code generation via SSE ──────────────────────────────
      const genRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, mode }),
      });

      if (!genRes.ok || !genRes.body) {
        throw new Error('Generation request failed');
      }

      let generatedCode = '';
      const reader = genRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const event of events) {
          const line = event.replace(/^data: /, '').trim();
          if (!line) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === 'status')   setLines(prev => [...prev, msg.message]);
            if (msg.type === 'progress') setLines(prev => [...prev, `  已生成 ${msg.chars} 字符...`]);
            if (msg.type === 'error')    throw new Error(msg.message);
            if (msg.type === 'done') {
              generatedCode = msg.code;
              const tokens = msg.usage ? `(${msg.usage.output_tokens} tokens)` : '';
              setLines(prev => [...prev, `✓ 代码生成完毕 ${tokens}`]);
            }
          } catch (e: any) {
            if (e.message && !e.message.includes('JSON')) throw e;
          }
        }
      }

      if (!generatedCode) throw new Error('未能获取生成的代码');

      // ── Step 2: Deploy ──────────────────────────────────────────────────────
      const workerName = 'w-' + Math.random().toString(36).substring(2, 7);
      setLines(prev => [...prev, `✓ 正在打包推送至边缘沙箱 [${workerName}]...`]);

      const depRes = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerName,
          files: [{ name: 'index.html', content: generatedCode }],
        }),
      });

      const depData = await depRes.json();
      if (!depRes.ok) throw new Error(depData.error || 'Deploy failed');

      setLines(prev => [
        ...prev,
        '✓ 分配子域名与绑定路由...',
        `🚀 部署上线成功！访问地址: ${depData.url}`,
      ]);

      fetchWorkers();
    } catch (e: any) {
      setLines(prev => [...prev, `❌ 部署失败: ${e.message}`]);
    } finally {
      setIsDeploying(false);
    }
  };

  const closeModal = () => {
    if (isDeploying) return;
    setShowModal(false);
    setLines([]);
    setPrompt('');
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className="animate-fade-in">控制台总览</h1>
          <p className="animate-fade-in" style={{ animationDelay: '0.1s', color: 'var(--text-secondary)', marginTop: 8 }}>
            从浏览器直接使用自然语言管理、开发和一键部署您的边缘应用。
          </p>
        </div>
        <button 
          className={`btn-primary animate-fade-in`} 
          style={{ animationDelay: '0.2s' }}
          onClick={() => setShowModal(true)}
        >
          + 新建 Worker
        </button>
      </header>

      <div className={styles.statsGrid}>
        <div className={`glass-card animate-fade-in`} style={{ animationDelay: '0.3s' }}>
          <h3>总请求数</h3>
          <div className={styles.statValue}>240 万</div>
          <div className={styles.statTrend}>↑ 12% 较上周相比</div>
        </div>
        <div className={`glass-card animate-fade-in`} style={{ animationDelay: '0.4s' }}>
          <h3>边缘计算耗时</h3>
          <div className={styles.statValue}>3,420 秒</div>
          <div className={styles.statTrend}>↑ 4% 较上周相比</div>
        </div>
        <div className={`glass-card animate-fade-in`} style={{ animationDelay: '0.5s' }}>
          <h3>活跃应用</h3>
          <div className={styles.statValue}>12 个</div>
          <div className={styles.statTrend}>2 个正在部署中</div>
        </div>
      </div>

      <h2 className="animate-fade-in" style={{ animationDelay: '0.6s', marginTop: 48, marginBottom: 24 }}>最近活跃应用</h2>
      <div className={styles.workersGrid}>
        {workers.map((worker, i) => (
          <Link href={`/workers/${worker.id}`} key={worker.id} style={{ display: 'block' }}>
            <div className={`glass-card animate-fade-in`} style={{ animationDelay: `${0.7 + i * 0.1}s`, height: '100%' }}>
              <div className={styles.workerHeader}>
                <h3>{worker.name}</h3>
                <div className={styles.metrics}>
                  <span>~{worker.latency}</span>
                  <span>{worker.requests} 次</span>
                </div>
              </div>
              <span className={styles.workerUrl}>{worker.url}</span>
              <div className={styles.workerStatus}>
                <span className={`status-dot ${worker.status}`}></span>
                <span style={{ textTransform: 'capitalize', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  {worker.status === 'active' ? '运行中' : worker.status === 'deploying' ? '部署中' : '已暂停'}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {showModal && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={`glass-card ${styles.modalContent}`} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{mode === 'assistant' ? '🤖 创建 AI 对话助手' : '🚀 AI 驱动极速部署'}</h2>
              <button className={styles.modalClose} onClick={closeModal}>&times;</button>
            </div>

            {/* 模式选择器 */}
            <div className={styles.modeSelector}>
              <button
                className={`${styles.modeBtn} ${mode === 'page' ? styles.modeBtnActive : ''}`}
                onClick={() => { setMode('page'); setPrompt(''); setLines([]); }}
                disabled={isDeploying}
              >
                🌐 网页应用
              </button>
              <button
                className={`${styles.modeBtn} ${mode === 'assistant' ? styles.modeBtnActive : ''}`}
                onClick={() => { setMode('assistant'); setPrompt(''); setLines([]); }}
                disabled={isDeploying}
              >
                🤖 AI 对话助手
              </button>
            </div>

            <p className={styles.modeHint}>
              {mode === 'assistant'
                ? '生成带真实 Claude 对话能力的 AI 助手页面，创建即可分享给任何人使用。'
                : '用自然语言描述需求，AI 生成完整网页应用，一键部署到公网。'}
            </p>

            <div className={styles.aiInputArea}>
              <input
                autoFocus
                type="text"
                placeholder={mode === 'assistant'
                  ? '例如：帮我做一个营销文案助手，支持小红书、微信、抖音三种风格...'
                  : '例如：帮我写一个高级炫酷的倒计时网页...'}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleDeploy()}
                disabled={isDeploying}
              />
              <button
                className="btn-primary"
                onClick={handleDeploy}
                disabled={isDeploying || !prompt.trim()}
              >
                {isDeploying ? '生成中...' : mode === 'assistant' ? '创建助手' : '发送指令'}
              </button>
            </div>

            <div className={styles.aiTerminal}>
              {lines.length === 0 && (
                <div style={{ opacity: 0.5 }}>🤖 系统待命中，请通过上面输入框指派工作任务...</div>
              )}
              {lines.map((line, idx) => (
                <div key={idx} className={styles.terminalLine} style={{ color: line.includes('🚀') ? 'var(--success)' : 'inherit' }}>
                  {line}
                </div>
              ))}
              {isDeploying && <div className={styles.typingCursor}></div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

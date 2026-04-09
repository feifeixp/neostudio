"use client";

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

interface WorkerInfo {
  id: string;
  name: string;
  url: string;
  status: string;
  deployedAt?: string;
}

/** 判断是否为错误日志行（4xx / 5xx / Error） */
function isErrorLog(log: string) {
  return /\b(4\d{2}|5\d{2})\b|Error|error|exception/i.test(log);
}

/** 从日志行里提取有意义的错误摘要（用于发送给 AI） */
function extractErrorSummary(log: string) {
  return log.replace(/^\[[\d:]+\]\s*/, '').trim();
}

export default function WorkerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id }               = use(params);
  const router               = useRouter();
  const [worker, setWorker]  = useState<WorkerInfo | null>(null);
  const [logs, setLogs]      = useState<string[]>([]);
  const [preview, setPreview]= useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Fix panel state ─────────────────────────────────────────────────────────
  const [fixLog,      setFixLog]      = useState<string | null>(null);
  const [fixState,    setFixState]    = useState<'idle'|'loading'|'done'|'applying'>('idle');
  const [fixMessages, setFixMessages] = useState<string>('');
  const [fixCode,     setFixCode]     = useState<string>('');
  const [fixApplied,  setFixApplied]  = useState(false);
  const logBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch real worker data
    fetch(`/api/workers/${id}`)
      .then(r => r.json())
      .then(d => { if (d.worker) setWorker(d.worker); })
      .catch(() => {});

    // Seed log lines — 使用函数式更新避免 setState in effect 警告
    setLogs(() => [
      `[INFO] Worker "${id}" initialized`,
      '[INFO] Loaded user code from edge sandbox',
      '[HTTP] GET / - 200 OK - 12ms',
    ]);

    // Simulated realtime log stream
    const paths    = ['/', '/api/data', '/health', '/assets/main.js'];
    const statuses = ['200 OK', '200 OK', '200 OK', '404 Not Found'];
    const interval = setInterval(() => {
      const i    = Math.floor(Math.random() * paths.length);
      const ms   = Math.floor(Math.random() * 60) + 5;
      const time = new Date().toLocaleTimeString();
      setLogs(prev => [
        ...prev.slice(-40),
        `[${time}] [HTTP] GET ${paths[i]} — ${statuses[i]} — ${ms}ms`,
      ]);
    }, 3000);

    return () => clearInterval(interval);
  }, [id]);

  const handleDelete = async () => {
    if (!confirm(`确定要删除 Worker "${id}" 吗？此操作不可撤销。`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/workers/${id}`, { method: 'DELETE' });
      const d   = await res.json();
      if (res.ok) { router.push('/'); }
      else { alert('删除失败: ' + (d.error || '未知错误')); setDeleting(false); }
    } catch (e: any) { alert('删除失败: ' + e.message); setDeleting(false); }
  };

  // ── AI 修复：调用 /api/fix 流式分析并返回修复代码 ──────────────────────────
  const handleFix = async (log: string) => {
    setFixLog(log);
    setFixState('loading');
    setFixMessages('');
    setFixCode('');
    setFixApplied(false);

    try {
      const res = await fetch('/api/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerId: id,
          errorLog: extractErrorSummary(log),
          recentLogs: logs.slice(-10),
        }),
      });
      if (!res.body) throw new Error('No response body');

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === 'text')       setFixMessages(prev => prev + evt.text);
            if (evt.type === 'status')     setFixMessages(prev => prev + evt.text + '\n');
            if (evt.type === 'fixed_code') setFixCode(evt.code);
            if (evt.type === 'done')       setFixState('done');
            if (evt.type === 'error') { setFixMessages(prev => prev + '\n❌ ' + evt.text); setFixState('done'); }
          } catch { /* skip malformed SSE */ }
        }
      }
      setFixState('done');
    } catch (e: any) {
      setFixMessages('网络错误: ' + e.message);
      setFixState('done');
    }
  };

  // ── 应用修复：将 AI 修复代码重新部署 ────────────────────────────────────────
  const handleApplyFix = async () => {
    if (!fixCode || fixState === 'applying') return;
    setFixState('applying');
    try {
      const workerName = id;
      const res = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerName,
          files: [{ name: 'index.html', content: fixCode }],
        }),
      });
      const d = await res.json();
      if (res.ok) {
        setFixApplied(true);
        setFixMessages(prev => prev + '\n\n✅ 已重新部署！访问地址: ' + d.url);
      } else {
        setFixMessages(prev => prev + '\n\n❌ 部署失败: ' + (d.error || '未知错误'));
      }
    } catch (e: any) {
      setFixMessages(prev => prev + '\n\n❌ 部署异常: ' + e.message);
    } finally {
      setFixState('done');
    }
  };

  const workerUrl  = worker?.url || `http://${id}.localhost:8080`;
  const deployedAt = worker?.deployedAt
    ? new Date(worker.deployedAt).toLocaleString('zh-CN')
    : '—';

  return (
    <div className={styles.container}>
      <Link href="/" className={styles.backButton}>← 返回控制台</Link>

      <header className={styles.header}>
        <div>
          <h1 className="animate-fade-in">
            {id}
            <span className={`status-dot ${worker?.status || 'active'}`} style={{ marginLeft: 16 }} />
          </h1>
          <p className="animate-fade-in" style={{ animationDelay: '0.1s', color: 'var(--text-secondary)', marginTop: 8 }}>
            Worker ID: {id} · 部署时间: {deployedAt} · 状态: {worker?.status || '运行中'}
          </p>
          <a
            href={workerUrl}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: '0.85rem', color: 'var(--primary)', marginTop: 4, display: 'inline-block' }}
          >
            {workerUrl} ↗
          </a>
        </div>
        <div className={styles.actions}>
          <button
            className="btn-secondary"
            onClick={() => setPreview(p => !p)}
          >
            {preview ? '关闭预览' : '📱 预览应用'}
          </button>
          <button
            className="btn-secondary"
            style={{ color: 'var(--error)', borderColor: 'var(--error)' }}
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? '删除中...' : '🗑 下线删除'}
          </button>
        </div>
      </header>

      {/* Inline preview iframe */}
      {preview && (
        <div className={`glass-card animate-fade-in`} style={{ marginBottom: 24, padding: 0, overflow: 'hidden', borderRadius: 12 }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                        display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
            {workerUrl}
          </div>
          <iframe
            src={workerUrl}
            style={{ width: '100%', height: 520, border: 'none', display: 'block', background: '#0d0f12' }}
            sandbox="allow-scripts allow-same-origin allow-forms"
            title={`Preview: ${id}`}
          />
        </div>
      )}

      <div className={styles.chartsGrid}>
        <div className={`glass-card animate-fade-in ${styles.chartCard}`} style={{ animationDelay: '0.2s' }}>
          <h3>实时并发请求量</h3>
          <div className={styles.chartMock}>
            <div className={styles.barGraph}>
              {[50, 70, 40, 90, 60, 80, 100, 30, 50, 80, 60, 40, 90, 70, 80].map((h, i) => (
                <div key={i} className={styles.bar} style={{ height: `${h}%`, animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
          </div>
        </div>
        <div className={`glass-card animate-fade-in ${styles.chartCard}`} style={{ animationDelay: '0.3s' }}>
          <h3>边缘计算时延监控 (ms)</h3>
          <div className={styles.chartMock}>
            <div className={styles.lineGraph} />
          </div>
        </div>
      </div>

      <div className={`glass-card animate-fade-in`} style={{ animationDelay: '0.4s', marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3>沙箱实时日志</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--success)' }}>● 实时连接中</span>
        </div>

        {/* 日志终端 */}
        <div className={styles.logTerminal} ref={logBoxRef}>
          {logs.map((log, i) => {
            const isErr = isErrorLog(log);
            return (
              <div key={i} className={styles.logLineRow}>
                <span
                  className={styles.logLine}
                  style={{ color: isErr ? 'var(--error)' : log.includes('INFO') ? 'var(--primary)' : 'inherit' }}
                >
                  {log}
                </span>
                {isErr && (
                  <button
                    className={`${styles.fixBtn} ${fixLog === log ? styles.fixBtnActive : ''}`}
                    onClick={() => fixLog === log ? setFixLog(null) : handleFix(log)}
                    title="让 AI 分析并修复此错误"
                  >
                    🔧 修复
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* AI 修复面板 */}
        {fixLog && (
          <div className={styles.fixPanel}>
            <div className={styles.fixPanelHeader}>
              <span>🤖 AI 修复助手</span>
              <button
                className={styles.fixPanelClose}
                onClick={() => { setFixLog(null); setFixState('idle'); setFixMessages(''); setFixCode(''); }}
              >×</button>
            </div>
            <div className={styles.fixErrorTag}>
              <span>⚠ 错误：</span>{extractErrorSummary(fixLog)}
            </div>
            <div className={styles.fixContent}>
              {fixState === 'loading' && !fixMessages && (
                <span className={styles.fixLoading}>🔍 正在分析中...</span>
              )}
              {/* 过滤掉 <<<FIXED_HTML>>> 标记块，只显示文字分析部分 */}
              {fixMessages.replace(/<<<FIXED_HTML>>>[\s\S]*?<<<END_FIXED_HTML>>>/g, '').trim()}
            </div>
            <div className={styles.fixActions}>
              {fixCode && !fixApplied && (
                <button
                  className={styles.fixApplyBtn}
                  onClick={handleApplyFix}
                  disabled={fixState === 'applying'}
                >
                  {fixState === 'applying' ? '⏳ 部署中...' : '⚡ 应用修复并重新部署'}
                </button>
              )}
              {fixApplied && (
                <span className={styles.fixAppliedTag}>✅ 已成功修复并重新部署</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { use, useEffect, useState } from 'react';
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

export default function WorkerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id }               = use(params);
  const router               = useRouter();
  const [worker, setWorker]  = useState<WorkerInfo | null>(null);
  const [logs, setLogs]      = useState<string[]>([]);
  const [preview, setPreview]= useState(false);
  const [deleting, setDeleting] = useState(false);

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
      if (res.ok) {
        router.push('/');
      } else {
        alert('删除失败: ' + (d.error || '未知错误'));
        setDeleting(false);
      }
    } catch (e: any) {
      alert('删除失败: ' + e.message);
      setDeleting(false);
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
        <div className={styles.logTerminal}>
          {logs.map((log, i) => (
            <div key={i} className={styles.logLine}
              style={{ color: log.includes('404') ? 'var(--error)' : log.includes('INFO') ? 'var(--primary)' : 'inherit' }}>
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

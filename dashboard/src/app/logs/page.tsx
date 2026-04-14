"use client";

import { useEffect, useState } from "react";
import styles from "../page.module.css";
import Link from 'next/link';

interface LogEntry {
  id: string;
  time: string;
  action: string;
  workerName: string;
  status: 'SUCCESS' | 'ERROR' | 'INFO';
  message: string;
}

export default function LogsPage() {
  const [session, setSession] = useState<{ authorization?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Read session token
  useEffect(() => {
    try {
      const raw = localStorage.getItem("neoStudioSession");
      if (raw) setSession(JSON.parse(raw));
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className={styles.container}>
        <div style={{ textAlign: "center", marginTop: "10vh", color: "var(--text-secondary)" }}>加载监控日志中...</div>
      </div>
    );
  }

  if (!session?.authorization) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>监控日志</h1>
        </div>
        <div className={styles.contentArea} style={{ textAlign: 'center', padding: '4rem 0' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔒</div>
          <h2 style={{ marginBottom: '1rem' }}>请先登录</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>您需要登录 Neowow Ai Studio 才能查看应用终端部署与运行监控日志。</p>
          <Link href="/" className={styles.primaryBtn} style={{ textDecoration: 'none' }}>前往首页登录</Link>
        </div>
      </div>
    );
  }

  const mockLogs: LogEntry[] = [
    { id: 'l1', time: '10 mins ago', action: 'DEPLOY', workerName: 'w-dashboard', status: 'SUCCESS', message: 'Worker bundle uploaded to Cloudflare Proxy via CLI' },
    { id: 'l2', time: '1 hour ago', action: 'API_CALL', workerName: 'ai-screenwriter', status: 'INFO', message: 'T2V Generation requested' },
    { id: 'l3', time: '3 hours ago', action: 'API_CALL', workerName: 'ai-screenwriter', status: 'ERROR', message: 'Rate limit exceeded (HTTP 429)' },
    { id: 'l4', time: '1 day ago', action: 'CREATE', workerName: 'my-ai-assistant', status: 'SUCCESS', message: 'Application initialized and schema saved' },
    { id: 'l5', time: '2 days ago', action: 'LOGIN', workerName: '-', status: 'INFO', message: 'Session authenticated successfully via Web Auth' }
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link href="/" className={styles.secondaryBtn} style={{ textDecoration: 'none', padding: '0.4rem 0.8rem' }}>← 返回总览</Link>
          <h1 style={{ margin: 0 }}>安全与监控日志</h1>
        </div>
      </div>

      <div className={styles.contentArea}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          审计和排查智能工具发布的系统运维错误及外部接口（比如 Neodomain / CF Edge）调用状况。
        </p>

        <div className="glass-panel" style={{ padding: '1rem', borderRadius: '12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                <th style={{ padding: '12px', width: '15%' }}>时间</th>
                <th style={{ padding: '12px', width: '15%' }}>状态/类别</th>
                <th style={{ padding: '12px', width: '15%' }}>工具编号</th>
                <th style={{ padding: '12px', width: '55%' }}>详细消息</th>
              </tr>
            </thead>
            <tbody>
              {mockLogs.map((log) => {
                const isErr = log.status === 'ERROR';
                const isSuc = log.status === 'SUCCESS';
                return (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border)', background: isErr ? 'rgba(239, 68, 68, 0.05)' : 'transparent' }}>
                    <td style={{ padding: '16px 12px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{log.time}</td>
                    <td style={{ padding: '16px 12px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600,
                        background: isErr ? 'rgba(239, 68, 68, 0.2)' : isSuc ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                        color: isErr ? '#ef4444' : isSuc ? '#10b981' : '#3b82f6'
                      }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ padding: '16px 12px', fontFamily: 'monospace', fontSize: '0.85rem' }}>{log.workerName}</td>
                    <td style={{ padding: '16px 12px', color: isErr ? '#ef4444' : 'var(--text-primary)', fontSize: '0.9rem' }}>{log.message}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

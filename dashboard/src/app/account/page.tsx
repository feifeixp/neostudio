"use client";

import { useEffect, useState } from "react";
import styles from "../page.module.css";
import Link from 'next/link';

interface PointHistory {
  date: string;
  points: number;
  description: string;
}

export default function AccountPage() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<PointHistory[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Read session token
  useEffect(() => {
    try {
      const raw = localStorage.getItem("neoStudioSession");
      if (raw) {
        const session = JSON.parse(raw);
        setToken(session.authorization || null);
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    if (token === null) {
      // If we confirm token is null (after initial check), stop loading
      const raw = localStorage.getItem("neoStudioSession");
      if (!raw) setLoading(false);
      return;
    }

    // Fetch token points history
    async function fetchPoints() {
      try {
        const res = await fetch("https://neowow.studio/neo-api/agent/project-collaboration/points-history?sessionId=" + Date.now(), {
          headers: {
            accessToken: token as string,
          },
        });
        const json = await res.json();
        
        if (!json.success) {
          setError(json.errMessage || "无法获取账户积分流水");
          return;
        }
        
        // Ensure returning a valid array
        setHistory(json.data || []);
      } catch (err: any) {
        setError(err.message || "网络请求失败");
      } finally {
        setLoading(false);
      }
    }

    fetchPoints();
  }, [token]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div style={{ textAlign: "center", marginTop: "10vh", color: "var(--text-secondary)" }}>加载账户数据中...</div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>账户中心</h1>
        </div>
        <div className={styles.contentArea} style={{ textAlign: 'center', padding: '4rem 0' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔒</div>
          <h2 style={{ marginBottom: '1rem' }}>请先登录</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>您需要登录 Neowow Ai Studio 才能查看账户 Token 与分析控制台。</p>
          <a href="https://neowow.studio" className={styles.primaryBtn} style={{ textDecoration: 'none' }}>前往登录</a>
        </div>
      </div>
    );
  }

  const totalPointsSpent = history.reduce((acc, cur) => acc + (cur.points < 0 ? Math.abs(cur.points) : 0), 0);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link href="/" className={styles.secondaryBtn} style={{ textDecoration: 'none', padding: '0.4rem 0.8rem' }}>← 返回总览</Link>
          <h1 style={{ margin: 0 }}>账户中心 & 分析</h1>
        </div>
      </div>

      <div className={styles.contentArea}>
        {error && (
          <div style={{ padding: '12px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid rgba(239,68,68,0.3)' }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
          
          {/* Card 1: API Token Usage */}
          <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '12px' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>累计消耗 API 额度</h3>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--accent-blue)', marginBottom: '0.5rem' }}>
              {totalPointsSpent.toLocaleString()} <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 400 }}>Tokens</span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>包含视频模型 (V2V) 与图像生成消耗的整体额度统计。</p>
          </div>

          {/* Card 2: Tool Analytics (Mock) */}
          <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
               <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>工具累计被调用次数</h3>
               <span style={{ fontSize: '0.7rem', padding: '2px 6px', background: 'rgba(139,92,246,0.2)', color: 'var(--accent-purple)', borderRadius: '4px' }}>全网流量</span>
            </div>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              8,492 <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 400 }}>次</span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>上周环比增长 <span style={{ color: '#10b981' }}>+24.5%</span></p>
          </div>

          {/* Card 3: Active Users (Mock) */}
          <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
               <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>本月活跃授权用户</h3>
               <span style={{ fontSize: '0.7rem', padding: '2px 6px', background: 'rgba(6,182,212,0.2)', color: 'var(--accent-cyan)', borderRadius: '4px' }}>留存终端</span>
            </div>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              1,304 <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 400 }}>人</span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>平均每次访问进行 3.2 轮对话交互</p>
          </div>
        </div>

        <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>API Token 流水明细</h3>
        <div className="glass-panel" style={{ padding: '1rem', borderRadius: '12px' }}>
          {history.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>暂无积分消费记录</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  <th style={{ padding: '12px' }}>时间</th>
                  <th style={{ padding: '12px' }}>操作事项</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>额度变化</th>
                </tr>
              </thead>
              <tbody>
                {history.map((record, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '16px 12px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{record.date}</td>
                    <td style={{ padding: '16px 12px' }}>{record.description}</td>
                    <td style={{ padding: '16px 12px', textAlign: 'right', color: record.points < 0 ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                      {record.points > 0 ? '+' : ''}{record.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

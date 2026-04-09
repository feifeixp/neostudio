"use client";
import { useState, useEffect, useRef } from 'react';
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

type DeployMode = 'page' | 'assistant' | 'upload' | 'git';

const MODE_LABELS: Record<DeployMode, string> = {
  page: '🌐 AI 生成网页', assistant: '🤖 AI 对话助手',
  upload: '📁 上传文件',   git: '🔗 Git 仓库',
};
const MODE_TITLES: Record<DeployMode, string> = {
  page: '🚀 AI 驱动极速部署', assistant: '🤖 创建 AI 对话助手',
  upload: '📁 上传静态文件',   git: '🔗 从 Git 仓库部署',
};
const MODE_HINTS: Record<DeployMode, string> = {
  page:      '用自然语言描述需求，AI 生成完整网页，一键部署到公网。',
  assistant: '生成带真实 Claude 对话能力的 AI 助手，创建即可分享给任何人。',
  upload:    '拖拽 HTML 文件 / 整个文件夹，直接部署静态网站到边缘节点。',
  git:       '输入 GitHub / GitLab 仓库链接，自动拉取代码并部署（仅限公开仓库）。',
};
const ALLOWED_EXTS = /\.(html?|css|js|jsx|ts|tsx|json|md|txt|svg|ico|xml|ya?ml|webmanifest)$/i;

function parseGitUrl(url: string) {
  try {
    const u = new URL(url.trim());
    if (u.hostname === 'github.com') {
      const p = u.pathname.replace(/^\//, '').split('/');
      const owner = p[0], repo = p[1]?.replace(/\.git$/, '');
      if (!owner || !repo) return null;
      const isTree = p[2] === 'tree';
      return { platform: 'github' as const, owner, repo, branch: isTree ? p[3] : 'HEAD', subpath: isTree ? p.slice(4).join('/') : '' };
    }
    if (u.hostname === 'gitlab.com') {
      const p = u.pathname.replace(/^\//, '').split('/').filter(s => s !== '-');
      const owner = p[0], repo = p[1]?.replace(/\.git$/, '');
      if (!owner || !repo) return null;
      const ti = p.indexOf('tree');
      return { platform: 'gitlab' as const, owner, repo, branch: ti >= 0 ? p[ti + 1] : 'HEAD', subpath: ti >= 0 ? p.slice(ti + 2).join('/') : '' };
    }
  } catch { /* */ }
  return null;
}

async function fetchGitHubFiles(owner: string, repo: string, branch: string, subpath: string, log: (s: string) => void) {
  log('📡 连接 GitHub API...');
  const ref = branch === 'HEAD' ? 'HEAD' : branch;
  const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`);
  if (!r.ok) throw new Error(r.status === 404 ? '仓库不存在或为私有仓库' : `GitHub API 错误 ${r.status}`);
  const { tree } = await r.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let blobs = (tree as any[]).filter((f: any) => f.type === 'blob' && ALLOWED_EXTS.test(f.path) && f.size < 500_000);
  if (subpath) blobs = blobs.filter((f: any) => (f.path as string).startsWith(subpath + '/'));
  if (!blobs.length) throw new Error('仓库中没有可部署的静态文件');
  if (blobs.length > 60) { blobs = blobs.slice(0, 60); log('⚠️ 文件较多，仅取前 60 个'); }
  log(`📦 发现 ${blobs.length} 个文件，下载中...`);
  const files: Array<{name: string; content: string}> = [];
  for (const f of blobs) {
    const cr = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${f.path}?ref=${ref}`);
    if (!cr.ok) continue;
    const cd = await cr.json();
    files.push({ name: subpath ? f.path.slice(subpath.length + 1) : f.path, content: atob(cd.content.replace(/\n/g, '')) });
  }
  return files;
}

async function fetchGitLabFiles(owner: string, repo: string, branch: string, subpath: string, log: (s: string) => void) {
  log('📡 连接 GitLab API...');
  const pid = encodeURIComponent(`${owner}/${repo}`);
  const ref = branch === 'HEAD' ? 'main' : branch;
  const r = await fetch(`https://gitlab.com/api/v4/projects/${pid}/repository/tree?recursive=true&ref=${ref}&per_page=100`);
  if (!r.ok) throw new Error(r.status === 404 ? '仓库不存在或为私有仓库' : `GitLab API 错误 ${r.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let blobs = (await r.json() as any[]).filter((f: any) => f.type === 'blob' && ALLOWED_EXTS.test(f.path));
  if (subpath) blobs = blobs.filter((f: any) => (f.path as string).startsWith(subpath + '/'));
  if (!blobs.length) throw new Error('仓库中没有可部署的静态文件');
  if (blobs.length > 60) { blobs = blobs.slice(0, 60); log('⚠️ 文件较多，仅取前 60 个'); }
  log(`📦 发现 ${blobs.length} 个文件，下载中...`);
  const files: Array<{name: string; content: string}> = [];
  for (const f of blobs) {
    const r2 = await fetch(`https://gitlab.com/api/v4/projects/${pid}/repository/files/${encodeURIComponent(f.path)}/raw?ref=${ref}`);
    if (!r2.ok) continue;
    files.push({ name: subpath ? f.path.slice(subpath.length + 1) : f.path, content: await r2.text() });
  }
  return files;
}

export default function Home() {
  const [workers, setWorkers] = useState<WorkerData[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<DeployMode>('page');
  const [lines, setLines] = useState<string[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{name: string; content: string}>>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [gitUrl, setGitUrl] = useState('');
  const [gitBranch, setGitBranch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

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
    setUploadedFiles([]);
    setGitUrl(''); setGitBranch('');
  };

  // ── Shared deploy step ───────────────────────────────────────────────────
  const deployFiles = async (files: Array<{name: string; content: string}>) => {
    const workerName = 'w-' + Math.random().toString(36).substring(2, 7);
    setLines(prev => [...prev, `✓ 正在推送至边缘沙箱 [${workerName}]...`]);
    const res = await fetch('/api/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workerName, files }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Deploy failed');
    setLines(prev => [...prev, '✓ 分配子域名与绑定路由...', `🚀 部署上线成功！访问地址: ${data.url}`]);
    fetchWorkers();
  };

  // ── Upload mode handlers ─────────────────────────────────────────────────
  const handleFileSelect = async (fileList: FileList) => {
    const files: Array<{name: string; content: string}> = [];
    for (const file of Array.from(fileList)) {
      const name = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      if (!ALLOWED_EXTS.test(name)) continue;
      try { files.push({ name, content: await file.text() }); } catch { /* skip unreadable */ }
    }
    setUploadedFiles(files);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const traverseEntry = async (entry: any, prefix: string, files: Array<{name: string; content: string}>): Promise<void> => {
    if (entry.isFile) {
      const name = prefix + entry.name;
      if (!ALLOWED_EXTS.test(name)) return;
      const content: string = await new Promise((res, rej) => entry.file((f: File) => f.text().then(res).catch(rej)));
      files.push({ name, content });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entries: any[] = await new Promise((res, rej) => reader.readEntries(res, rej));
      await Promise.all(entries.map((e: unknown) => traverseEntry(e, prefix + entry.name + '/', files)));
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const items = e.dataTransfer.items;
    if (!items) { handleFileSelect(e.dataTransfer.files); return; }
    const files: Array<{name: string; content: string}> = [];
    await Promise.all(Array.from(items).map(async item => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entry = (item as any).webkitGetAsEntry?.();
      if (entry) await traverseEntry(entry, '', files);
    }));
    setUploadedFiles(files);
  };

  const handleUploadDeploy = async () => {
    if (!uploadedFiles.length || isDeploying) return;
    setIsDeploying(true);
    setLines([`> [上传] 准备部署 ${uploadedFiles.length} 个文件...`]);
    try { await deployFiles(uploadedFiles); }
    catch (e: unknown) { setLines(prev => [...prev, `❌ 部署失败: ${(e as Error).message}`]); }
    finally { setIsDeploying(false); }
  };

  // ── Git mode handler ─────────────────────────────────────────────────────
  const handleGitDeploy = async () => {
    if (!gitUrl.trim() || isDeploying) return;
    setIsDeploying(true);
    setLines([`> [Git] 正在导入 ${gitUrl.trim()}...`]);
    const log = (msg: string) => setLines(prev => [...prev, msg]);
    try {
      const info = parseGitUrl(gitUrl.trim());
      if (!info) throw new Error('无法解析 URL，请确认格式（https://github.com/owner/repo）');
      const branch = gitBranch.trim() || info.branch;
      const files = info.platform === 'github'
        ? await fetchGitHubFiles(info.owner, info.repo, branch, info.subpath, log)
        : await fetchGitLabFiles(info.owner, info.repo, branch, info.subpath, log);
      log(`✓ 成功获取 ${files.length} 个文件`);
      await deployFiles(files);
    } catch (e: unknown) { setLines(prev => [...prev, `❌ 导入失败: ${(e as Error).message}`]); }
    finally { setIsDeploying(false); }
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

            {/* Header */}
            <div className={styles.modalHeader}>
              <h2>{MODE_TITLES[mode]}</h2>
              <button className={styles.modalClose} onClick={closeModal}>&times;</button>
            </div>

            {/* 模式选择器 2×2 */}
            <div className={styles.modeSelector}>
              {(['page', 'assistant', 'upload', 'git'] as DeployMode[]).map(m => (
                <button key={m}
                  className={`${styles.modeBtn} ${mode === m ? styles.modeBtnActive : ''}`}
                  onClick={() => { setMode(m); setLines([]); setUploadedFiles([]); }}
                  disabled={isDeploying}>
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>

            <p className={styles.modeHint}>{MODE_HINTS[mode]}</p>

            {/* ── AI 生成模式 ── */}
            {(mode === 'page' || mode === 'assistant') && (
              <div className={styles.aiInputArea}>
                <input autoFocus type="text"
                  placeholder={mode === 'assistant'
                    ? '例如：帮我做一个营销文案助手，支持小红书、微信、抖音三种风格...'
                    : '例如：帮我写一个高级炫酷的倒计时网页...'}
                  value={prompt} onChange={e => setPrompt(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleDeploy()} disabled={isDeploying} />
                <button className="btn-primary" onClick={handleDeploy}
                  disabled={isDeploying || !prompt.trim()}>
                  {isDeploying ? '生成中...' : mode === 'assistant' ? '创建助手' : '发送指令'}
                </button>
              </div>
            )}

            {/* ── 上传文件模式 ── */}
            {mode === 'upload' && (
              <div>
                <div className={`${styles.uploadZone} ${isDragging ? styles.uploadZoneActive : ''}`}
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}>
                  <div className={styles.uploadIcon}>📁</div>
                  <p style={{margin:'4px 0', fontSize:'0.9rem'}}>拖拽文件 / 文件夹到此处</p>
                  <p style={{margin:0, fontSize:'0.78rem', opacity:0.5}}>支持 HTML、CSS、JS、JSON、SVG 等静态资源</p>
                </div>
                <div className={styles.uploadBtns}>
                  <button className={styles.uploadBtn} onClick={() => fileInputRef.current?.click()}>📄 选择文件</button>
                  <button className={styles.uploadBtn} onClick={() => folderInputRef.current?.click()}>📂 选择文件夹</button>
                </div>
                {/* hidden inputs */}
                <input ref={fileInputRef} type="file" multiple style={{display:'none'}}
                  accept=".html,.htm,.css,.js,.jsx,.ts,.tsx,.json,.md,.svg,.txt,.xml,.yaml,.yml"
                  onChange={e => e.target.files && handleFileSelect(e.target.files)} />
                <input ref={folderInputRef} type="file" style={{display:'none'}}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  {...({'webkitdirectory': '', multiple: true} as any)}
                  onChange={e => e.target.files && handleFileSelect(e.target.files)} />
                {uploadedFiles.length > 0 && (<>
                  <div className={styles.fileList}>
                    <div className={styles.fileListHeader}>
                      <span>已选 {uploadedFiles.length} 个文件</span>
                      <button onClick={() => setUploadedFiles([])}>清空</button>
                    </div>
                    {uploadedFiles.slice(0, 8).map((f, i) => (
                      <div key={i} className={styles.fileItem}>
                        <span>📄 {f.name}</span>
                        <span className={styles.fileSize}>{(new TextEncoder().encode(f.content).length / 1024).toFixed(1)} KB</span>
                      </div>
                    ))}
                    {uploadedFiles.length > 8 && <div className={styles.fileItem} style={{opacity:0.5}}>…还有 {uploadedFiles.length - 8} 个文件</div>}
                  </div>
                  <button className="btn-primary" onClick={handleUploadDeploy} disabled={isDeploying}
                    style={{width:'100%', marginTop:10}}>
                    {isDeploying ? '部署中...' : `🚀 部署 ${uploadedFiles.length} 个文件`}
                  </button>
                </>)}
              </div>
            )}

            {/* ── Git 仓库模式 ── */}
            {mode === 'git' && (
              <div className={styles.gitArea}>
                <input type="url" className={styles.gitInput}
                  placeholder="https://github.com/owner/repo 或 https://gitlab.com/owner/repo"
                  value={gitUrl} onChange={e => setGitUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleGitDeploy()} disabled={isDeploying} autoFocus />
                <div className={styles.gitRow}>
                  <input type="text" className={styles.gitBranchInput}
                    placeholder="分支名（留空默认 main）"
                    value={gitBranch} onChange={e => setGitBranch(e.target.value)} disabled={isDeploying} />
                  <button className="btn-primary" onClick={handleGitDeploy}
                    disabled={isDeploying || !gitUrl.trim()}>
                    {isDeploying ? '导入中...' : '导入并部署'}
                  </button>
                </div>
                <div className={styles.gitBadges}>
                  <span>支持：</span><code>github.com</code><code>gitlab.com</code>
                  <span style={{opacity:0.5}}>（仅公开仓库）</span>
                </div>
              </div>
            )}

            {/* Terminal — 所有模式共用 */}
            <div className={styles.aiTerminal}>
              {lines.length === 0 && <div style={{opacity:0.5}}>🤖 系统待命中，请通过上面区域指派任务...</div>}
              {lines.map((line, idx) => (
                <div key={idx} className={styles.terminalLine}
                  style={{color: line.includes('🚀') ? 'var(--success)' : 'inherit'}}>
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

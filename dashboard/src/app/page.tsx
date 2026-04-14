"use client";
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { TEMPLATES } from '@/lib/templates';

interface WorkerData {
  id: string;
  name: string;
  url: string;
  status: string;
  templateId?: string;
  updatedAt?: string;
  deployedAt?: string;
}

interface DashStats {
  totalWorkers: number;
  activeWorkers: number;
  draftWorkers: number;
}

/** Format ISO date to relative time in Chinese */
function relativeTime(iso?: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)          return '刚刚';
  if (diff < 3_600_000)       return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000)      return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 86_400_000 * 30) return `${Math.floor(diff / 86_400_000)} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}

type ImportTab = 'upload' | 'git';
const ALLOWED_EXTS = /\.(html?|css|js|jsx|ts|tsx|json|md|txt|svg|ico|xml|ya?ml|webmanifest|png|jpe?g|gif|webp)$/i;
const IMAGE_EXTS   = /\.(png|jpe?g|gif|webp|ico)$/i;

type UploadFile = { name: string; content: string; encoding?: 'utf8' | 'base64' };

/**
 * Replace relative image/font refs in HTML (src, href, url()) with full OSS URLs.
 * Called after OSS upload so we have the real public URLs.
 */
function rewriteBinaryRefs(
  html: string,
  htmlDir: string,
  assetsMap: Record<string, string>, // { filePath → ossUrl }
): string {
  const resolve = (ref: string): string | null => {
    if (/^(https?:\/\/|\/\/|\/|data:)/.test(ref)) return null;
    const clean = ref.replace(/^\.\//, '').split('?')[0].split('#')[0];
    const full   = htmlDir + clean;
    return assetsMap[full]
      ?? assetsMap[clean]
      ?? Object.entries(assetsMap).find(([k]) => k.endsWith('/' + clean))?.[1]
      ?? null;
  };
  // src / href / poster attributes
  let result = html.replace(
    /\b(src|href|poster)=(["'])([^"'?#]+\.(png|jpe?g|gif|webp|ico|svg|mp4|webm|mp3|woff2?|ttf|eot))\2/gi,
    (_m, attr, q, ref) => { const u = resolve(ref); return u ? `${attr}=${q}${u}${q}` : _m; },
  );
  // url() inside inlined CSS
  result = result.replace(
    /url\(["']?([^"')]+\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf|eot))["']?\)/gi,
    (_m, ref) => { const u = resolve(ref); return u ? `url("${u}")` : _m; },
  );
  return result;
}

/**
 * Resolve an asset href/src (relative to htmlDir) to the matching UploadFile.
 * Returns undefined for absolute URLs (http/https/data:) — those stay as-is.
 */
function resolveAssetPath(htmlDir: string, ref: string, assets: UploadFile[]): UploadFile | undefined {
  if (/^(https?:\/\/|\/\/|\/|data:)/.test(ref)) return undefined; // external / absolute — skip
  const clean = ref.replace(/^\.\//, '').split('?')[0].split('#')[0]; // strip ./ query hash
  // 1. Exact match: htmlDir + href  (e.g. "my-site/" + "style.css" = "my-site/style.css")
  const full = htmlDir + clean;
  const exact = assets.find(f => f.name === full);
  if (exact) return exact;
  // 2. Fallback: match by relative path alone or trailing basename
  return assets.find(f => f.name === clean || f.name.endsWith('/' + clean));
}

/** MIME type for any static asset (used when building FormData blobs) */
function getClientMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const MAP: Record<string, string> = {
    css: 'text/css', js: 'application/javascript', mjs: 'application/javascript',
    json: 'application/json', xml: 'application/xml', txt: 'text/plain',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon',
    woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf',
    eot: 'application/vnd.ms-fontobject', otf: 'font/otf',
    mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg',
  };
  return MAP[ext] || 'application/octet-stream';
}

/** Read a File as base64 string (strips the data-URL prefix) */
function readAsBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload  = e => res((e.target!.result as string).split(',')[1]);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

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
  const router = useRouter();
  const [workers, setWorkers] = useState<WorkerData[]>([]);
  const [stats,   setStats]   = useState<DashStats>({ totalWorkers: 0, activeWorkers: 0, draftWorkers: 0 });
  const [isFetching, setIsFetching] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalTab, setModalTab] = useState<'templates' | 'import'>('templates');
  const [importTab, setImportTab] = useState<ImportTab>('upload');
  const [lines, setLines] = useState<string[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [gitUrl, setGitUrl] = useState('');
  const [gitBranch, setGitBranch] = useState('');
  // When set, deploy overwrites this existing workerName instead of creating a new one
  const [updateTargetId, setUpdateTargetId] = useState<string | null>(null);
  // Delete confirmation: holds the workerName pending deletion
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const fetchWorkers = () =>
    fetch('/api/workers')
      .then(res => res.json())
      .then(data => {
        if (data.workers) setWorkers(data.workers);
        if (data.stats)   setStats(data.stats);
      })
      .catch(err => console.error("Failed to fetch workers:", err))
      .finally(() => setIsFetching(false));

  // ── Read session from URL params (cross-origin handoff from landing page) ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      const session = {
        authorization: token,
        nickname: params.get('nickname') || undefined,
        contact:  params.get('contact')  || undefined,
        email:    params.get('email')    || undefined,
      };
      try { localStorage.setItem('neoStudioSession', JSON.stringify(session)); } catch { /* ignore */ }
      // Clean URL so the token isn't visible / bookmarked
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);
      // Dispatch storage event so UserMenu re-reads immediately
      window.dispatchEvent(new Event('neoSessionUpdated'));
    }
    fetchWorkers();
  }, []);
  
  const closeModal = () => {
    if (isDeploying) return;
    setShowModal(false);
    setLines([]);
    setUploadedFiles([]);
    setGitUrl(''); setGitBranch('');
    setModalTab('templates');
    setUpdateTargetId(null);
    fetchWorkers(); // always refresh list on close
  };

  const handleTemplateSelect = (templateId: string) => {
    router.push(`/vibe/new?template=${templateId}`);
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/workers/${deleteConfirmId}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteConfirmId(null);
        await fetchWorkers();
      } else {
        const d = await res.json();
        alert('删除失败: ' + (d.error || '未知错误'));
      }
    } catch (e: unknown) {
      alert('删除失败: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsDeleting(false);
    }
  };

  // ── Shared deploy step ───────────────────────────────────────────────────
  const deployFiles = async (files: UploadFile[]) => {
    const workerName   = updateTargetId ?? ('w-' + Math.random().toString(36).substring(2, 7));
    const htmlFiles    = files.filter(f => /\.html?$/i.test(f.name) && f.encoding !== 'base64');
    const binaryAssets = files.filter(f => f.encoding === 'base64'); // images / fonts
    const textAssets   = files.filter(f => f.encoding !== 'base64' && !/\.html?$/i.test(f.name)); // CSS / JS

    if (!htmlFiles.length) throw new Error('没有找到 HTML 文件，请确认上传的文件夹包含 index.html');

    const mainHtml = htmlFiles.find(f => /(?:^|\/)index\.html?$/i.test(f.name)) ?? htmlFiles[0];
    const htmlDir  = mainHtml.name.replace(/[^/]*$/, ''); // "my-site/index.html" → "my-site/"

    // ── 1. Inline CSS / JS directly into each HTML file ─────────────────────
    //    (avoids OSS ACL / CORS issues for text assets entirely)
    if (textAssets.length > 0) {
      setLines(prev => [...prev, `📝 内联 ${textAssets.length} 个 CSS/JS 文件...`]);
    }
    const processedHtmlFiles = htmlFiles.map(htmlFile => {
      const dir = htmlFile.name.replace(/[^/]*$/, '');
      let content = htmlFile.content;

      // <link ... href="*.css" ...>  →  <style>/* css */</style>
      content = content.replace(
        /<link([^>]*)href=["']([^"'?#]+\.css)["']([^>]*)\/?>/gi,
        (_m, _a, href, _b) => {
          const f = resolveAssetPath(dir, href, textAssets);
          return f ? `<style>\n${f.content}\n</style>` : _m;
        },
      );

      // <script src="*.js"></script>  →  <script>/* js */</script>
      content = content.replace(
        /<script([^>]*)src=["']([^"'?#]+\.m?js)["']([^>]*)><\/script>/gi,
        (_m, _a, src, _b) => {
          const f = resolveAssetPath(dir, src, textAssets);
          return f ? `<script>\n${f.content}\n</script>` : _m;
        },
      );

      return { ...htmlFile, content };
    });

    // ── 2. Upload binary assets (images / fonts) to OSS ─────────────────────
    let assetsMap: Record<string, string> = {};
    if (binaryAssets.length > 0) {
      setLines(prev => [...prev, `⬆ 上传 ${binaryAssets.length} 张图片到 OSS...`]);
      const fd = new FormData();
      fd.append('workerName', workerName);
      for (const f of binaryAssets) {
        const mime   = getClientMime(f.name);
        const binary = atob(f.content);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        fd.append('files', new Blob([bytes], { type: mime }), f.name);
      }
      const uploadRes = await fetch('/api/oss-upload', { method: 'POST', body: fd });
      if (!uploadRes.ok) {
        const e = await uploadRes.json();
        throw new Error(e.error || 'OSS 上传失败');
      }
      const uploadData = await uploadRes.json() as { files: { name: string; url: string }[] };
      // Build map: { filePath → ossUrl }
      for (const { name, url } of uploadData.files) {
        assetsMap[name] = url;
      }
      setLines(prev => [...prev, `✓ ${binaryAssets.length} 张图片已上传至 OSS`]);
    }

    // ── 3. Rewrite binary references in HTML to absolute OSS URLs ────────────
    const finalHtmlFiles = processedHtmlFiles.map(htmlFile => {
      const dir = htmlFile.name.replace(/[^/]*$/, '');
      if (Object.keys(assetsMap).length === 0) return htmlFile;
      return { ...htmlFile, content: rewriteBinaryRefs(htmlFile.content, dir, assetsMap) };
    });

    // ── 4. Deploy processed HTML to TableStore ───────────────────────────────
    setLines(prev => [...prev, `✓ 正在推送至边缘沙箱 [${workerName}]...`]);
    const res = await fetch('/api/deploy', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ workerName, files: finalHtmlFiles }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Deploy failed');
    const verb = updateTargetId ? '更新' : '部署';
    setLines(prev => [...prev, '✓ 分配子域名与绑定路由...', `🚀 ${verb}上线成功！访问地址: ${data.url}`]);
    await fetchWorkers();
    setTimeout(() => {
      setShowModal(false); setLines([]); setUploadedFiles([]);
      setGitUrl(''); setGitBranch(''); setModalTab('templates');
      setUpdateTargetId(null);
    }, 2000);
  };

  // ── Upload mode handlers ─────────────────────────────────────────────────
  const handleFileSelect = async (fileList: FileList) => {
    const files: UploadFile[] = [];
    for (const file of Array.from(fileList)) {
      const name = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      if (!ALLOWED_EXTS.test(name)) continue;
      try {
        if (IMAGE_EXTS.test(name)) {
          files.push({ name, content: await readAsBase64(file), encoding: 'base64' });
        } else {
          files.push({ name, content: await file.text() });
        }
      } catch { /* skip unreadable */ }
    }
    setUploadedFiles(files);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const traverseEntry = async (entry: any, prefix: string, files: UploadFile[]): Promise<void> => {
    if (entry.isFile) {
      const name = prefix + entry.name;
      if (!ALLOWED_EXTS.test(name)) return;
      if (IMAGE_EXTS.test(name)) {
        const content: string = await new Promise((res, rej) =>
          entry.file((f: File) => readAsBase64(f).then(res).catch(rej))
        );
        files.push({ name, content, encoding: 'base64' });
      } else {
        const content: string = await new Promise((res, rej) => entry.file((f: File) => f.text().then(res).catch(rej)));
        files.push({ name, content });
      }
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
    const files: UploadFile[] = [];
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
          <h3>总项目数</h3>
          <div className={styles.statValue}>{stats.totalWorkers} 个</div>
          <div className={styles.statTrend}>{stats.activeWorkers} 已发布 · {stats.draftWorkers} 草稿</div>
        </div>
        <div className={`glass-card animate-fade-in`} style={{ animationDelay: '0.4s' }}>
          <h3>已发布应用</h3>
          <div className={styles.statValue}>{stats.activeWorkers} 个</div>
          <div className={styles.statTrend}>{stats.activeWorkers > 0 ? '线上运行中' : '暂无已发布应用'}</div>
        </div>
        <div className={`glass-card animate-fade-in`} style={{ animationDelay: '0.5s' }}>
          <h3>草稿项目</h3>
          <div className={styles.statValue}>{stats.draftWorkers} 个</div>
          <div className={styles.statTrend}>{stats.draftWorkers > 0 ? '点击卡片继续编辑' : '暂无草稿'}</div>
        </div>
      </div>

      <h2 className="animate-fade-in" style={{ animationDelay: '0.6s', marginTop: 48, marginBottom: 24 }}>我的项目</h2>
      {isFetching ? (
        <div className="animate-pulse" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
          ⏳ 数据从云端加载中，请稍候...
        </div>
      ) : (
      <div className={styles.workersGrid}>
        {workers.map((worker, i) => {
          const isDraft = worker.status === 'draft';
          const vibeHref = `/vibe/${worker.id}`;
          return (
            <div
              key={worker.id}
              className={`glass-card animate-fade-in ${isDraft ? styles.draftCard : ''}`}
              style={{ animationDelay: `${0.7 + i * 0.1}s`, cursor: 'pointer' }}
              onClick={() => router.push(vibeHref)}
            >
              <div className={styles.workerHeader}>
                <h3>{worker.name}</h3>
                {isDraft
                  ? <span className={styles.draftBadge}>草稿</span>
                  : <span className={styles.activeBadge}>已发布</span>}
              </div>
              <span className={styles.workerUrl}>
                {isDraft
                  ? (worker.templateId
                      ? `模板：${TEMPLATES.find(t => t.id === worker.templateId)?.name ?? worker.templateId}`
                      : '空白项目')
                  : worker.url}
              </span>
              <div className={styles.workerStatus}>
                {isDraft ? (
                  <span className={styles.editHint}>✏️ 点击继续编辑</span>
                ) : (
                  <>
                    <span className={`status-dot ${worker.status}`}></span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>运行中</span>
                  </>
                )}
                <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-secondary)', opacity: 0.6 }}>
                  {relativeTime(worker.updatedAt || worker.deployedAt)}
                </span>
              </div>
              {/* Action buttons — stopPropagation so they don't navigate */}
              <div className={styles.cardActions} onClick={e => e.stopPropagation()}>
                {!isDraft && (
                  <a href={worker.url} target="_blank" rel="noreferrer" className={styles.cardBtn}>
                    🌐 访问
                  </a>
                )}
                <Link href={vibeHref} className={styles.cardBtn}>✏️ 编辑</Link>
                <button
                  className={styles.cardBtn}
                  onClick={() => {
                    setUpdateTargetId(worker.id);
                    setModalTab('import');
                    setImportTab('upload');
                    setLines([]);
                    setUploadedFiles([]);
                    setShowModal(true);
                  }}
                >
                  🔄 更新
                </button>
                <button
                  className={`${styles.cardBtn} ${styles.cardBtnDanger}`}
                  onClick={() => setDeleteConfirmId(worker.id)}
                >
                  🗑 删除
                </button>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {showModal && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={`glass-card ${styles.modalContent}`} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className={styles.modalHeader}>
              <h2>{updateTargetId ? `🔄 更新项目` : '✨ 新建 Worker'}</h2>
              <button className={styles.modalClose} onClick={closeModal}>&times;</button>
            </div>

            {/* 顶级 Tab：更新模式只显示导入，新建模式显示全部 */}
            {!updateTargetId && (
              <div className={styles.importTabs}>
                <button
                  className={`${styles.importTab} ${modalTab === 'templates' ? styles.importTabActive : ''}`}
                  onClick={() => setModalTab('templates')}>
                  🎨 从模板创建
                </button>
                <button
                  className={`${styles.importTab} ${modalTab === 'import' ? styles.importTabActive : ''}`}
                  onClick={() => setModalTab('import')}>
                  📦 导入项目
                </button>
              </div>
            )}

            {/* ── 模板画廊 ── */}
            {modalTab === 'templates' && (
              <div className={styles.templateGallery}>
                {TEMPLATES.map(t => (
                  <button key={t.id} className={styles.templateCard} onClick={() => handleTemplateSelect(t.id)}>
                    <div className={styles.templateIcon}>{t.icon}</div>
                    <div className={styles.templateName}>{t.name}</div>
                    <div className={styles.templateDesc}>{t.desc}</div>
                  </button>
                ))}
              </div>
            )}

            {/* ── 导入项目 ── */}
            {(modalTab === 'import' || updateTargetId) && (
              <>
                <div className={styles.modeSelector}>
                  <button
                    className={`${styles.modeBtn} ${importTab === 'upload' ? styles.modeBtnActive : ''}`}
                    onClick={() => { setImportTab('upload'); setLines([]); setUploadedFiles([]); }}
                    disabled={isDeploying}>
                    📁 上传文件
                  </button>
                  <button
                    className={`${styles.modeBtn} ${importTab === 'git' ? styles.modeBtnActive : ''}`}
                    onClick={() => { setImportTab('git'); setLines([]); }}
                    disabled={isDeploying}>
                    🔗 Git 仓库
                  </button>
                </div>

                {/* 上传文件 */}
                {importTab === 'upload' && (
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

                {/* Git 仓库 */}
                {importTab === 'git' && (
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

                {/* Terminal */}
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
              </>
            )}

          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ─────────────────────────────────────── */}
      {deleteConfirmId && (
        <div className={styles.modalOverlay} onClick={() => !isDeleting && setDeleteConfirmId(null)}>
          <div className={styles.confirmBox} onClick={e => e.stopPropagation()}>
            <div className={styles.confirmIcon}>🗑</div>
            <h3>确认删除</h3>
            <p>
              确定要删除项目 <strong>{deleteConfirmId}</strong> 吗？
              <br />此操作不可撤销。
            </p>
            <div className={styles.confirmActions}>
              <button
                className="btn-secondary"
                onClick={() => setDeleteConfirmId(null)}
                disabled={isDeleting}
              >
                取消
              </button>
              <button
                className={styles.confirmDeleteBtn}
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";
import { use, useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import styles from './page.module.css';
import { getTemplateById } from '@/lib/templates';

// Monaco Editor — loaded client-side only (no SSR)
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

/** Detect Monaco language from code content */
function detectLanguage(src: string): string {
  const s = src.trimStart();
  if (s.startsWith('<!') || s.startsWith('<html') || /<(div|p|span|head|body|script|style)/i.test(s)) return 'html';
  if (s.startsWith('{') || s.startsWith('[')) return 'json';
  if (/^(const|let|var|function|import|export|class|async|interface|type)/.test(s)) return 'typescript';
  if (/^[a-z#.*:[]/i.test(s) && s.includes('{')) return 'css';
  return 'html';
}

const MONACO_OPTIONS = {
  fontSize:             13,
  fontFamily:           "'Fira Code', 'Cascadia Code', 'JetBrains Mono', 'SF Mono', monospace",
  fontLigatures:        true,
  minimap:              { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout:      true,
  wordWrap:             'on' as const,
  lineNumbers:          'on' as const,
  folding:              true,
  bracketPairColorization: { enabled: true },
  formatOnPaste:        true,
  formatOnType:         true,
  tabSize:              2,
  smoothScrolling:      true,
  cursorBlinking:       'smooth' as const,
  renderLineHighlight:  'all' as const,
  scrollbar:            { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
  padding:              { top: 12 },
};

interface ChatMessage { role: 'user' | 'ai' | 'status' | 'plan'; text: string; }
type SaveStatus = 'saved' | 'saving' | 'unsaved';

interface UploadedFile {
  name: string;
  content: string;  // base64
  encoding: 'base64';
  dataUrl: string;  // for local preview (data:image/...;base64,...)
}

const IMAGE_EXTS = /\.(png|jpe?g|gif|webp|svg|ico)$/i;

/** Replace src="filename.ext" with inline data URLs for local preview */
function resolveImagesForPreview(html: string, files: UploadedFile[]): string {
  let result = html;
  for (const f of files) {
    const escaped = f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(
      new RegExp(`(src=["'])${escaped}(["'])`, 'g'),
      `$1${f.dataUrl}$2`,
    );
  }
  return result;
}

export default function VibePage({ params }: { params: Promise<{ id: string }> }) {
  const { id }       = use(params);
  const router       = useRouter();
  const searchParams = useSearchParams();
  const templateId   = searchParams.get('template') ?? 'blank';
  const isNew        = id === 'new';

  // Stable worker ID: generate once if new
  const [workerId] = useState(() =>
    isNew ? 'w-' + Math.random().toString(36).slice(2, 7) : id,
  );

  const [code, setCode]   = useState(() => getTemplateById(templateId).html);
  const [loaded, setLoaded] = useState(isNew); // new projects start as "loaded"
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { role: 'ai', text: isNew
        ? `👋 我已加载「${getTemplateById(templateId).name}」模板。告诉我你想要什么样的效果吧！`
        : '⏳ 正在加载项目...' },
  ]);
  const [input,        setInput]        = useState('');
  const [isStreaming,  setIsStreaming]  = useState(false);
  const [rightTab,     setRightTab]     = useState<'code' | 'preview'>('preview');
  const [previewSrc,   setPreviewSrc]   = useState(() => isNew ? getTemplateById(templateId).html : '');
  const [codeChanged,  setCodeChanged]  = useState(false);
  const [publishing,    setPublishing]    = useState(false);
  const [publishedUrl,  setPublishedUrl]  = useState('');
  const [saveStatus,    setSaveStatus]    = useState<SaveStatus>('saved');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  const msgEndRef    = useRef<HTMLDivElement>(null);
  const historyRef   = useRef<Array<{ role: string; content: string }>>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Full-screen: hide layout nav & padding ────────────────────────────────
  useEffect(() => {
    document.body.classList.add('vibe-fullscreen');
    return () => document.body.classList.remove('vibe-fullscreen');
  }, []);

  // Auto-scroll chat
  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Load existing project (when id !== 'new') ─────────────────────────────
  useEffect(() => {
    if (isNew) {
      // Save draft immediately for new projects
      saveDraft(workerId, templateId, code);
      return;
    }
    fetch(`/api/workers/${workerId}`)
      .then(r => r.json())
      .then((d) => {
        const content = d.worker?.content || d.content;
        if (content) {
          setCode(content);
          setPreviewSrc(content);
          setMessages([{ role: 'ai', text: `👋 项目「${workerId}」已加载，继续和我聊聊你想怎么改进吧！` }]);
        } else {
          setMessages([{ role: 'ai', text: `👋 已就绪，开始编辑「${workerId}」吧！` }]);
        }
        setLoaded(true);
      })
      .catch(() => {
        setMessages([{ role: 'ai', text: '⚠️ 无法加载已有项目，使用空白画布。' }]);
        setLoaded(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Save draft helper ──────────────────────────────────────────────────────
  const saveDraft = useCallback(async (wid: string, tid: string, html: string) => {
    setSaveStatus('saving');
    try {
      await fetch('/api/draft', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workerName: wid, templateId: tid, code: html }),
      });
      setSaveStatus('saved');
    } catch {
      setSaveStatus('unsaved');
    }
  }, []);

  // ── Debounced auto-save when code changes ─────────────────────────────────
  useEffect(() => {
    if (!loaded) return;
    setSaveStatus('unsaved');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveDraft(workerId, templateId, code);
    }, 2000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const addMsg = useCallback((msg: ChatMessage) =>
    setMessages(prev => [...prev, msg]), []);

  // ── Image file upload ────────────────────────────────────────────────────
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []).filter(f => IMAGE_EXTS.test(f.name));
    if (!selected.length) return;
    selected.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        // dataUrl = "data:image/png;base64,XXXX"
        const base64 = dataUrl.split(',')[1];
        setUploadedFiles(prev => {
          // Replace if same name already uploaded
          const filtered = prev.filter(f => f.name !== file.name);
          return [...filtered, { name: file.name, content: base64, encoding: 'base64', dataUrl }];
        });
        addMsg({ role: 'ai', text: `📎 已上传「${file.name}」，在 HTML 中用 <img src="${file.name}"> 引用它。` });
      };
      reader.readAsDataURL(file);
    });
    // Reset input so same file can be re-uploaded
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [addMsg]);

  // ── Send chat message to AI ─────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    addMsg({ role: 'user', text });
    historyRef.current = [...historyRef.current, { role: 'user', content: text }];
    setIsStreaming(true);

    try {
      const res = await fetch('/api/vibe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: historyRef.current, currentCode: code }),
      });
      if (!res.body) throw new Error('No response body');

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let aiText = '';
      let newHtml = '';

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
            if (evt.type === 'status') {
              setMessages(prev => {
                const last = prev[prev.length - 1];
                return last?.role === 'status'
                  ? [...prev.slice(0, -1), { role: 'status', text: evt.text }]
                  : [...prev, { role: 'status', text: evt.text }];
              });
            }
            if (evt.type === 'plan') {
              // Replace status bubble with plan card
              setMessages(prev =>
                prev.filter(m => m.role !== 'status').concat({ role: 'plan', text: evt.text })
              );
            }
            if (evt.type === 'text' || evt.type === 'flush') { aiText += evt.text; }
            if (evt.type === 'html') { newHtml = evt.html; }
            if (evt.type === 'done') {
              setMessages(prev =>
                prev.filter(m => m.role !== 'status').concat({
                  role: 'ai',
                  text: aiText.replace(/<<<HTML>>>[\s\S]*?<<<END_HTML>>>/g, '').trim() || '✅ 代码已按计划更新！',
                })
              );
              if (newHtml) { setCode(newHtml); setCodeChanged(true); setLoaded(true); }
              historyRef.current = [...historyRef.current, { role: 'assistant', content: aiText }];
            }
            if (evt.type === 'error') { addMsg({ role: 'ai', text: '❌ ' + evt.text }); }
          } catch { /* skip */ }
        }
      }
    } catch (e: unknown) {
      addMsg({ role: 'ai', text: '❌ 网络错误：' + (e instanceof Error ? e.message : String(e)) });
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, code, addMsg]);

  // ── Show preview (inline images so they render locally) ─────────────────
  const showPreview = useCallback(() => {
    const resolved = uploadedFiles.length > 0 ? resolveImagesForPreview(code, uploadedFiles) : code;
    setPreviewSrc(resolved);
    setCodeChanged(false);
    setRightTab('preview');
  }, [code, uploadedFiles]);

  // ── Publish ─────────────────────────────────────────────────────────────
  const handlePublish = useCallback(async () => {
    setPublishing(true);
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    try {
      const assets: Record<string, string> = {};

      // 1. Upload images via CF Worker → OSS (FormData, no CORS, no base64)
      if (uploadedFiles.length > 0) {
        addMsg({ role: 'ai', text: `⬆ 上传 ${uploadedFiles.length} 张图片到 OSS...` });
        const fd = new FormData();
        fd.append('workerName', workerId);
        for (const f of uploadedFiles) {
          const binary = atob(f.content);
          const bytes  = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const mime = f.dataUrl.split(';')[0].replace('data:', '') || 'image/png';
          fd.append('files', new Blob([bytes], { type: mime }), f.name);
        }
        const uploadRes = await fetch('/api/oss-upload', { method: 'POST', body: fd });
        if (!uploadRes.ok) {
          const e = await uploadRes.json();
          throw new Error(e.error || 'OSS upload failed');
        }
        const { files: uploaded } = await uploadRes.json() as { files: Array<{ name: string; url: string }> };
        for (const { name, url } of uploaded) assets[name] = url;
      }

      // 2. Deploy HTML + asset map
      const res = await fetch('/api/deploy', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          workerName: workerId,
          files: [{ name: 'index.html', content: code }],
          assets,
        }),
      });
      const d = await res.json();
      if (res.ok) {
        setPublishedUrl(d.url);
        setSaveStatus('saved');
        addMsg({ role: 'ai', text: `✅ 已发布上线！访问地址：${d.url}` });
        setTimeout(() => router.push('/'), 1500);
      } else {
        addMsg({ role: 'ai', text: '❌ 发布失败：' + (d.error || '未知错误') });
      }
    } catch (e: unknown) {
      addMsg({ role: 'ai', text: '❌ 发布异常：' + (e instanceof Error ? e.message : String(e)) });
    } finally { setPublishing(false); }
  }, [workerId, code, uploadedFiles, addMsg, router]);

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link href="/" className={styles.backLink}>← 控制台</Link>
          <span className={styles.workerName}>✦ {workerId}</span>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.saveIndicator} data-status={saveStatus}>
            {saveStatus === 'saving'  ? '💾 保存中...'  :
             saveStatus === 'unsaved' ? '● 未保存'      : '✓ 已自动保存'}
          </span>
          {publishedUrl && (
            <a href={publishedUrl} target="_blank" rel="noreferrer" className={styles.publishedTag}>
              ✅ 已发布 ↗
            </a>
          )}
          <button className={styles.publishBtn} onClick={handlePublish} disabled={publishing || !loaded}>
            {publishing ? '发布中...' : '🚀 发布上线'}
          </button>
        </div>
      </header>

      {/* ── Left: Chat ── */}
      <aside className={styles.chatPanel}>
        <div className={styles.chatMessages}>
          {messages.map((m, i) => (
            m.role === 'plan' ? (
              <div key={i} className={styles.msgPlan}>
                <div className={styles.msgPlanTitle}>📋 实现计划</div>
                <div className={styles.msgPlanBody}>{m.text}</div>
              </div>
            ) : (
              <div key={i} className={`${styles.msgBubble} ${
                m.role === 'user' ? styles.msgUser :
                m.role === 'status' ? styles.msgStatus : styles.msgAi
              }`}>
                {m.text}
              </div>
            )
          ))}
          {isStreaming && <div className={styles.msgStatus}>⏳ AI 生成中...</div>}
          <div ref={msgEndRef} />
        </div>
        <div className={styles.chatInput}>
          {/* Uploaded files list */}
          {uploadedFiles.length > 0 && (
            <div className={styles.uploadedFiles}>
              {uploadedFiles.map(f => (
                <span key={f.name} className={styles.uploadedFileTag} title={f.name}>
                  <img src={f.dataUrl} alt="" className={styles.uploadedFileThumb} />
                  {f.name}
                  <button
                    className={styles.uploadedFileRemove}
                    onClick={() => setUploadedFiles(prev => prev.filter(x => x.name !== f.name))}
                    title="移除"
                  >×</button>
                </span>
              ))}
            </div>
          )}
          <div className={styles.chatInputRow}>
            <textarea
              className={styles.chatTextarea}
              rows={2}
              placeholder="描述你想要的修改，例如：把背景改成蓝色渐变，加一个联系表单..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              disabled={isStreaming}
            />
            <button className={styles.sendBtn} onClick={handleSend} disabled={isStreaming || !input.trim()}>
              {isStreaming ? '...' : '发送'}
            </button>
          </div>
          <div className={styles.chatInputActions}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            <button
              className={styles.uploadBtn}
              onClick={() => fileInputRef.current?.click()}
              title="上传图片（PNG / JPG / GIF / WebP）"
            >
              📎 上传图片
            </button>
            <span className={styles.chatHint}>Enter 发送 · Shift+Enter 换行</span>
          </div>
        </div>
      </aside>

      {/* ── Right: Code + Preview ── */}
      <section className={styles.rightPanel}>
        <div className={styles.tabBar}>
          <button className={`${styles.tab} ${rightTab === 'code' ? styles.tabActive : ''}`} onClick={() => setRightTab('code')}>💻 代码</button>
          <button className={`${styles.tab} ${rightTab === 'preview' ? styles.tabActive : ''}`} onClick={showPreview}>
            👁 预览{codeChanged && <span className={styles.codeUpdatedDot} title="代码已更新，点击刷新预览" />}
          </button>
          <div className={styles.tabSpacer} />
        </div>

        {rightTab === 'code' && (
          <div className={styles.editorWrap}>
            <MonacoEditor
              height="100%"
              language={detectLanguage(code)}
              value={code}
              theme="vs-dark"
              options={MONACO_OPTIONS}
              onChange={(v) => { setCode(v ?? ''); setCodeChanged(true); }}
            />
          </div>
        )}

        {rightTab === 'preview' && (
          <div className={styles.previewWrap}>
            {previewSrc
              ? <iframe className={styles.previewIframe} srcDoc={previewSrc} sandbox="allow-scripts allow-forms allow-same-origin allow-modals allow-popups" title="preview" />
              : <div className={styles.previewPlaceholder}><span>点击「👁 预览」标签加载页面</span><button onClick={showPreview}>加载预览</button></div>
            }
          </div>
        )}
      </section>
    </div>
  );
}

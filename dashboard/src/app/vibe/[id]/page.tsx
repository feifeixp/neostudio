"use client";
import { use, useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import styles from './page.module.css';
import { getTemplateById } from '@/lib/templates';

interface ChatMessage { role: 'user' | 'ai' | 'status'; text: string; }

export default function VibePage({ params }: { params: Promise<{ id: string }> }) {
  const { id }          = use(params);
  const searchParams    = useSearchParams();
  const templateId      = searchParams.get('template') ?? 'blank';

  // Stable worker ID: if URL id is 'new', generate one client-side
  const [workerId]       = useState(() => id === 'new' ? 'w-' + Math.random().toString(36).slice(2, 7) : id);
  const [code, setCode]  = useState(() => getTemplateById(templateId).html);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { role: 'ai', text: `👋 我已加载「${getTemplateById(templateId).name}」模板。告诉我你想要什么样的效果吧！` },
  ]);
  const [input,       setInput]       = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [rightTab,    setRightTab]    = useState<'code' | 'preview'>('code');
  const [previewSrc,  setPreviewSrc]  = useState('');
  const [codeChanged, setCodeChanged] = useState(false);
  const [publishing,  setPublishing]  = useState(false);
  const [publishedUrl,setPublishedUrl]= useState('');

  const msgEndRef   = useRef<HTMLDivElement>(null);
  const historyRef  = useRef<Array<{ role: string; content: string }>>([]);

  // Auto-scroll chat
  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const addMsg = useCallback((msg: ChatMessage) =>
    setMessages(prev => [...prev, msg]), []);

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
                return last?.role === 'status' ? [...prev.slice(0, -1), { role: 'status', text: evt.text }] : [...prev, { role: 'status', text: evt.text }];
              });
            }
            if (evt.type === 'text' || evt.type === 'flush') { aiText += evt.text; }
            if (evt.type === 'html') { newHtml = evt.html; }
            if (evt.type === 'done') {
              // Remove status bubble, add final AI message
              setMessages(prev => prev.filter(m => m.role !== 'status').concat({ role: 'ai', text: aiText.replace(/<<<HTML>>>[\s\S]*?<<<END_HTML>>>/g, '').trim() || '代码已更新！' }));
              if (newHtml) { setCode(newHtml); setCodeChanged(true); }
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

  // ── Show preview ────────────────────────────────────────────────────────
  const showPreview = useCallback(() => {
    setPreviewSrc(code);
    setCodeChanged(false);
    setRightTab('preview');
  }, [code]);

  // ── Publish ─────────────────────────────────────────────────────────────
  const handlePublish = useCallback(async () => {
    setPublishing(true);
    try {
      const res = await fetch('/api/deploy', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workerName: workerId, files: [{ name: 'index.html', content: code }] }),
      });
      const d = await res.json();
      if (res.ok) setPublishedUrl(d.url);
      else addMsg({ role: 'ai', text: '❌ 发布失败：' + (d.error || '未知错误') });
    } catch (e: unknown) {
      addMsg({ role: 'ai', text: '❌ 发布异常：' + (e instanceof Error ? e.message : String(e)) });
    } finally { setPublishing(false); }
  }, [workerId, code, addMsg]);

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link href="/" className={styles.backLink}>← 控制台</Link>
          <span className={styles.workerName}>✦ {workerId}</span>
        </div>
        <div className={styles.headerRight}>
          {publishedUrl && (
            <a href={publishedUrl} target="_blank" rel="noreferrer" className={styles.publishedTag}>
              ✅ 已发布 ↗
            </a>
          )}
          <button className={styles.publishBtn} onClick={handlePublish} disabled={publishing}>
            {publishing ? '发布中...' : '🚀 发布上线'}
          </button>
        </div>
      </header>

      {/* ── Left: Chat ── */}
      <aside className={styles.chatPanel}>
        <div className={styles.chatMessages}>
          {messages.map((m, i) => (
            <div key={i} className={`${styles.msgBubble} ${m.role === 'user' ? styles.msgUser : m.role === 'status' ? styles.msgStatus : styles.msgAi}`}>
              {m.text}
            </div>
          ))}
          {isStreaming && <div className={styles.msgStatus}>⏳ AI 生成中...</div>}
          <div ref={msgEndRef} />
        </div>
        <div className={styles.chatInput}>
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
          <span className={styles.chatHint}>Enter 发送 · Shift+Enter 换行</span>
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
            <textarea
              className={styles.codeEditor}
              value={code}
              onChange={e => { setCode(e.target.value); setCodeChanged(true); }}
              spellCheck={false}
            />
          </div>
        )}

        {rightTab === 'preview' && (
          <div className={styles.previewWrap}>
            {previewSrc
              ? <iframe className={styles.previewIframe} srcDoc={previewSrc} sandbox="allow-scripts allow-forms" title="preview" />
              : <div className={styles.previewPlaceholder}><span>点击「👁 预览」标签加载页面</span><button onClick={showPreview}>加载预览</button></div>
            }
          </div>
        )}
      </section>
    </div>
  );
}

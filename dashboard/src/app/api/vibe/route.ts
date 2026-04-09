import { createClient, hasKey, GEN_MODEL, FAST_MODEL } from '@/lib/openrouter';

export const maxDuration = 120;

// ── Phase 1: Analysis system prompt ─────────────────────────────────────────
const ANALYSIS_SYSTEM = `你是代码需求分析师。分析用户对 HTML 单页应用的修改请求，输出简洁实现计划（中文）。

严格按以下格式输出（不要其他内容）：
**将要改动：**
• [模块/组件] — [一句话说明改动]
• ...（2-5 条）

**注意保留：**
• [已有功能或样式，改动时不能破坏的]（若无特别注意则输出"无"）`;

// ── Phase 2: Code generation system prompt ───────────────────────────────────
const GEN_SYSTEM = `你是专业前端工程师，根据实现计划修改 HTML 单页应用。

回复格式（严格按此，标记必须单独占行）：
用 1-2 句中文说明本次做了哪些改动。
<<<HTML>>>
<!DOCTYPE html>
...完整更新后的 HTML（CSS 和 JS 全部内联）...
<<<END_HTML>>>

⚠️ 关键要求：
- 必须输出能直接运行的完整 HTML，不能省略任何已有内容
- 保留所有已有功能，只改计划中的部分
- 设计规范：深色系（背景 #0d0f12，主色 #6366f1），现代简洁
- 代码健壮、有错误处理`;

export async function POST(req: Request) {
  const { messages, currentCode } = await req.json() as {
    messages: Array<{ role: string; content: string }>;
    currentCode: string;
  };

  if (!messages?.length) {
    return Response.json({ error: 'messages required' }, { status: 400 });
  }

  // No API key → mock
  if (!hasKey()) {
    const enc = new TextEncoder();
    const mock = new ReadableStream({
      start(c) {
        const send = (d: object) => c.enqueue(enc.encode(`data: ${JSON.stringify(d)}\n\n`));
        send({ type: 'text', text: '未配置 OPENROUTER_API_KEY，无法调用 AI。请在 Vercel 环境变量中添加后重新部署。' });
        send({ type: 'done' });
        c.close();
      },
    });
    return new Response(mock, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
  }

  const client  = createClient();
  const encoder = new TextEncoder();

  // Extract the latest user message for analysis
  const history  = messages.slice(-8);
  const lastMsg  = history[history.length - 1];
  const userText = lastMsg?.content ?? '';

  const stream = new ReadableStream({
    async start(controller) {
      const send = (d: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(d)}\n\n`));

      try {
        // ── Phase 1: Analysis ──────────────────────────────────────────────
        send({ type: 'status', text: '📋 分析需求...' });

        const analysisRes = await client.chat.completions.create({
          model:      FAST_MODEL,
          max_tokens: 400,
          stream:     false,
          messages:   [
            { role: 'system', content: ANALYSIS_SYSTEM },
            { role: 'user',   content: `用户请求：${userText}\n\n当前代码（前 3000 字符）：\n${(currentCode ?? '').slice(0, 3000)}` },
          ],
        });
        const plan = (analysisRes.choices[0]?.message?.content ?? '').trim();
        // Send plan as a special message type — UI will render it as a plan card
        send({ type: 'plan', text: plan });

        // ── Phase 2: Code generation (streaming) ───────────────────────────
        send({ type: 'status', text: '⚡ 生成代码中...' });

        // Build conversation history for generation, inject code + plan
        const withContext = [
          ...history.slice(0, -1),
          {
            role:    'user',
            content: `${userText}\n\n【实现计划】\n${plan}\n\n【当前完整 HTML】\n${currentCode ?? '(空)'}`,
          },
        ];

        // Build messages in OpenAI format (system as first message)
        const genMessages = [
          { role: 'system' as const, content: GEN_SYSTEM },
          ...withContext.slice(0, -1).map((m: { role: string; content: string }) => ({
            role:    m.role as 'user' | 'assistant',
            content: m.content,
          })),
          { role: 'user' as const, content: withContext[withContext.length - 1].content as string },
        ];

        const cs = await client.chat.completions.create({
          model:      GEN_MODEL,
          max_tokens: 8192,
          stream:     true,
          messages:   genMessages,
        });

        let buffer = '';
        let sentUpTo = 0; // how many chars of explanation we've already sent

        for await (const chunk of cs) {
          const text = chunk.choices[0]?.delta?.content ?? '';
          if (!text) continue;
          buffer += text;
          const htmlStart = buffer.indexOf('<<<HTML>>>');
          if (htmlStart === -1) {
            const newText = buffer.slice(sentUpTo);
            if (newText) { send({ type: 'text', text: newText }); sentUpTo = buffer.length; }
          } else if (sentUpTo < htmlStart) {
            const remaining = buffer.slice(sentUpTo, htmlStart).trim();
            if (remaining) send({ type: 'text', text: remaining });
            sentUpTo = htmlStart;
          }
        }

        // Extract HTML block
        const m = buffer.match(/<<<HTML>>>\s*([\s\S]*?)\s*<<<END_HTML>>>/);
        if (m?.[1]) {
          send({ type: 'html', html: m[1].trim() });
        }
        send({ type: 'done' });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: 'error', text: `AI 调用失败: ${msg}` });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  });
}

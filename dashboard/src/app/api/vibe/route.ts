import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 120;

const SYSTEM = `你是一个专业前端工程师，通过对话帮助用户迭代改进 HTML 单页应用。

每次回复必须严格按以下格式：
1. 先用 1-3 句中文说明本次做了哪些修改
2. 紧接着输出完整更新后的 HTML，包裹在标记中（标记单独占行）：
<<<HTML>>>
<!DOCTYPE html>
...完整内容（CSS 和 JS 全部内联）...
<<<END_HTML>>>

设计规范：深色系（背景 #0d0f12，主色 #6366f1），现代简洁。
保留已有功能，只改用户要求的部分。代码健壮、有错误处理。`;

export async function POST(req: Request) {
  const { messages, currentCode } = await req.json() as {
    messages: Array<{ role: string; content: string }>;
    currentCode: string;
  };

  if (!messages?.length) {
    return Response.json({ error: 'messages required' }, { status: 400 });
  }

  // Inject current code into the latest user message
  const history = messages.slice(-8); // keep last 4 turns (8 messages)
  const last = history[history.length - 1];
  const withCode = [
    ...history.slice(0, -1),
    {
      role: 'user',
      content: `${last.content}\n\n--- 当前完整 HTML 代码 ---\n${currentCode ?? '(空)'}`,
    },
  ];

  // No API key → mock
  if (!process.env.ANTHROPIC_API_KEY) {
    const enc = new TextEncoder();
    const mock = new ReadableStream({
      start(c) {
        const send = (d: object) => c.enqueue(enc.encode(`data: ${JSON.stringify(d)}\n\n`));
        send({ type: 'text', text: '未配置 ANTHROPIC_API_KEY，无法调用 AI。请在 Vercel 环境变量中添加后重新部署。' });
        send({ type: 'done' });
        c.close();
      },
    });
    return new Response(mock, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
  }

  const client  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (d: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(d)}\n\n`));
      try {
        send({ type: 'status', text: '🤖 AI 正在思考...' });

        const cs = client.messages.stream({
          model:      process.env.CLAUDE_MODEL || 'claude-sonnet-4-5',
          max_tokens: 8192,
          system:     SYSTEM,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          messages:   withCode as any,
        });

        let buffer = '';
        cs.on('text', (chunk: string) => {
          buffer += chunk;
          // Stream only the explanation text (before <<<HTML>>>)
          const htmlStart = buffer.indexOf('<<<HTML>>>');
          if (htmlStart === -1) {
            // Still in explanation text — stream it
            send({ type: 'text', text: chunk });
          } else if (buffer.length - htmlStart < 20) {
            // Just hit the marker — flush explanation
            const explanation = buffer.slice(0, htmlStart).trim();
            if (explanation) send({ type: 'flush', text: explanation });
          }
          // After marker: don't stream raw HTML to chat
        });

        await cs.finalMessage();

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

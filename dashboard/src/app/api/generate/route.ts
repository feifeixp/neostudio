import Anthropic from '@anthropic-ai/sdk';

// CF Pages (opennextjs-cloudflare) 所有路由默认在 Workers edge runtime 运行，无需额外标注
export const maxDuration = 120; // 120s timeout for long Claude generations

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/** 普通网页应用 */
const SYSTEM_PROMPT = `你是一个专业的前端工程师，擅长生成高质量的 Web 应用代码。

用户会描述他们想要的应用功能，你需要输出一个完整的、可直接运行的单文件 HTML 应用。

要求：
1. 输出纯 HTML 文件，内联所有 CSS 和 JavaScript，不依赖外部库（CDN 可以使用）
2. 界面要现代、美观，使用深色主题（背景 #0d0f12，文字 #e2e8f0）
3. 代码要健壮，有完整的错误处理
4. 只输出代码，不要任何解释文字，不要 markdown 代码块包裹
5. 代码从 <!DOCTYPE html> 开始`;

/** AI 对话助手模式 — 生成带真实 Claude 聊天界面的单文件页面 */
const AI_ASSISTANT_SYSTEM_PROMPT = `你是一个专业的前端工程师，擅长生成 AI 对话助手界面。

用户会描述他们想要的 AI 助手，你需要生成一个完整的、可直接运行的单文件 HTML 应用。
该应用必须实现真实可用的 AI 对话功能，通过以下代理 API 与 Claude 通信：

=== API 规范 ===
接口：POST https://neo-proxy.feifeixp.workers.dev/api/chat
请求体（JSON）：
{
  "messages": [{"role": "user", "content": "消息内容"}, ...],
  "system": "系统提示词（定义助手角色和行为）",
  "model": "claude-haiku-4-5",
  "max_tokens": 2048
}
响应体（JSON）：
{
  "content": [{"type": "text", "text": "助手回复内容"}]
}

=== 代码要求 ===
1. 输出纯 HTML 文件，内联所有 CSS 和 JavaScript
2. 界面要现代美观，深色主题（背景 #0f1117，卡片 #1a1d2e，主色 #6366f1）
3. 实现完整多轮对话：维护 messages 数组历史，每次调用都携带完整历史
4. 必须有：加载动画（发送中...）、错误提示、清空对话按钮、Enter 发送快捷键
5. 根据用户描述自定义 system 提示词，让助手有对应的专业角色和能力
6. 只输出代码，不要任何解释文字，不要 markdown 代码块包裹
7. 代码从 <!DOCTYPE html> 开始`;

export async function POST(req: Request) {
  const { prompt, mode = 'page' } = await req.json();
  const isAssistant = mode === 'assistant';
  const systemPrompt = isAssistant ? AI_ASSISTANT_SYSTEM_PROMPT : SYSTEM_PROMPT;
  const userMessage  = isAssistant
    ? `请为以下需求生成一个 AI 对话助手应用：\n\n${prompt}`
    : `请为以下需求生成一个完整的 Web 应用：\n\n${prompt}`;

  if (!prompt?.trim()) {
    return new Response(JSON.stringify({ error: 'Missing prompt' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({
      success: true,
      code: buildFallbackTemplate(prompt),
      mock: true,
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  // Stream to browser via SSE so the terminal feels alive
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send({ type: 'status', message: '🤖 Claude 正在思考...' });

        // Model: default to sonnet (cost-efficient), override via env CLAUDE_MODEL
        // Use opus + thinking only when explicitly set
        const model       = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5';
        const useThinking = model.includes('opus');

        const claudeStream = client.messages.stream({
          model,
          max_tokens: useThinking ? 16000 : 8192,
          ...(useThinking ? { thinking: { type: 'enabled', budget_tokens: 8000 } } : {}),
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        });

        let thinking = false;
        let codeBuffer = '';

        claudeStream.on('text', (text) => {
          codeBuffer += text;
          // Drip status updates as code streams in
          if (!thinking && codeBuffer.length > 100) {
            thinking = true;
            send({ type: 'status', message: '✍️ 正在生成代码...' });
          }
          if (codeBuffer.length % 2000 < 50) {
            send({ type: 'progress', chars: codeBuffer.length });
          }
        });

        const response = await claudeStream.finalMessage();

        const code = response.content
          .filter((b) => b.type === 'text')
          .map((b) => (b as Anthropic.TextBlock).text)
          .join('');

        if (!code.trim()) {
          send({ type: 'error', message: 'Claude 返回了空响应' });
        } else {
          send({
            type: 'done',
            code: code.trim(),
            usage: {
              input_tokens:  response.usage.input_tokens,
              output_tokens: response.usage.output_tokens,
            },
          });
        }
      } catch (err: any) {
        let message = err.message || 'Unknown error';
        if (err instanceof Anthropic.AuthenticationError) message = 'ANTHROPIC_API_KEY 无效';
        if (err instanceof Anthropic.RateLimitError)     message = 'Claude API 达到速率限制，请稍后重试';
        send({ type: 'error', message });
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

function buildFallbackTemplate(prompt: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${prompt.slice(0, 40)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0d0f12; color: #e2e8f0;
           min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
            border-radius: 16px; padding: 2rem; max-width: 600px; text-align: center; }
    h1 { font-size: 1.5rem; margin-bottom: 1rem; color: #3b82f6; }
    p { color: #94a3b8; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${prompt.slice(0, 60)}</h1>
    <p>配置 ANTHROPIC_API_KEY 后，AI 将根据您的描述生成完整的应用代码。</p>
  </div>
</body>
</html>`;
}

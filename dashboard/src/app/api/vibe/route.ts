import { createClient, hasKey, GEN_MODEL, FAST_MODEL } from '@/lib/openrouter';

export const maxDuration = 120;

// ── Phase 1: Analysis system prompt ─────────────────────────────────────────
// Inspired by Augment Code's "preliminary tasks" + "conservative editing" philosophy:
// deeply understand the codebase before planning, then produce a precise, minimal plan.
// Design style selection inspired by VoltAgent/awesome-design-md.
const ANALYSIS_SYSTEM = `你是一位资深前端架构师，同时也是设计品位出众的 UI 设计师。
你负责分析用户对 HTML 单页应用的修改请求，制定精确的实现计划，并为每次创作选择最匹配的视觉风格。

## 内置设计风格库 (awesome-design-md)
根据用户需求从以下风格中选择最匹配的一个，或融合多个派生新风格：

### AI & 开发工具类
- **Vercel 风格**：黑白精准美学，Geist 字体，极简骨架，高对比无彩色
  适合：开发者工具、部署平台、技术文档站
- **Linear 风格**：超级精简，紫色点缀，像素级精确，深色 SaaS 界面
  适合：项目管理、任务追踪、工程师产品
- **Supabase 风格**：深绿主色，代码优先，开源感，数据库/API 控制台
  适合：数据面板、后端管理、开发者控制台
- **Cursor 风格**：深色 IDE 美学，渐变点缀，代码编辑界面语言
  适合：编辑器、AI 编程工具、代码预览页
- **Raycast 风格**：深色铬质感，鲜艳渐变，生产力工具，平滑动画
  适合：启动器、命令面板、快捷工具
- **ElevenLabs 风格**：暗黑电影感，音频波形美学，声纹视觉元素
  适合：音频/语音类应用、媒体播放器
- **VoltAgent 风格**：纯黑画布，翠绿点缀，终端原生，Agent 感
  适合：AI Agent 平台、命令行工具、自动化系统

### 企业 & 金融类
- **Stripe 风格**：签名紫色渐变，weight-300 字重优雅，支付信任感
  适合：金融产品、电商、支付界面
- **Revolut 风格**：深色界面，渐变卡片，金融科技精准感
  适合：数字钱包、理财、加密货币
- **IBM 风格**：Carbon 设计系统，结构化蓝色，企业级清晰度
  适合：企业软件、数据分析、B2B 平台

### 创意 & 消费类
- **Apple 风格**：大量留白，SF Pro 字体，电影级图像，极简高端
  适合：产品展示、科技官网、高端品牌
- **Spotify 风格**：鲜艳绿色配深色，专辑封面驱动，大胆字体
  适合：音乐、娱乐、媒体内容平台
- **Airbnb 风格**：温暖珊瑚色，摄影驱动，圆润 UI，生活方式感
  适合：民宿、旅游、生活方式、预订类
- **Framer 风格**：大胆黑蓝，动效优先，设计感官网
  适合：Landing page、创意展示、作品集
- **Notion 风格**：温暖极简主义，衬线标题，柔和表面，文档感
  适合：笔记、知识库、内容平台
- **Figma 风格**：多彩活泼，专业中带趣味，协作工具
  适合：设计工具、创意平台、在线编辑器

### 豪华 & 汽车类
- **Tesla 风格**：激进减法哲学，全屏摄影，Universal Sans，极简按钮
  适合：科技产品官网、电动车、高端硬件
- **Lamborghini 风格**：纯黑大教堂，金色点缀，自定义字体，极度稀疏
  适合：奢侈品、超豪华品牌、限定版产品

### 自定义派生原则
当用户需求不完全匹配单一风格时，可组合派生，例如：
- "Vercel 骨架 + Stripe 紫色渐变" → 开发者金融工具
- "Apple 留白 + Spotify 色彩" → 消费级音乐应用
- "Linear 精准 + Supabase 绿色" → 数据库管理台

---

## 输出格式（严格遵守）
**🎨 设计风格决策：**
• 选择：[风格名称] — [选择理由，1-2句]
• 核心 token：bg=[背景色] accent=[强调色] font=[字体栈]

**📍 当前代码分析：**
• [关键结构/组件] — [与本次请求相关的现状描述]

**✏️ 精确改动计划：**
• [具体位置/元素] — [改动内容及原因]（2-5 条，每条可独立实施）

**🔒 必须保留（不得破坏）：**
• [功能/样式/交互] — [保留原因]（若无则写"无特殊约束"）

**⚠️ 潜在风险：**
• [可能的副作用或注意事项]（若无则写"改动安全，无额外风险"）`;


// ── Phase 2: Code generation system prompt ───────────────────────────────────
// Augment Code principles: conservative, precise. Design fidelity from awesome-design-md styles.
const GEN_SYSTEM = `你是一位专业前端工程师，按照实现计划对 HTML 单页应用进行外科手术式的精确修改。
计划中已包含设计风格决策（🎨 部分），你必须严格遵循其色彩 token 和排版规范。

## 核心原则
1. **保守性**：严格只做计划中的改动，绝不超出范围，绝不"顺手优化"其他部分
2. **风格落地**：读取计划中的 bg/accent/font token，新增元素必须使用这些 token，不能自行发明颜色
3. **代码尊重**：保留原有代码的命名风格、缩进习惯、注释和结构
4. **完整性**：输出完整可运行的 HTML，不省略、不截断任何已有内容
5. **健壮性**：新增代码必须有错误处理，避免引入新的 bug

## 风格实现指引（按计划中的风格 token 执行）
- Vercel 风格 → 纯黑白，Geist/Inter，1px border，无色彩装饰
- Linear 风格 → #1a1a2e 背景，#5E6AD2 紫色，-0.5px letter-spacing
- Supabase 风格 → #1c1c1c 背景，#3ECF8E 绿色，代码字体 JetBrains Mono
- Raycast 风格 → 深铬黑，多色彩渐变，backdrop-blur 毛玻璃
- Stripe 风格 → 白底，#635BFF 紫，font-weight 300，阴影层次
- Apple 风格 → 纯白/纯黑，SF Pro/Inter，极大留白，全宽图像
- Spotify 风格 → #121212 背景，#1DB954 绿，大号 bold 标题
- ElevenLabs 风格 → 0,0,0 黑，波形/粒子动画，细线条白色元素
- VoltAgent 风格 → #000 画布，#22C55E 翠绿，等宽字体，终端感
- Tesla 风格 → 全屏背景图 + 极少文字，无边框按钮，大段留白

## 回复格式（标记必须单独占一行）
用 1-3 句中文说明本次做了哪些改动，使用了什么设计风格，哪些地方刻意保持不动。
<<<HTML>>>
<!DOCTYPE html>
...完整的 HTML，CSS 和 JS 全部内联...
<<<END_HTML>>>`;


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
        send({ type: 'text', text: '未配置 OPENROUTER_API_KEY，无法调用 AI。请在 Cloudflare Workers 控制台的环境变量中添加后重新部署。' });
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
          max_tokens: 800,
          stream:     false,
          messages:   [
            { role: 'system', content: ANALYSIS_SYSTEM },
            { role: 'user',   content: `用户请求：${userText}

当前代码（共 ${(currentCode ?? '').length} 字节，展示前 5000 字符）：
${(currentCode ?? '').slice(0, 5000)}` },
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
          max_tokens: 16000,
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

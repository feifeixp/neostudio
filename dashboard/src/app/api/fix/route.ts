import { createClient, hasKey, FAST_MODEL } from '@/lib/openrouter';

export const maxDuration = 60;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TableStore = require('tablestore') as any;

let tsClient: any = null;
if (process.env.ALIBABA_CLOUD_ACCESS_KEY_ID && process.env.TABLESTORE_ENDPOINT) {
  tsClient = new TableStore.Client({
    accessKeyId:     process.env.ALIBABA_CLOUD_ACCESS_KEY_ID.trim(),
    secretAccessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET?.trim(),
    endpoint:        process.env.TABLESTORE_ENDPOINT.trim(),
    instancename:    (process.env.TABLESTORE_INSTANCE_NAME || 'neodevcn').trim(),
    maxRetries:      3,
  });
}

async function getWorkerContent(workerId: string): Promise<string> {
  if (!tsClient) return '';
  try {
    const TABLE_NAME = (process.env.TABLESTORE_ROUTER_TABLE || 'router_table').trim();
    const data: any = await new Promise((resolve, reject) => {
      tsClient.getRow({
        tableName:    TABLE_NAME,
        primaryKey:   [{ workerName: workerId }],
        columnsToGet: ['content'],
      }, (err: any, result: any) => (err ? reject(err) : resolve(result)));
    });
    const attrs = data?.row?.attributes ?? [];
    return attrs.find((a: any) => a.columnName === 'content')?.columnValue ?? '';
  } catch {
    return '';
  }
}

const FIX_SYSTEM_PROMPT = `你是一个边缘计算应用调试专家，专门分析和修复部署在 Worker Runtime 上的前端应用错误。

用户会提供出错的 HTTP 日志和当前 Worker 的 HTML 源代码（如果存在）。

你的任务：
1. 用 1-3 句话简明分析错误的根本原因
2. 给出具体修复建议
3. 如果错误源于代码问题（如引用了不存在的外部文件、路径错误、JS 语法错误等），
   输出完整的修复后 HTML，用以下格式包裹（不要输出其他内容，只输出这一段）：

<<<FIXED_HTML>>>
<!DOCTYPE html>
...完整 HTML 内容...
<<<END_FIXED_HTML>>>

4. 如果是外部依赖或配置问题（如后端 API 不存在），只给文字建议，不用输出代码
5. 全程使用中文，保持简洁专业`;

export async function POST(req: Request) {
  const { workerId, errorLog, recentLogs } = await req.json();
  if (!errorLog) {
    return Response.json({ error: 'Missing errorLog' }, { status: 400 });
  }

  const currentCode = await getWorkerContent(workerId);

  const userMessage = `
错误日志行：
${errorLog}

最近日志上下文（最后 10 条）：
${(recentLogs || []).join('\n')}

当前 Worker HTML 代码${currentCode ? `（${currentCode.length} 字节）` : '（未找到）'}：
${currentCode ? currentCode.slice(0, 8000) : '（无法读取 Worker 代码）'}
`.trim();

  if (!hasKey()) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const send = (d: object) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(d)}\n\n`));
        send({ type: 'text', text: `⚠️ 未配置 OPENROUTER_API_KEY，无法进行 AI 分析。\n\n错误 "${errorLog}" 可能原因：资源文件路径不存在或外部依赖加载失败。` });
        send({ type: 'done' });
        controller.close();
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
  }

  const client  = createClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (d: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(d)}\n\n`));
      try {
        send({ type: 'status', text: '🔍 正在分析错误...' });

        const orStream = await client.chat.completions.create({
          model:      FAST_MODEL,
          max_tokens: 4096,
          stream:     true,
          messages:   [
            { role: 'system', content: FIX_SYSTEM_PROMPT },
            { role: 'user',   content: userMessage },
          ],
        });

        let buffer = '';
        for await (const chunk of orStream) {
          const text = chunk.choices[0]?.delta?.content ?? '';
          if (!text) continue;
          buffer += text;
          send({ type: 'text', text });
        }

        const codeMatch = buffer.match(/<<<FIXED_HTML>>>([\s\S]*?)<<<END_FIXED_HTML>>>/);
        if (codeMatch) {
          send({ type: 'fixed_code', code: codeMatch[1].trim() });
        }
        send({ type: 'done' });
      } catch (err: unknown) {
        send({ type: 'error', text: `分析失败: ${err instanceof Error ? err.message : String(err)}` });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  });
}

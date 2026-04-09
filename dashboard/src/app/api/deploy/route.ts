import { NextResponse } from 'next/server';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TableStore = require('tablestore') as any;

const CF_PROXY    = 'https://neo-proxy.feifeixp.workers.dev';
const TABLE_NAME  = process.env.TABLESTORE_ROUTER_TABLE || 'router_table';

/** 生产模式：直接写入 TableStore，worker-runtime 会自动从 TableStore 读取并提供服务 */
function buildTSClient() {
  const endpoint    = process.env.TABLESTORE_ENDPOINT?.trim();
  const accessKeyId = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID?.trim();
  if (!endpoint || !accessKeyId) return null;
  return new TableStore.Client({
    accessKeyId,
    secretAccessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET?.trim(),
    endpoint,
    instancename:    (process.env.TABLESTORE_INSTANCE_NAME || 'neodevcn').trim(),
    maxRetries:      3,
  });
}

async function deployToTableStore(
  tsClient: any,
  workerName: string,
  files: Array<{ name: string; content: string }>,
): Promise<string> {
  const mainFile    = files.find(f => f.name === 'index.html') ?? files[0];
  const htmlContent = mainFile?.content ?? '';
  const publicUrl   = `${CF_PROXY}/w/${workerName}`;

  await new Promise<void>((resolve, reject) => {
    tsClient.putRow(
      {
        tableName: TABLE_NAME,
        condition: new TableStore.Condition(
          TableStore.RowExistenceExpectation.IGNORE,
          null,
        ),
        primaryKey:       [{ workerName }],
        attributeColumns: [
          { functionName: `worker-${workerName}` },
          { status:       'active'              },
          { type:         'fc'                  },
          { ownerId:      'default-user'        },
          { plan:         'free'                },
          { publicUrl                           },
          { content:      htmlContent           },
          { contentType:  'text/html'           },
          { fileCount:    files.length          },
          { deployedAt:   new Date().toISOString() },
        ],
      },
      (err: Error) => (err ? reject(err) : resolve()),
    );
  });

  return publicUrl;
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const { workerName, files } = payload as {
      workerName: string;
      files: Array<{ name: string; content: string }>;
    };

    if (!workerName || !files?.length) {
      return NextResponse.json({ error: 'Missing workerName or files' }, { status: 400 });
    }

    // ── 生产模式（TableStore 凭证已配置）────────────────────────────────────────
    const tsClient = buildTSClient();
    if (tsClient) {
      const url = await deployToTableStore(tsClient, workerName, files);
      return NextResponse.json({ success: true, workerName, url, message: 'Deployed to cloud' });
    }

    // ── 本地开发模式：代理到 deploy-pipeline 服务 ────────────────────────────────
    const pipelineUrl = process.env.DEPLOY_PIPELINE_URL || 'http://127.0.0.1:8081';
    const pipelineRes = await fetch(`${pipelineUrl}/deploy`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    const data = await pipelineRes.json();
    if (!pipelineRes.ok) {
      return NextResponse.json(
        { error: data.error || 'deploy failed' },
        { status: pipelineRes.status },
      );
    }
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Deploy failed: ' + error.message },
      { status: 500 },
    );
  }
}

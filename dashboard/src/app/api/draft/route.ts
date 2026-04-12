import { NextResponse } from 'next/server';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TableStore = require('tablestore') as any;

const TABLE_NAME = process.env.TABLESTORE_ROUTER_TABLE || 'router_table';

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

/** POST /api/draft — create or update a draft project */
export async function POST(req: Request) {
  try {
    const { workerName, templateId, code } = await req.json() as {
      workerName: string;
      templateId?: string;
      code?: string;
    };

    if (!workerName) {
      return NextResponse.json({ error: 'Missing workerName' }, { status: 400 });
    }

    const tsClient = buildTSClient();
    if (tsClient) {
      await new Promise<void>((resolve, reject) => {
        tsClient.putRow(
          {
            tableName: TABLE_NAME,
            condition:  { rowExistenceExpectation: 0, columnCondition: null },
            primaryKey:       [{ workerName }],
            attributeColumns: [
              { status:     'draft'                    },
              { templateId: templateId ?? 'blank'      },
              { content:    code ?? ''                 },
              { updatedAt:  new Date().toISOString()   },
            ],
          },
          (err: Error) => (err ? reject(err) : resolve()),
        );
      });
      return NextResponse.json({ ok: true, workerName });
    }

    // Local dev: proxy to deploy-pipeline's /draft endpoint
    const pipelineUrl = process.env.DEPLOY_PIPELINE_URL || 'http://127.0.0.1:8081';
    try {
      const pRes = await fetch(`${pipelineUrl}/draft`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workerName, templateId, code }),
      });
      const pData = await pRes.json();
      return NextResponse.json(pData, { status: pRes.status });
    } catch (_) {
      // Pipeline not running — silently succeed so the UI isn't blocked
      return NextResponse.json({ ok: true, workerName, local: true });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

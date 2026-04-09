import { NextResponse } from 'next/server';

// tablestore has no @types package — declare inline
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TableStore = require('tablestore') as any;

const CF_PROXY      = 'https://neo-proxy.feifeixp.workers.dev';
const PIPELINE_URL  = process.env.DEPLOY_PIPELINE_URL || 'http://localhost:8081';

let tsClient: any = null;
if (process.env.ALIBABA_CLOUD_ACCESS_KEY_ID && process.env.TABLESTORE_ENDPOINT) {
  tsClient = new TableStore.Client({
    accessKeyId:     process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
    secretAccessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
    endpoint:        process.env.TABLESTORE_ENDPOINT,
    instancename:    process.env.TABLESTORE_INSTANCE_NAME,
    maxRetries:      3,
  });
}

/** Build the public-facing URL for a worker */
function workerPublicUrl(name: string, stored?: string): string {
  if (stored && stored.startsWith('http')) return stored;
  return `${CF_PROXY}/w/${name}`;   // future: path-based routing
}

export async function GET(): Promise<NextResponse> {
  // ── Production: TableStore ───────────────────────────────────────────────────
  if (tsClient) {
    return new Promise<NextResponse>((resolve) => {
      const TABLE_NAME = process.env.TABLESTORE_ROUTER_TABLE || 'router_table';
      tsClient.getRange({
        tableName:               TABLE_NAME,
        direction:               TableStore.Direction.FORWARD,
        inclusiveStartPrimaryKey:[{ workerName: TableStore.INF_MIN }],
        exclusiveEndPrimaryKey:  [{ workerName: TableStore.INF_MAX }],
        limit:                   50,
      }, (err: any, data: any) => {
        if (err) {
          console.error('[Dashboard/workers] TableStore error:', err);
          return resolve(NextResponse.json({ error: err.message }, { status: 500 }));
        }
        const SKIP = new Set(['content']); // 不在列表中返回 HTML 内容（节省流量）
        const workers = (data.rows || []).map((row: any) => {
          const name = row.primaryKey[0].value as string;
          const info: Record<string, unknown> = { id: name, name, requests: '~', latency: '~' };
          row.attributes.forEach((a: any) => {
            if (!SKIP.has(a.columnName)) info[a.columnName] = a.columnValue;
          });
          info.url = workerPublicUrl(name, info.publicUrl as string);
          return info;
        });
        resolve(NextResponse.json({ workers }));
      });
    });
  }

  // ── Local dev: deploy-pipeline ───────────────────────────────────────────────
  try {
    const resp = await fetch(`${PIPELINE_URL}/workers`, { cache: 'no-store' });
    if (resp.ok) {
      const data = await resp.json();
      // Patch URLs to use CF proxy for any non-localhost url
      const workers = (data.workers || []).map((w: any) => ({
        ...w,
        url: w.url?.includes('localhost') ? w.url : workerPublicUrl(w.name, w.url),
      }));
      return NextResponse.json({ workers });
    }
  } catch (_) { /* fall through */ }

  // ── Fallback: mock ───────────────────────────────────────────────────────────
  return NextResponse.json({
    workers: [
      { id: 'api-gateway',    name: 'api-gateway',    url: `${CF_PROXY}/w/api-gateway`,    status: 'active',    requests: '120 万', latency: '45ms'  },
      { id: 'my-resume-site', name: 'my-resume-site', url: `${CF_PROXY}/w/my-resume-site`, status: 'active',    requests: '1.2 万', latency: '12ms'  },
      { id: 'web-scraper',    name: 'web-scraper',    url: `${CF_PROXY}/w/web-scraper`,    status: 'suspended', requests: '45 万',  latency: '320ms' },
    ],
  });
}

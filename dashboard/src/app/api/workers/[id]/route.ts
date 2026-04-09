import { NextResponse } from 'next/server';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TableStore = require('tablestore') as any;

const CF_PROXY     = 'https://neo-proxy.feifeixp.workers.dev';
const PIPELINE_URL = process.env.DEPLOY_PIPELINE_URL || 'http://localhost:8081';

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

function workerPublicUrl(name: string, stored?: string): string {
  if (stored && stored.startsWith('http')) return stored;
  return `${CF_PROXY}/w/${name}`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // ── Production: read directly from TableStore ──────────────────────────────
  if (tsClient) {
    try {
      const TABLE_NAME = (process.env.TABLESTORE_ROUTER_TABLE || 'router_table').trim();
      const data: any = await new Promise((resolve, reject) => {
        tsClient.getRow({
          tableName:    TABLE_NAME,
          primaryKey:   [{ workerName: id }],
          columnsToGet: ['functionName', 'status', 'type', 'publicUrl', 'fileCount', 'deployedAt'],
        }, (err: any, result: any) => (err ? reject(err) : resolve(result)));
      });

      const attrs = data?.row?.attributes ?? [];
      if (!attrs.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

      const info: Record<string, unknown> = { id, name: id, requests: '~', latency: '~' };
      attrs.forEach((a: any) => { info[a.columnName] = a.columnValue; });
      info.url = workerPublicUrl(id, info.publicUrl as string);
      return NextResponse.json({ worker: info });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  // ── Local dev: deploy-pipeline ─────────────────────────────────────────────
  try {
    const res  = await fetch(`${PIPELINE_URL}/workers`, { cache: 'no-store' });
    const data = await res.json();
    const worker = (data.workers || []).find((w: any) => w.id === id || w.name === id);
    if (!worker) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ worker });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const res = await fetch(`${PIPELINE_URL}/workers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';

const PIPELINE_URL = process.env.DEPLOY_PIPELINE_URL || 'http://localhost:8081';

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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

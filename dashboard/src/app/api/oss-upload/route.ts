import { NextResponse } from 'next/server';
import { ossConfigFromEnv, ossUpload, getImageMime } from '@/lib/oss';

/**
 * POST /api/oss-upload
 * Body: multipart/form-data
 *   workerName: string
 *   files: File[]  (raw binary, no base64)
 *
 * Uploads images to OSS from the CF Worker (avoids browser CORS issues).
 * Returns { files: [{ name, url }] }
 */
export async function POST(req: Request) {
  try {
    const ossConfig = ossConfigFromEnv();
    if (!ossConfig) {
      return NextResponse.json({ error: 'OSS not configured (OSS_BUCKET missing)' }, { status: 503 });
    }

    const formData   = await req.formData();
    const workerName = formData.get('workerName') as string;
    if (!workerName) {
      return NextResponse.json({ error: 'Missing workerName' }, { status: 400 });
    }

    const blobs = formData.getAll('files') as File[];
    if (!blobs.length) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // Upload all images to OSS in parallel
    const results = await Promise.all(
      blobs.map(async (file) => {
        const mime  = file.type || getImageMime(file.name) || 'application/octet-stream';
        const key   = `workers/${workerName}/${file.name}`;
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { url } = await ossUpload(ossConfig, key, bytes, mime);
        return { name: file.name, url: `${url}?t=${Date.now()}` };
      }),
    );

    return NextResponse.json({ files: results });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[oss-upload] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

'use strict';

const fs   = require('fs');
const path = require('path');
const { Router, WorkerRequest, WorkerResponse } = require('./router');

// ─── TableStore client (lazy singleton, for cloud-deployed worker content) ────
let _tsClient = null;
function getTSClient() {
  if (_tsClient) return _tsClient;
  const endpoint   = process.env.TABLESTORE_ENDPOINT;
  const accessKey  = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID;
  const secretKey  = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET;
  const instance   = process.env.TABLESTORE_INSTANCE_NAME;
  if (!endpoint || !accessKey) return null;
  const TableStore = require('tablestore');
  _tsClient = new TableStore.Client({
    accessKeyId:     accessKey,
    secretAccessKey: secretKey,
    endpoint,
    instancename:    instance,
    maxRetries:      2,
  });
  return _tsClient;
}

// ─── MIME types ───────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
};

// ─── Directories ──────────────────────────────────────────────────────────────
const PUBLIC_DIR = path.join(__dirname, 'public');
const CODES_DIR  = path.join(__dirname, 'codes');   // multi-tenant worker code

// ─── Environment variables ────────────────────────────────────────────────────
const env = {
  UPSTREAM:    process.env.UPSTREAM    || 'https://example.com',
  NEO_API_URL: process.env.NEO_API_URL || 'https://dev.neodomain.cn',
};

// ─── Static file helper (for public/ fallback) ────────────────────────────────
function serveStatic(filePath) {
  const ext   = path.extname(filePath);
  const mime  = MIME[ext] || 'application/octet-stream';
  const cache = ext === '.html' ? 'no-cache' : 'max-age=31536000,immutable';
  try {
    const body = fs.readFileSync(filePath);
    return new WorkerResponse(body, {
      status:  200,
      headers: { 'Content-Type': mime, 'Cache-Control': cache, 'Content-Disposition': 'inline' },
    });
  } catch {
    return null;
  }
}

// ─── Multi-tenant: serve deployed worker code ─────────────────────────────────
/**
 * Try to serve a file from codes/{workerId}/ for the given request path.
 * Returns an FC3-compatible result object, or null if not found.
 */
function tryServeWorkerCode(workerId, requestPath) {
  if (!workerId) return null;

  const workerDir = path.join(CODES_DIR, workerId);
  if (!fs.existsSync(workerDir)) return null;

  // Normalise path
  const cleanPath = requestPath.replace(/\?.*$/, '').replace(/^\/+/, '') || 'index.html';

  // Try exact file
  let filePath = path.join(workerDir, cleanPath);
  // Guard against path traversal
  if (!filePath.startsWith(workerDir)) return null;

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // Try index.html inside directory, then root index.html (SPA fallback)
    const dirIndex = path.join(filePath, 'index.html');
    filePath = fs.existsSync(dirIndex)
      ? dirIndex
      : path.join(workerDir, 'index.html');
  }

  if (!fs.existsSync(filePath)) return null;

  const ext  = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';
  const body = fs.readFileSync(filePath);

  return {
    statusCode:     200,
    headers: {
      'Content-Type':        mime,
      'Content-Disposition': 'inline',
      'Cache-Control':       ext === '.html' ? 'no-cache' : 'max-age=86400',
      ...corsHeaders(),
    },
    body:           body.toString('base64'),
    isBase64Encoded: true,
  };
}

// ─── Default Router (built-in routes for the platform itself) ─────────────────
const router = new Router();

// CORS preflight
router.use((req) => {
  if (req.method === 'OPTIONS') {
    return new WorkerResponse(null, { status: 204, headers: corsHeaders() });
  }
});

router.get('/health', () =>
  WorkerResponse.json({ status: 'ok', ts: Date.now(), runtime: 'worker-runtime' })
);

router.all('/echo', async (req) => {
  const body = ['POST', 'PUT', 'PATCH'].includes(req.method)
    ? await req.text()
    : undefined;
  return WorkerResponse.json({
    method:  req.method,
    path:    req.path,
    headers: req.headers,
    queries: req.queries,
    params:  req.params,
    body,
  });
});

router.get('/users/:id', (req) =>
  WorkerResponse.json({ userId: req.params.id })
);

// Reverse proxy: /api/* → UPSTREAM
router.all('/api/*', async (req) => {
  const upstream  = env.UPSTREAM.replace(/\/$/, '');
  const targetUrl = upstream + req.path + (
    Object.keys(req.queries).length
      ? '?' + new URLSearchParams(req.queries).toString()
      : ''
  );
  const proxyOpts = {
    method:  req.method,
    headers: { ...req.headers, host: new URL(upstream).host },
  };
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    proxyOpts.body = await req.arrayBuffer();
  }
  const upstreamRes = await fetch(targetUrl, proxyOpts);
  const resBody     = Buffer.from(await upstreamRes.arrayBuffer());
  return new WorkerResponse(resBody, {
    status:  upstreamRes.status,
    headers: { ...Object.fromEntries(upstreamRes.headers), ...corsHeaders() },
  });
});

// Neodomain reverse proxy: /neo-api/* → NEO_API_URL
router.all('/neo-api/*', async (req) => {
  const neoBase   = env.NEO_API_URL.replace(/\/$/, '');
  const subPath   = req.path.replace(/^\/neo-api/, '');
  const targetUrl = neoBase + subPath + (
    Object.keys(req.queries).length
      ? '?' + new URLSearchParams(req.queries).toString()
      : ''
  );
  const proxyOpts = {
    method:  req.method,
    headers: { ...req.headers, host: new URL(neoBase).host, origin: neoBase },
  };
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    proxyOpts.body = await req.arrayBuffer();
  }
  const upstreamRes = await fetch(targetUrl, proxyOpts);
  const resBody     = Buffer.from(await upstreamRes.arrayBuffer());
  return new WorkerResponse(resBody, {
    status:  upstreamRes.status,
    headers: {
      ...Object.fromEntries(upstreamRes.headers),
      ...corsHeaders(),
      'Content-Disposition': 'inline',
    },
  });
});

// Static files from public/ (SPA fallback)
router.all('*', (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new WorkerResponse('Not Found', { status: 404 });
  }
  let filePath = path.join(PUBLIC_DIR, req.path);
  let res = serveStatic(filePath);
  if (res) return res;

  res = serveStatic(path.join(filePath, 'index.html'));
  if (res) return res;

  res = serveStatic(path.join(PUBLIC_DIR, 'index.html'));
  if (res) return res;

  return new WorkerResponse('Not Found', { status: 404 });
});

// ─── FC3 Entry Point ──────────────────────────────────────────────────────────
module.exports.handler = async function (event, context) {
  try {
    const eventStr = Buffer.isBuffer(event) ? event.toString('utf8') : String(event);
    const eventObj = JSON.parse(eventStr);

    // ── Multi-tenant dispatch ─────────────────────────────────────────────────
    // Sources of workerId (in priority order):
    //   1. __platform.workerId  — set by router-function local dispatch
    //   2. X-Worker-Name / X-Worker-Id header — set by Cloudflare Worker
    //
    // FC3 HTTP trigger preserves original header case (e.g. "X-Worker-Id"),
    // so we normalize all header keys to lowercase before lookup.
    const rawHeaders  = eventObj.headers || {};
    const headers     = Object.fromEntries(
                          Object.entries(rawHeaders).map(([k, v]) => [k.toLowerCase(), v])
                        );
    const workerId    = eventObj.__platform?.workerId
                     || headers['x-worker-name']
                     || headers['x-worker-id'];
    const requestPath = eventObj.rawPath || eventObj.path || '/';

    if (workerId) {
      // 1. Try local codes/ directory (manually deployed workers like neodev)
      const localResult = tryServeWorkerCode(workerId, requestPath);
      if (localResult) return localResult;

      // 2. Fall back to TableStore content (dashboard-deployed workers)
      const tsResult = await tryServeWorkerFromTableStore(workerId, requestPath);
      if (tsResult) return tsResult;

      console.warn(`[worker-runtime] No code found for workerId="${workerId}", using built-in router`);
    }

    // ── Built-in router (platform default / hdri-panorama app) ───────────────
    const request  = new WorkerRequest(eventObj);
    const response = await router.handle(request, env);

    Object.assign(response._headers, corsHeaders(), {
      'Content-Disposition': 'inline',
    });
    return response.toFC3();

  } catch (err) {
    console.error('[worker-runtime] unhandled error', err);
    return {
      statusCode: 500,
      headers: {
        'Content-Type':        'application/json',
        'Content-Disposition': 'inline',
        ...corsHeaders(),
      },
      body: JSON.stringify({ error: err.message }),
    };
  }
};

// ─── TableStore fallback: fetch worker content stored by dashboard deploy ─────
//
// Always returns the stored HTML regardless of request path (SPA mode).
// This ensures JS/CSS asset requests don't leak into the built-in router and
// get served as HTML with a wrong MIME type.
async function tryServeWorkerFromTableStore(workerId, requestPath) {
  const client = getTSClient();
  if (!client) return null;

  const TABLE_NAME = process.env.TABLESTORE_ROUTER_TABLE || 'router_table';
  try {
    const data = await new Promise((resolve, reject) => {
      client.getRow({
        tableName:    TABLE_NAME,
        primaryKey:   [{ workerName: workerId }],
        columnsToGet: ['content', 'contentType'],
      }, (err, result) => (err ? reject(err) : resolve(result)));
    });

    const attrs   = (data?.row?.attributes || []);
    const content = attrs.find(a => a.columnName === 'content')?.columnValue;
    if (!content) return null;   // worker not in TableStore → fall through

    // For asset paths (e.g. .js, .css, .png) return 404 — better than returning
    // HTML with a wrong MIME type which causes browser module-load errors.
    // Paths with no extension or .html/.htm extension are treated as SPA routes
    // and still get the main HTML for client-side routing.
    const clean       = (requestPath || '/').split('?')[0];
    const lastSegment = clean.split('/').pop() || '';
    const dotIdx      = lastSegment.lastIndexOf('.');
    const ext         = dotIdx > 0 ? lastSegment.slice(dotIdx + 1).toLowerCase() : '';
    const isAsset     = ext !== '' && ext !== 'html' && ext !== 'htm';
    if (isAsset) {
      // Return 404 for asset paths — better than wrong-MIME HTML
      console.log(`[worker-runtime] Asset 404 for "${workerId}" path="${clean}"`);
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'text/plain', ...corsHeaders() },
        body: Buffer.from('Not found').toString('base64'),
        isBase64Encoded: true,
      };
    }

    const contentType = attrs.find(a => a.columnName === 'contentType')?.columnValue
                     || 'text/html';
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');

    console.log(`[worker-runtime] Serving "${workerId}" from TableStore path="${clean}" (${buf.length} bytes)`);
    return {
      statusCode:      200,
      headers: {
        'Content-Type':        `${contentType}; charset=utf-8`,
        'Content-Disposition': 'inline',
        'Cache-Control':       'no-cache',
        ...corsHeaders(),
      },
      body:            buf.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.warn(`[worker-runtime] TableStore fetch failed for "${workerId}":`, err.message);
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With,accessToken',
  };
}

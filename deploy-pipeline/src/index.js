import 'dotenv/config';
import express from 'express';
import AdmZip from 'adm-zip';
import FCClient from '@alicloud/fc2';
import TableStore from 'tablestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '10mb' }));

// ── Local dev paths ────────────────────────────────────────────────────────────
// Deployed worker code lives in worker-runtime/codes/{workerName}/
const CODES_DIR  = process.env.CODES_DIR  || path.resolve(__dirname, '../../worker-runtime/codes');
// Routing table is shared via a JSON file picked up by router-function
const ROUTES_FILE = process.env.ROUTES_FILE || path.resolve(__dirname, '../../router-function/src/store/routes.json');

// ── Aliyun Clients ─────────────────────────────────────────────────────────────
let fcClient = null;
if (process.env.ALIBABA_CLOUD_ACCESS_KEY_ID && process.env.FC_ACCOUNT_ID) {
  fcClient = new FCClient(process.env.FC_ACCOUNT_ID, {
    accessKeyID: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
    region: process.env.FC_REGION || 'cn-shanghai',
    timeout: 30000,
  });
  console.log('[Pipeline] FC client initialized.');
}

let tsClient = null;
if (process.env.ALIBABA_CLOUD_ACCESS_KEY_ID && process.env.TABLESTORE_ENDPOINT) {
  tsClient = new TableStore.Client({
    accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
    secretAccessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
    endpoint: process.env.TABLESTORE_ENDPOINT,
    instancename: process.env.TABLESTORE_INSTANCE_NAME,
    maxRetries: 3,
  });
  console.log('[Pipeline] TableStore client initialized.');
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function generateZipBuffer(files) {
  const zip = new AdmZip();
  for (const f of files) {
    zip.addFile(f.name, Buffer.from(f.content, 'utf8'));
  }
  return zip.toBuffer();
}

/** Save worker files to local codes/ directory (always, for local preview) */
function saveWorkerCodeLocally(workerName, files) {
  const workerDir = path.join(CODES_DIR, workerName);
  // Clean old deployment first
  fs.rmSync(workerDir, { recursive: true, force: true });
  for (const f of files) {
    // Preserve directory structure (assets/foo.js etc.), guard against path traversal
    const safeName = f.name.replace(/\.\./g, '').replace(/^\/+/, '');
    const filePath  = path.join(workerDir, safeName);
    if (!filePath.startsWith(workerDir)) continue;   // skip traversal attempts
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, f.content, 'utf8');
  }
  console.log(`[Pipeline] Saved ${files.length} file(s) → ${workerDir}`);
}

/** Write/update route entry in the shared routes.json file */
function registerRoute(workerName, extra = {}) {
  let routes = {};
  try { routes = JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8')); } catch (_) {}
  routes[workerName] = {
    workerName,
    workerId:     workerName,        // simple 1:1 for local dev
    type:         'fc',
    status:       'active',
    ownerId:      extra.ownerId      || 'default-user',
    plan:         extra.plan         || 'free',
    functionName: extra.functionName || `worker-${workerName}`,
    deployedAt:   new Date().toISOString(),
  };
  try {
    fs.mkdirSync(path.dirname(ROUTES_FILE), { recursive: true });
    fs.writeFileSync(ROUTES_FILE, JSON.stringify(routes, null, 2), 'utf8');
    console.log(`[Pipeline] Route registered for "${workerName}" in routes.json`);
  } catch (err) {
    console.warn('[Pipeline] Could not write routes.json:', err.message);
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────────

/**
 * GET /workers
 * Returns the list of deployed workers from routes.json
 */
app.get('/workers', (req, res) => {
  try {
    const routes = JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8'));
    const workers = Object.values(routes).map((r) => ({
      id:         r.workerName,
      name:       r.workerName,
      url:        r.status === 'draft' ? '' : `http://${r.workerName}.localhost:8080`,
      status:     r.status || 'active',
      templateId: r.templateId || null,
      deployedAt: r.deployedAt || null,
      updatedAt:  r.updatedAt  || null,
      requests:   '~',
      latency:    '~',
    }));
    // Return stats as well
    const totalWorkers  = workers.length;
    const activeWorkers = workers.filter(w => w.status === 'active').length;
    const draftWorkers  = workers.filter(w => w.status === 'draft').length;
    return res.json({ workers, stats: { totalWorkers, activeWorkers, draftWorkers } });
  } catch (_) {
    return res.json({ workers: [], stats: { totalWorkers: 0, activeWorkers: 0, draftWorkers: 0 } });
  }
});

/**
 * GET /workers/:workerName
 * Returns a single worker's full record (including content for Vibe editor)
 */
app.get('/workers/:workerName', (req, res) => {
  const { workerName } = req.params;
  try {
    const routes = JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8'));
    const r = routes[workerName];
    if (!r) return res.status(404).json({ error: 'Not found' });

    // Try to read persisted HTML content
    let content = r.content || '';
    if (!content) {
      const htmlPath = path.join(CODES_DIR, workerName, 'index.html');
      try { content = fs.readFileSync(htmlPath, 'utf8'); } catch (_) {}
    }

    return res.json({
      worker: {
        id:         r.workerName,
        name:       r.workerName,
        url:        r.status === 'draft' ? '' : `http://${r.workerName}.localhost:8080`,
        status:     r.status     || 'active',
        templateId: r.templateId || null,
        deployedAt: r.deployedAt || null,
        updatedAt:  r.updatedAt  || null,
        content,
      },
    });
  } catch (_) {
    return res.status(500).json({ error: 'Failed to read worker data' });
  }
});

/**
 * POST /draft
 * Body: { workerName, templateId, code }
 * Saves a draft entry to routes.json + the HTML file to codes/
 */
app.post('/draft', (req, res) => {
  const { workerName, templateId, code } = req.body;
  if (!workerName) return res.status(400).json({ error: 'Missing workerName' });

  // Save HTML file locally so it can be loaded by the editor later
  if (code) {
    try {
      saveWorkerCodeLocally(workerName, [{ name: 'index.html', content: code }]);
    } catch (err) {
      console.warn('[Pipeline] Draft local save failed:', err.message);
    }
  }

  // Persist draft entry in routes.json
  let routes = {};
  try { routes = JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8')); } catch (_) {}

  const existing = routes[workerName] || {};
  routes[workerName] = {
    ...existing,
    workerName,
    workerId:   workerName,
    type:       'static',
    status:     'draft',
    templateId: templateId || existing.templateId || 'blank',
    updatedAt:  new Date().toISOString(),
    // Keep deployedAt if already published
    deployedAt: existing.deployedAt || null,
    // Store content inline for easy retrieval (trimmed to avoid huge files)
    content:    code ? code.slice(0, 500_000) : (existing.content || ''),
  };

  try {
    fs.mkdirSync(path.dirname(ROUTES_FILE), { recursive: true });
    fs.writeFileSync(ROUTES_FILE, JSON.stringify(routes, null, 2), 'utf8');
    console.log(`[Pipeline] Draft saved for "${workerName}"`);
  } catch (err) {
    console.warn('[Pipeline] Could not write routes.json:', err.message);
    return res.status(500).json({ error: 'Failed to save draft' });
  }

  return res.json({ ok: true, workerName });
});

/**
 * DELETE /workers/:workerName
 * Remove a worker: codes/, routes.json, TableStore row, optional FC function
 */
app.delete('/workers/:workerName', async (req, res) => {
  const { workerName } = req.params;
  if (!workerName) return res.status(400).json({ error: 'Missing workerName' });

  console.log(`[Pipeline] Deleting worker: ${workerName}`);

  // 1. Remove local code
  const workerDir = path.join(CODES_DIR, workerName);
  try { fs.rmSync(workerDir, { recursive: true, force: true }); } catch (_) {}

  // 2. Remove from routes.json
  try {
    const routes = JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8'));
    delete routes[workerName];
    fs.writeFileSync(ROUTES_FILE, JSON.stringify(routes, null, 2), 'utf8');
  } catch (_) {}

  // 3. Remove from TableStore if available
  if (tsClient) {
    try {
      const TABLE_NAME = process.env.TABLESTORE_ROUTER_TABLE || 'router_table';
      await new Promise((resolve, reject) => {
        tsClient.deleteRow({
          tableName:  TABLE_NAME,
          condition:  new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
          primaryKey: [{ workerName }],
        }, (err, data) => err ? reject(err) : resolve(data));
      });
      console.log(`[Pipeline] TableStore row deleted for "${workerName}"`);
    } catch (err) {
      console.warn('[Pipeline] TableStore delete failed:', err.message);
    }
  }

  // 4. Remove FC function if available
  if (fcClient) {
    try {
      const serviceName = process.env.FC_DEFAULT_SERVICE || 'worker-service';
      await fcClient.deleteFunction(serviceName, `worker-${workerName}`);
      console.log(`[Pipeline] FC function deleted: worker-${workerName}`);
    } catch (err) {
      if (err.code !== 'FunctionNotFound') {
        console.warn('[Pipeline] FC delete failed:', err.message);
      }
    }
  }

  return res.json({ success: true, message: `Worker "${workerName}" deleted` });
});

/**
 * POST /deploy
 * Body: { workerName: string, files: [{ name: string, content: string }] }
 */
app.post('/deploy', async (req, res) => {
  const { workerName, files } = req.body;
  if (!workerName || !files || !files.length) {
    return res.status(400).json({ error: 'Missing workerName or files payload' });
  }

  const functionName = `worker-${workerName}`;
  const serviceName  = process.env.FC_DEFAULT_SERVICE || 'worker-service';

  console.log(`[Pipeline] Deploy started: ${workerName} → ${functionName}`);

  // ── 1. Always save code locally (enables local preview via worker-runtime) ──
  try {
    saveWorkerCodeLocally(workerName, files);
  } catch (err) {
    console.warn('[Pipeline] Local save failed:', err.message);
  }

  // ── 2. Register route so router-function can resolve this worker ──────────
  registerRoute(workerName, { functionName });

  const CF_PROXY  = process.env.CF_PROXY_URL || 'https://neo-proxy.feifeixp.workers.dev';
  const publicUrl = `http://${workerName}.localhost:8080`;   // updated to CF url in cloud mode below

  // ── Mock mode: no cloud credentials ───────────────────────────────────────
  if (!fcClient || !tsClient) {
    console.warn('[Pipeline] Mock mode — cloud deployment skipped.');
    return res.json({
      success:    true,
      message:    'Local deployment successful (mock mode)',
      workerName,
      functionName,
      mockOnly:   true,
      url:        publicUrl,
      previewUrl: publicUrl,
    });
  }

  // ── Real mode: deploy to Alibaba Cloud FC + TableStore ────────────────────
  try {
    const zipBuffer  = generateZipBuffer(files);
    const base64Code = zipBuffer.toString('base64');

    // 2a. FC: update or create function
    try {
      await fcClient.updateFunction(serviceName, functionName, {
        code: { zipFile: base64Code },
      });
      console.log(`[Pipeline] FC function updated: ${functionName}`);
    } catch (err) {
      if (err.code === 'FunctionNotFound') {
        await fcClient.createFunction(serviceName, {
          functionName,
          handler:    'index.handler',
          memorySize: 256,
          timeout:    30,
          runtime:    'nodejs18',
          code:       { zipFile: base64Code },
        });
        console.log(`[Pipeline] FC function created: ${functionName}`);
      } else {
        throw err;
      }
    }

    // 2b. TableStore: write routing record
    const TABLE_NAME = process.env.TABLESTORE_ROUTER_TABLE || 'router_table';
    await new Promise((resolve, reject) => {
      tsClient.putRow({
        tableName: TABLE_NAME,
        condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
        primaryKey:       [{ workerName }],
        attributeColumns: [
          { functionName },
          { status:    'active' },
          { type:      'fc' },
          { ownerId:   'default-user' },
          { plan:      'free' },
          { publicUrl: `${CF_PROXY}/w/${workerName}` },
        ],
      }, (err, data) => err ? reject(err) : resolve(data));
    });
    console.log(`[Pipeline] TableStore route written for "${workerName}"`);

    return res.json({
      success:    true,
      workerName,
      functionName,
      message:    'Cloud deployment successful',
      url:        `${CF_PROXY}/w/${workerName}`,
      previewUrl: `http://${workerName}.localhost:8080`,
    });

  } catch (err) {
    console.error('[Pipeline] Deploy failed:', err);
    return res.status(500).json({ error: 'Deploy failed', details: err.message });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
  console.log(`[Pipeline] Deploy service → http://localhost:${PORT}`);
  console.log(`  CODES_DIR:   ${CODES_DIR}`);
  console.log(`  ROUTES_FILE: ${ROUTES_FILE}`);
});

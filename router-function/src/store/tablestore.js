import TableStore from 'tablestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

let client = null;
const TABLE_NAME   = process.env.TABLESTORE_ROUTER_TABLE || 'router_table';
const ROUTES_FILE  = path.join(__dirname, 'routes.json');   // written by deploy-pipeline

// ── Static mock DB (fallback if no cloud + no routes.json entry) ──────────────
const MOCK_DB = {
  worker1: {
    workerName:   'worker1',
    workerId:     'worker1',
    type:         'fc',
    status:       'active',
    functionName: 'worker-worker1',
    ownerId:      'user1',
    plan:         'free',
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Read a single route from the shared routes.json file (written by deploy-pipeline). */
function getFromRoutesFile(workerName) {
  try {
    const data = fs.readFileSync(ROUTES_FILE, 'utf8');
    const routes = JSON.parse(data);
    return routes[workerName] || null;
  } catch (_) {
    return null;
  }
}

// ── TableStore client ──────────────────────────────────────────────────────────

export function initClient() {
  if (process.env.ALIBABA_CLOUD_ACCESS_KEY_ID && process.env.TABLESTORE_ENDPOINT) {
    client = new TableStore.Client({
      accessKeyId:     process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
      secretAccessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
      endpoint:        process.env.TABLESTORE_ENDPOINT,
      instancename:    process.env.TABLESTORE_INSTANCE_NAME,
      maxRetries:      3,
    });
    console.log(`[Router Store] TableStore initialized (table: ${TABLE_NAME})`);
  } else {
    client = null;
    console.warn('[Router Store] No TableStore config — using routes.json + mock DB');
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function getRouteByWorkerName(workerName) {
  // Priority 1: routes.json (dynamically deployed workers)
  const dynamic = getFromRoutesFile(workerName);
  if (dynamic) return dynamic;

  // Priority 2: TableStore (cloud, production)
  if (client) {
    return new Promise((resolve, reject) => {
      client.getRow({
        tableName:  TABLE_NAME,
        primaryKey: [{ workerName }],
        maxVersions: 1,
      }, (err, data) => {
        if (err) {
          console.error('[Router Store] TableStore error:', err);
          return reject(err);
        }
        if (!data?.row?.primaryKey?.length) return resolve(null);

        const route = { workerName };
        (data.row.attributes || []).forEach(attr => {
          route[attr.columnName] = attr.columnValue;
        });
        resolve(route);
      });
    });
  }

  // Priority 3: static MOCK_DB
  await new Promise(r => setTimeout(r, 5));
  return MOCK_DB[workerName] || null;
}

// Auto-init on import
initClient();

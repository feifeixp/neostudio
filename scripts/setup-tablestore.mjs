/**
 * 初始化 TableStore 路由表
 *
 * 运行方式（在项目根目录）：
 *   cd router-function && node ../scripts/setup-tablestore.mjs
 *
 * 前置条件：
 *   1. router-function/.env 中 TABLESTORE_* 已配置
 *   2. 当前 IP 已加入 neodevcn 实例的网络白名单
 *      控制台 → 表格存储 → neodevcn → 网络管理 → 添加 IP
 */

import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve modules from cwd (router-function/) so its node_modules is used
const require = createRequire(pathToFileURL(resolve(process.cwd(), 'package.json')));

// Load .env from cwd (should be router-function/)
require('dotenv').config();

const TableStore = require('tablestore');

const AK       = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID;
const SK       = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET;
const ENDPOINT = process.env.TABLESTORE_ENDPOINT;
const INSTANCE = process.env.TABLESTORE_INSTANCE_NAME;
const TABLE    = process.env.TABLESTORE_ROUTER_TABLE || 'router_table';

if (!AK || !ENDPOINT) {
  console.error('❌ Missing env vars. Run from router-function/ directory.');
  console.error('   cd router-function && node ../scripts/setup-tablestore.mjs');
  process.exit(1);
}

const client = new TableStore.Client({
  accessKeyId:     AK,
  secretAccessKey: SK,
  endpoint:        ENDPOINT,
  instancename:    INSTANCE,
  maxRetries:      3,
});

const p = (fn) => new Promise((resolve, reject) => fn((err, data) => err ? reject(err) : resolve(data)));

async function run() {
  console.log(`\n🔗 Connecting to ${ENDPOINT}`);

  const { tableNames } = await p(cb => client.listTable({}, cb));
  console.log('✅ Connected! Tables:', tableNames.length ? tableNames.join(', ') : '(empty)');

  // Create router_table if not exists
  if (tableNames.includes(TABLE)) {
    console.log(`✅ Table "${TABLE}" already exists — skipping create.`);
  } else {
    console.log(`📋 Creating table "${TABLE}" ...`);
    await p(cb => client.createTable({
      tableMeta: {
        tableName:  TABLE,
        primaryKey: [{ name: 'workerName', type: 'STRING' }],
      },
      reservedThroughput: { capacityUnit: { read: 0, write: 0 } },
      tableOptions:       { timeToLive: -1, maxVersions: 1, allowUpdate: true },
    }, cb));
    console.log(`✅ Table "${TABLE}" created.`);

    // Give TableStore a moment
    await new Promise(r => setTimeout(r, 1000));
  }

  // Seed a test record
  console.log('🌱 Seeding test route (worker1) ...');
  await p(cb => client.putRow({
    tableName:        TABLE,
    condition:        new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
    primaryKey:       [{ workerName: 'worker1' }],
    attributeColumns: [
      { functionName: 'worker-worker1' },
      { status:       'active'         },
      { type:         'fc'             },
      { ownerId:      'user1'          },
      { plan:         'free'           },
    ],
  }, cb));

  // Read it back
  const { row } = await p(cb => client.getRow({
    tableName:   TABLE,
    primaryKey:  [{ workerName: 'worker1' }],
    maxVersions: 1,
  }, cb));

  const result = { workerName: 'worker1' };
  (row?.attributes || []).forEach(a => { result[a.columnName] = a.columnValue; });
  console.log('✅ Verified read-back:', result);

  console.log('\n🚀 TableStore setup complete!\n');
}

run().catch(err => {
  if (err.message?.includes('ACL')) {
    console.error('\n❌ ACL 错误：当前 IP 未在白名单中');
    console.error('   阿里云控制台 → 表格存储 → neodevcn → 网络管理 → 添加 IP');
  } else if (err.code === 'OTSAuthFailed') {
    console.error('\n❌ 认证失败：请检查 AK/SK 是否有 TableStore 权限');
  } else {
    console.error('\n❌', err.code || '', err.message);
  }
  process.exit(1);
});

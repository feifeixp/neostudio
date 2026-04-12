/**
 * tablestore-fetch.ts
 * Lightweight TableStore REST client using Web Crypto + fetch.
 * Works in Cloudflare Workers (no Node.js https.request).
 *
 * Reference: https://help.aliyun.com/document_detail/27307.html
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface TSConfig {
  endpoint:        string;   // e.g. https://neodevcn.cn-hangzhou.ots.aliyuncs.com
  instanceName:    string;   // e.g. neodevcn
  accessKeyId:     string;
  accessKeySecret: string;
  tableName:       string;   // default table
}

export interface TSRow {
  primaryKey: Record<string, string | number>;
  attributes: Record<string, string | number | boolean | null>;
}

// ── Internal: signing ─────────────────────────────────────────────────────────

async function hmacSha1(secret: string, data: string): Promise<string> {
  const enc  = new TextEncoder();
  const key  = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false, ['sign'],
  );
  const sig  = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function buildHeaders(
  cfg:    TSConfig,
  method: string,
  path:   string,
  body:   Uint8Array,
): Promise<Record<string, string>> {
  const date       = new Date().toUTCString();
  const md5Buf     = await crypto.subtle.digest('MD5', body);
  const md5B64     = btoa(String.fromCharCode(...new Uint8Array(md5Buf)));
  const contentType = 'application/x-protobuf';

  // Only OTS custom headers participate in signing
  const otsHeaders: Record<string, string> = {
    'x-ots-date':          date,
    'x-ots-apiversion':    '2015-12-31',
    'x-ots-accesskeyid':   cfg.accessKeyId,
    'x-ots-instancename':  cfg.instanceName,
    'x-ots-contentmd5':    md5B64,
  };

  // Canonical OTS headers (sorted, lowercase key)
  const canonicalOts = Object.entries(otsHeaders)
    .map(([k, v]) => `${k.toLowerCase()}:${v}`)
    .sort()
    .join('\n');

  const stringToSign = [method, md5B64, contentType, date, canonicalOts, path].join('\n');
  const signature    = await hmacSha1(cfg.accessKeySecret, stringToSign);

  return {
    ...otsHeaders,
    'Content-Type':    contentType,
    'Content-MD5':     md5B64,
    'Authorization':   `OTS ${cfg.accessKeyId}:${signature}`,
    'x-ots-signature': signature,
  };
}

// ── Protobuf helpers (hand-rolled minimal encoder/decoder) ────────────────────
// TableStore uses protobuf wire format. We only need a tiny subset.

function encodeVarint(n: number): number[] {
  const out: number[] = [];
  while (n > 0x7f) { out.push((n & 0x7f) | 0x80); n >>>= 7; }
  out.push(n & 0x7f);
  return out;
}

function fieldTag(field: number, wireType: number): number[] {
  return encodeVarint((field << 3) | wireType);
}

function encodeString(field: number, s: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(s));
  return [...fieldTag(field, 2), ...encodeVarint(bytes.length), ...bytes];
}

function encodeBytes(field: number, b: Uint8Array): number[] {
  return [...fieldTag(field, 2), ...encodeVarint(b.length), ...Array.from(b)];
}

function encodeBool(field: number, v: boolean): number[] {
  return [...fieldTag(field, 0), v ? 1 : 0];
}

// ── Value encoding for PrimaryKey / Column values ──────────────────────────────
// TableStore PB: ColumnValue { type(1), v_string(2), v_int(3), v_bool(4), v_double(5), v_bytes(6) }

const VT_INF_MIN = 9;
const VT_INF_MAX = 10;

function encodeColumnValue(v: string | number | boolean | null | 'INF_MIN' | 'INF_MAX'): number[] {
  if (v === 'INF_MIN') return [...fieldTag(1, 0), ...encodeVarint(VT_INF_MIN)];
  if (v === 'INF_MAX') return [...fieldTag(1, 0), ...encodeVarint(VT_INF_MAX)];
  if (typeof v === 'string') {
    const sv = encodeString(2, v);
    return [...fieldTag(1, 0), 1, ...sv];
  }
  if (typeof v === 'number' && Number.isInteger(v)) {
    // v_int = int64 zigzag varint
    const n = v >= 0 ? v * 2 : (-v) * 2 - 1;
    return [...fieldTag(1, 0), 3, ...fieldTag(3, 0), ...encodeVarint(n)];
  }
  if (typeof v === 'boolean') {
    return [...fieldTag(1, 0), 4, ...fieldTag(4, 0), v ? 1 : 0];
  }
  // null → string ""
  return [...fieldTag(1, 0), 1, ...encodeString(2, '')];
}

// ── GetRow ─────────────────────────────────────────────────────────────────────

export async function getRow(
  cfg:       TSConfig,
  tableName: string,
  pk:        Record<string, string | number>,
): Promise<TSRow | null> {
  // Build GetRowRequest protobuf
  // message GetRowRequest { table_name(1), primary_key(2), columns_to_get(3), ... }
  const tableNameBytes = encodeString(1, tableName);

  // PrimaryKey PB
  const pkBuf: number[] = [];
  for (const [k, v] of Object.entries(pk)) {
    const colBytes: number[] = [
      ...encodeString(1, k),
      ...encodeBytes(2, new Uint8Array(encodeColumnValue(v))),
    ];
    pkBuf.push(...fieldTag(2, 2), ...encodeVarint(colBytes.length), ...colBytes);
  }

  const reqBytes = new Uint8Array([...tableNameBytes, ...pkBuf]);

  const path    = '/GetRow';
  const headers = await buildHeaders(cfg, 'POST', path, reqBytes);
  const url     = `${cfg.endpoint}${path}`;

  const res = await fetch(url, { method: 'POST', headers, body: reqBytes });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`TableStore GetRow ${res.status}: ${text}`);
  }

  // Parse response (simplified: extract string attrs via text decode fallback)
  const buf = new Uint8Array(await res.arrayBuffer());
  return parseGetRowResponse(buf);
}

// ── GetRange ───────────────────────────────────────────────────────────────────

export interface GetRangeOptions {
  tableName:  string;
  startPk:    Record<string, string | number | 'INF_MIN' | 'INF_MAX'>;
  endPk:      Record<string, string | number | 'INF_MIN' | 'INF_MAX'>;
  limit?:     number;
  direction?: 'FORWARD' | 'BACKWARD';
}

export async function getRange(cfg: TSConfig, opts: GetRangeOptions): Promise<TSRow[]> {
  // Build GetRangeRequest
  const parts: number[] = [
    ...encodeString(1, opts.tableName),
    // direction: 0 = FORWARD, 1 = BACKWARD
    ...fieldTag(2, 0), ...encodeVarint(opts.direction === 'BACKWARD' ? 1 : 0),
  ];

  // inclusive_start_primary_key
  function encodePK(field: number, pk: Record<string, string | number | 'INF_MIN' | 'INF_MAX'>) {
    const inner: number[] = [];
    for (const [k, v] of Object.entries(pk)) {
      const colBytes = [...encodeString(1, k), ...encodeBytes(2, new Uint8Array(encodeColumnValue(v)))];
      inner.push(...fieldTag(2, 2), ...encodeVarint(colBytes.length), ...colBytes);
    }
    parts.push(...fieldTag(field, 2), ...encodeVarint(inner.length), ...inner);
  }

  encodePK(3, opts.startPk);
  encodePK(4, opts.endPk);

  if (opts.limit) parts.push(...fieldTag(5, 0), ...encodeVarint(opts.limit));

  const reqBytes = new Uint8Array(parts);
  const path     = '/GetRange';
  const headers  = await buildHeaders(cfg, 'POST', path, reqBytes);
  const url      = `${cfg.endpoint}${path}`;

  const res = await fetch(url, { method: 'POST', headers, body: reqBytes });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`TableStore GetRange ${res.status}: ${text}`);
  }

  const buf = new Uint8Array(await res.arrayBuffer());
  return parseGetRangeResponse(buf);
}

// ── PutRow ─────────────────────────────────────────────────────────────────────

export interface PutRowOptions {
  tableName:  string;
  pk:         Record<string, string | number>;
  attrs:      Record<string, string | number | boolean | null>;
  condition?: 'IGNORE' | 'EXPECT_EXIST' | 'EXPECT_NOT_EXIST';
}

export async function putRow(cfg: TSConfig, opts: PutRowOptions): Promise<void> {
  const condition = opts.condition ?? 'IGNORE';
  const condCode  = condition === 'EXPECT_EXIST' ? 1 : condition === 'EXPECT_NOT_EXIST' ? 2 : 0;

  // Condition message: { row_existence: condCode }
  const condBytes = [...fieldTag(1, 0), ...encodeVarint(condCode)];

  const parts: number[] = [
    ...encodeString(1, opts.tableName),
    // condition
    ...fieldTag(2, 2), ...encodeVarint(condBytes.length), ...condBytes,
  ];

  // primary_key columns
  for (const [k, v] of Object.entries(opts.pk)) {
    const colBytes = [...encodeString(1, k), ...encodeBytes(2, new Uint8Array(encodeColumnValue(v)))];
    parts.push(...fieldTag(3, 2), ...encodeVarint(colBytes.length), ...colBytes);
  }

  // attribute columns: { name, value, timestamp }
  const nowMs = BigInt(Date.now());
  for (const [k, v] of Object.entries(opts.attrs)) {
    const valBytes = encodeColumnValue(v);
    const colBytes = [...encodeString(1, k), ...encodeBytes(2, new Uint8Array(valBytes))];
    // timestamp as varint field 3 (milliseconds, int64)
    const tsBytes = encodeVarint(Number(nowMs));
    colBytes.push(...fieldTag(3, 0), ...tsBytes);
    parts.push(...fieldTag(4, 2), ...encodeVarint(colBytes.length), ...colBytes);
  }

  const reqBytes = new Uint8Array(parts);
  const path     = '/PutRow';
  const headers  = await buildHeaders(cfg, 'POST', path, reqBytes);
  const url      = `${cfg.endpoint}${path}`;

  const res = await fetch(url, { method: 'POST', headers, body: reqBytes });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`TableStore PutRow ${res.status}: ${text}`);
  }
}

// ── DeleteRow ──────────────────────────────────────────────────────────────────

export async function deleteRow(
  cfg:       TSConfig,
  tableName: string,
  pk:        Record<string, string | number>,
): Promise<void> {
  const condBytes = [...fieldTag(1, 0), 0]; // IGNORE
  const parts: number[] = [
    ...encodeString(1, tableName),
    ...fieldTag(2, 2), ...encodeVarint(condBytes.length), ...condBytes,
  ];
  for (const [k, v] of Object.entries(pk)) {
    const colBytes = [...encodeString(1, k), ...encodeBytes(2, new Uint8Array(encodeColumnValue(v)))];
    parts.push(...fieldTag(3, 2), ...encodeVarint(colBytes.length), ...colBytes);
  }

  const reqBytes = new Uint8Array(parts);
  const path     = '/DeleteRow';
  const headers  = await buildHeaders(cfg, 'POST', path, reqBytes);
  const res = await fetch(`${cfg.endpoint}${path}`, { method: 'POST', headers, body: reqBytes });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`TableStore DeleteRow ${res.status}: ${text}`);
  }
}

// ── Response parsers (protobuf binary → TSRow) ────────────────────────────────
// We use a hand-rolled minimal PB decoder sufficient for TS row data.

function readVarint(buf: Uint8Array, pos: number): [number, number] {
  let result = 0, shift = 0;
  while (pos < buf.length) {
    const b = buf[pos++];
    result |= (b & 0x7f) << shift;
    shift  += 7;
    if (!(b & 0x80)) break;
  }
  return [result, pos];
}

function readString(buf: Uint8Array, pos: number, len: number): [string, number] {
  return [new TextDecoder().decode(buf.slice(pos, pos + len)), pos + len];
}

interface PBField { field: number; wireType: number; value: Uint8Array | number }

function parsePB(buf: Uint8Array): PBField[] {
  const fields: PBField[] = [];
  let pos = 0;
  while (pos < buf.length) {
    let tag: number;
    [tag, pos] = readVarint(buf, pos);
    const field    = tag >>> 3;
    const wireType = tag & 0x7;
    if (wireType === 0) {
      let v: number;
      [v, pos] = readVarint(buf, pos);
      fields.push({ field, wireType, value: v });
    } else if (wireType === 2) {
      let len: number;
      [len, pos] = readVarint(buf, pos);
      fields.push({ field, wireType, value: buf.slice(pos, pos + len) });
      pos += len;
    } else {
      // skip unknown
      break;
    }
  }
  return fields;
}

function decodeColumnValue(buf: Uint8Array): string | number | boolean | null {
  const fields = parsePB(buf);
  const typeF  = fields.find(f => f.field === 1);
  const type   = typeof typeF?.value === 'number' ? typeF.value : 0;
  if (type === 1) { // string
    const sf = fields.find(f => f.field === 2);
    return sf && sf.value instanceof Uint8Array ? new TextDecoder().decode(sf.value) : '';
  }
  if (type === 3) { // int64 zigzag
    const nf = fields.find(f => f.field === 3);
    if (typeof nf?.value === 'number') {
      const z = nf.value;
      return (z & 1) ? -(z >> 1) - 1 : z >> 1;
    }
    return 0;
  }
  if (type === 4) { // bool
    const bf = fields.find(f => f.field === 4);
    return typeof bf?.value === 'number' ? bf.value !== 0 : false;
  }
  if (type === 5) { // double (8 bytes LE)
    const df = fields.find(f => f.field === 5);
    if (df?.value instanceof Uint8Array && df.value.length === 8) {
      return new DataView(df.value.buffer).getFloat64(df.value.byteOffset, true);
    }
  }
  return null;
}

function decodeColumn(buf: Uint8Array): { name: string; value: string | number | boolean | null } {
  const fields   = parsePB(buf);
  const namef    = fields.find(f => f.field === 1);
  const valuef   = fields.find(f => f.field === 2);
  const name     = namef?.value instanceof Uint8Array ? new TextDecoder().decode(namef.value) : '';
  const value    = valuef?.value instanceof Uint8Array ? decodeColumnValue(valuef.value) : null;
  return { name, value };
}

function decodeRow(buf: Uint8Array): TSRow {
  const fields = parsePB(buf);
  const pk: Record<string, string | number>               = {};
  const attributes: Record<string, string | number | boolean | null> = {};

  for (const f of fields) {
    if (f.field === 1 && f.value instanceof Uint8Array) {
      // primary_key column
      const pkFields = parsePB(f.value);
      const nf = pkFields.find(x => x.field === 1);
      const vf = pkFields.find(x => x.field === 2);
      const kn = nf?.value instanceof Uint8Array ? new TextDecoder().decode(nf.value) : '';
      const kv = vf?.value instanceof Uint8Array ? decodeColumnValue(vf.value) : '';
      if (kn) pk[kn] = kv as string | number;
    }
    if (f.field === 2 && f.value instanceof Uint8Array) {
      const col = decodeColumn(f.value);
      if (col.name) attributes[col.name] = col.value;
    }
  }
  return { primaryKey: pk, attributes };
}

function parseGetRowResponse(buf: Uint8Array): TSRow | null {
  const fields = parsePB(buf);
  const rowField = fields.find(f => f.field === 1); // consumed = 1, row = 2 in response
  // Actually in GetRowResponse: consumed(1), row(2)
  const rowF = fields.find(f => f.field === 2);
  if (!rowF || !(rowF.value instanceof Uint8Array) || rowF.value.length === 0) return null;
  return decodeRow(rowF.value);
}

function parseGetRangeResponse(buf: Uint8Array): TSRow[] {
  const rows: TSRow[] = [];
  const fields = parsePB(buf);
  for (const f of fields) {
    // GetRangeResponse: consumed(1), next_start_primary_key(2), rows(3)
    if (f.field === 3 && f.value instanceof Uint8Array && f.value.length > 0) {
      rows.push(decodeRow(f.value));
    }
  }
  return rows;
}

// ── Convenience: build config from env ────────────────────────────────────────

export function buildTSConfig(): TSConfig | null {
  const endpoint        = (process.env.TABLESTORE_ENDPOINT        ?? '').trim();
  const instanceName    = (process.env.TABLESTORE_INSTANCE_NAME   ?? 'neodevcn').trim();
  const accessKeyId     = (process.env.ALIBABA_CLOUD_ACCESS_KEY_ID    ?? '').trim();
  const accessKeySecret = (process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET ?? '').trim();
  const tableName       = (process.env.TABLESTORE_ROUTER_TABLE    ?? 'router_table').trim();

  if (!endpoint || !accessKeyId || !accessKeySecret) return null;
  return { endpoint, instanceName, accessKeyId, accessKeySecret, tableName };
}

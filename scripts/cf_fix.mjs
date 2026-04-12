import https from 'https';

const TOKEN   = 'Tx4LEBXQzIORQEIOQfmCFghvtEQ1QeQO7szlCErx_y8.XQX53nLZc3wpglcPNSld3zKdH-_43Cc5X7LWYKLP2bw';
const ACCOUNT = 'fac7207421271dd5183fcab70164cad1';
const ZONE    = '01a040ee5bbab5c1c2a0e73ddd5ca57e';

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const opts = {
      hostname: 'api.cloudflare.com',
      path: '/client/v4' + path,
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// 1. Delete Pages custom domain
console.log('=== 1. Delete Pages custom domain (remove SSL conflict) ===');
const del = await api('DELETE', `/accounts/${ACCOUNT}/pages/projects/neowow-studio-dashboard/domains/app.neowow.studio`);
console.log('  result:', del.success ? 'OK deleted' : JSON.stringify(del.errors || del));

// 2. List DNS records
console.log('\n=== 2. DNS records for app.neowow.studio ===');
const dnsResp = await api('GET', `/zones/${ZONE}/dns_records?name=app.neowow.studio`);
const recs = dnsResp.result || [];
recs.forEach(r => console.log(`  id=${r.id} type=${r.type} content=${r.content} proxied=${r.proxied}`));
if (!recs.length) console.log('  NO_RECORDS');

// 3. Ensure CNAME exists and is proxied
console.log('\n=== 3. Ensure CNAME app -> pages.dev (proxied=true) ===');
if (!recs.length) {
  const cr = await api('POST', `/zones/${ZONE}/dns_records`, {
    type: 'CNAME', name: 'app',
    content: 'neowow-studio-dashboard.pages.dev',
    proxied: true, ttl: 1,
  });
  console.log('  Created:', cr.success ? 'OK' : JSON.stringify(cr.errors));
} else {
  const rec = recs[0];
  if (!rec.proxied || rec.content !== 'neowow-studio-dashboard.pages.dev') {
    const pr = await api('PATCH', `/zones/${ZONE}/dns_records/${rec.id}`, {
      proxied: true, content: 'neowow-studio-dashboard.pages.dev',
    });
    console.log(`  Patched id=${rec.id}:`, pr.success ? 'OK' : JSON.stringify(pr.errors));
  } else {
    console.log('  Already correct (proxied=true, correct target)');
  }
}

// 4. SSL cert packs
console.log('\n=== 4. SSL certificate packs ===');
const ssl = await api('GET', `/zones/${ZONE}/ssl/certificate_packs`);
(ssl.result || []).forEach(p =>
  console.log(`  type=${p.type} status=${p.status} hosts=${JSON.stringify(p.hosts)}`)
);

// 5. Test connectivity
console.log('\n=== 5. Test HTTPS app.neowow.studio ===');
const test = await new Promise(resolve => {
  const req = https.request({ hostname: 'app.neowow.studio', path: '/', method: 'GET' }, res => {
    resolve({ status: res.statusCode, server: res.headers.server || '', cf: res.headers['cf-ray'] || '' });
  });
  req.on('error', e => resolve({ error: e.message }));
  req.end();
});
console.log('  result:', JSON.stringify(test));

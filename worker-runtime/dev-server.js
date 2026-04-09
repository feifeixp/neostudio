'use strict';

/**
 * Local dev server — simulates the FC3 HTTP trigger event format.
 * Usage: node dev-server.js [port]
 */

try { require('dotenv').config(); } catch (_) { /* dotenv optional */ }
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { handler } = require('./index');

const PORT = Number(process.argv[2]) || 9000;

const server = http.createServer((nodeReq, nodeRes) => {
  const urlObj = new URL(nodeReq.url, `http://localhost:${PORT}`);
  const chunks = [];

  nodeReq.on('data', c => chunks.push(c));
  nodeReq.on('end', async () => {
    // Serve test UI at /
    if (urlObj.pathname === '/' || urlObj.pathname === '/test-ui.html') {
      const html = fs.readFileSync(path.join(__dirname, 'test-ui.html'));
      nodeRes.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      nodeRes.end(html);
      return;
    }

    // /invoke endpoint: router-function sends FC3 event payload as JSON body
    if (urlObj.pathname === '/invoke' && nodeReq.method === 'POST') {
      const rawBody = Buffer.concat(chunks);
      let fcEvent;
      try {
        fcEvent = JSON.parse(rawBody.toString('utf8'));
      } catch (e) {
        nodeRes.writeHead(400);
        nodeRes.end(JSON.stringify({ error: 'Invalid JSON event: ' + e.message }));
        return;
      }
      const fcContext = { requestId: 'invoke-' + Date.now() };
      try {
        const result = await handler(Buffer.from(JSON.stringify(fcEvent)), fcContext);
        nodeRes.writeHead(200, { 'Content-Type': 'application/json' });
        nodeRes.end(JSON.stringify(result));
      } catch (err) {
        nodeRes.writeHead(500, { 'Content-Type': 'application/json' });
        nodeRes.end(JSON.stringify({ statusCode: 500, headers: {}, body: 'Worker error: ' + err.message }));
      }
      return;
    }

    const rawBody = Buffer.concat(chunks);

    // Build an FC3-compatible event object
    const fcEvent = {
      version: 'v1',
      rawPath: urlObj.pathname,
      headers: nodeReq.headers,
      queryParameters: Object.fromEntries(urlObj.searchParams),
      body: rawBody.toString('base64'),
      isBase64Encoded: true,
      requestContext: {
        domainName: `localhost:${PORT}`,
        http: {
          method: nodeReq.method,
          path: urlObj.pathname,
        },
      },
    };

    // Simulate FC3 context
    const fcContext = { requestId: 'local-' + Date.now() };

    try {
      const result = await handler(Buffer.from(JSON.stringify(fcEvent)), fcContext);
      const { statusCode = 200, headers = {}, body = '', isBase64Encoded } = result;

      nodeRes.writeHead(statusCode, headers);
      if (isBase64Encoded) {
        nodeRes.end(Buffer.from(body, 'base64'));
      } else {
        nodeRes.end(body);
      }
    } catch (err) {
      nodeRes.writeHead(500);
      nodeRes.end(JSON.stringify({ error: err.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`[worker-runtime] dev server → http://localhost:${PORT}`);
  console.log('  POST /invoke       ← router-function 调用入口');
  console.log('  GET  /health       ← 直接访问');
  console.log('  ALL  /neo-api/*    ← Neodomain 代理');
  console.log('  GET  /*            ← 静态文件 (public/)');
});

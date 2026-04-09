const http = require('http');
const { handler } = require('./index.js');

const PORT = 9000;

// This server simulates the Aliyun FC infrastructure that receives an invokeFunction call
// and pipes the raw FC Event JSON directly into the handler.
const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405);
    return res.end('Only POST allowed');
  }

  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', async () => {
    const rawBody = Buffer.concat(chunks);
    const fcContext = { requestId: 'invoke-' + Date.now() };

    try {
      // The router sends a JSON string of the FC Event. We pass it to the handler.
      const result = await handler(rawBody, fcContext);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error('[Worker Runtime] Error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        statusCode: 500,
        headers: {},
        body: 'Worker Runtime Error: ' + err.message
      }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`[Worker Runtime] Mock Invoke server listening on http://127.0.0.1:${PORT}`);
});

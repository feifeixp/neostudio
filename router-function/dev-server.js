import 'dotenv/config';
import http from 'http';
import { handler } from './src/index.js';

// The dev server creates a standard Node HTTP server and feeds it into the FC handler
const server = http.createServer((req, res) => {
  // polyfill for `resp.send` which FC provides
  res.send = function(data) {
    if (Buffer.isBuffer(data)) {
      this.end(data);
    } else {
      this.end(String(data));
    }
  };
  res.setStatusCode = function(code) {
    this.statusCode = code;
  };

  const context = {
    requestId: 'dev-req-' + Math.random().toString(36).substring(2, 9)
  };

  handler(req, res, context);
});

const PORT = 8080;
server.listen(PORT, () => {
  console.log(`[Router Gateway] Prototype running on http://localhost:${PORT}`);
  console.log(`Try accessing with: curl -H "Host: worker1.localhost" http://localhost:${PORT}`);
});

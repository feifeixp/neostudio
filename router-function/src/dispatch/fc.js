import http from 'http';
import FCClient from '@alicloud/fc2';

let fcClient = null;

export function initFC() {
  if (process.env.ALIBABA_CLOUD_ACCESS_KEY_ID && process.env.FC_ACCOUNT_ID) {
    fcClient = new FCClient(process.env.FC_ACCOUNT_ID, {
      accessKeyID: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
      accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
      region: process.env.FC_REGION || 'cn-shanghai',
      timeout: 15000 // 15s limit for edge rendering
    });
    console.log('[Router Dispatch] Aliyun FC SDK Initialized.');
  } else {
    fcClient = null;
    console.warn('[Router Dispatch] Missing FC env vars. Using local Worker Runtime proxy on port 9000.');
  }
}

// Auto init on import
initFC();

export async function dispatchFC(req, route, context) {
  const body = await readBody(req);
  const event = JSON.stringify({
    version: '1.0',
    httpMethod: req.method,
    path: req.url || '/',
    headers: req.headers,
    body: body.toString('base64'),
    isBase64Encoded: true,
    __platform: {
      workerId: route.workerId,
      ownerId: route.ownerId
    }
  });

  if (!fcClient) {
    return fallbackLocalMock(event);
  }

  return new Promise((resolve, reject) => {
    const serviceName = route.serviceName || process.env.FC_DEFAULT_SERVICE || 'worker-service';
    
    fcClient.invokeFunction(
      serviceName, 
      route.functionName, 
      event, 
      {
        'X-Fc-Log-Type': 'None',
        'X-Fc-Invocation-Type': 'Sync'
      }
    ).then((res) => {
      const rawRes = res.data ? res.data.toString() : '';
      try {
        const result = JSON.parse(rawRes);
        resolve({
          statusCode: result.statusCode || 200,
          headers: result.headers || {},
          body: result.isBase64Encoded ? Buffer.from(result.body, 'base64') : result.body
        });
      } catch(e) {
        resolve({
          statusCode: 502,
          headers: {},
          body: 'Bad Gateway: Function output invalid -> ' + rawRes
        });
      }
    }).catch(err => {
      console.error('[Router Dispatch] FC Invoke Error:', err);
      resolve({
         statusCode: 502, 
         headers: {}, 
         body: 'Internal Server Error: FC Invocation Failed -> ' + err.message 
      });
    });
  });
}

function fallbackLocalMock(event) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 9000,
      path: '/invoke',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(event)
      }
    };

    const proxyReq = http.request(options, (proxyResp) => {
      const chunks = [];
      proxyResp.on('data', chunk => chunks.push(chunk));
      proxyResp.on('end', () => {
        const rawRes = Buffer.concat(chunks).toString();
        try {
          const result = JSON.parse(rawRes);
          resolve({
            statusCode: result.statusCode,
            headers: result.headers || {},
            body: result.isBase64Encoded ? Buffer.from(result.body, 'base64') : result.body
          });
        } catch(e) {
          resolve({
            statusCode: 502,
            headers: {},
            body: 'Bad Gateway: Worker returned invalid payload -> ' + rawRes
          });
        }
      });
    });

    proxyReq.on('error', (err) => {
      resolve({ statusCode: 502, headers: {}, body: 'Local Worker Runtime not answering: ' + err.message });
    });
    
    proxyReq.write(event);
    proxyReq.end();
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

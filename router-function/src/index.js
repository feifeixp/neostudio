import { resolve } from './resolver.js';
import { dispatchFC } from './dispatch/fc.js';
import { checkRateLimit } from './middleware/ratelimit.js';

export const handler = async (req, resp, context) => {
  const startTime = Date.now();
  try {
    const host = req.headers['host'] || req.headers['x-original-host'] || '';

    // ── 1. 路由解析 ──────────────────────────────────────────────────────────
    const route = await resolve(host);

    if (!route) {
      return sendError(resp, 404, 'Worker not found for host: ' + host);
    }

    if (route.status !== 'active') {
      return sendError(resp, 503, `Worker is ${route.status}`);
    }

    // ── 2. 限流检查（解析路由后，能拿到 ownerId 和 plan）───────────────────
    const rl = checkRateLimit(route.ownerId || host, route.plan || 'free');
    if (!rl.allowed) {
      resp.setHeader('Retry-After', String(rl.retryAfter ?? 60));
      resp.setHeader('X-RateLimit-Plan', rl.plan);
      return sendError(resp, 429, rl.reason || 'Too Many Requests');
    }

    // ── 3. 请求分发 ──────────────────────────────────────────────────────────
    let result;
    switch (route.type) {
      case 'fc':
        result = await dispatchFC(req, route, context);
        break;
      default:
        return sendError(resp, 500, `Unknown or unsupported worker type: ${route.type}`);
    }

    // ── 4. 响应透传 ──────────────────────────────────────────────────────────
    resp.setStatusCode(result.statusCode ?? 200);
    Object.entries(result.headers ?? {}).forEach(([k, v]) => {
      // 过滤 FC 内部 header，避免泄漏
      if (!k.toLowerCase().startsWith('x-fc-') && k.toLowerCase() !== 'server') {
        resp.setHeader(k, v);
      }
    });

    resp.setHeader('x-powered-by', 'Worker Platform');
    resp.setHeader('x-response-time', `${Date.now() - startTime}ms`);
    resp.setHeader('x-ratelimit-plan', rl.plan);
    resp.send(result.body ?? '');

  } catch (err) {
    console.error('[router] unhandled error', {
      host: req.headers['host'],
      error: err.message,
      stack: err.stack,
    });
    sendError(resp, 502, 'Router execution failed: ' + err.message);
  }
};

function sendError(resp, code, message, detail = '') {
  resp.setStatusCode(code);
  resp.setHeader('content-type', 'application/json');
  resp.send(JSON.stringify({ error: message, detail }));
}

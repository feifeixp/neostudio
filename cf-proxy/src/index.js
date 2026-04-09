/**
 * Cloudflare Worker — Neowow Studio 统一代理网关
 *
 * 路由规则：
 *   {workerName}.neowow.studio/*  → 子域名直接映射到 Worker（自定义域名模式）
 *   GET /                          → 产品介绍页（直接在 CF 边缘响应）
 *   GET /landing                   → 同上
 *   POST /api/chat                 → Claude AI 对话代理
 *   /w/{workerName}/*              → 转发到 FC，携带 X-Worker-Name header
 *   其余                           → 直接透传 FC
 */

import LANDING_HTML from './landing.html';

const FC_ORIGIN = 'https://fc-worker-dnqpfnoxtc.cn-hangzhou.fcapp.run';

export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname;
    const host = request.headers.get('host') || url.hostname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // ── *.neowow.studio 子域名路由：{workerName}.neowow.studio → Worker ─────────
    // 匹配任意子域（排除裸域 neowow.studio 本身，以及 www.neowow.studio）
    const subdomainMatch = host.match(/^([a-z0-9][a-z0-9-]{0,61})\.neowow\.studio$/i);
    if (subdomainMatch && subdomainMatch[1] !== 'www') {
      const workerName = subdomainMatch[1].toLowerCase();
      return proxyToWorker(request, workerName, path, url);
    }

    // ── 如果设置了 WORKER_ID env（独立子域名部署模式），所有请求都路由到该 worker ──
    if (env.WORKER_ID) {
      return proxyToWorker(request, env.WORKER_ID, path, url);
    }

    // ── Claude AI 对话代理（供已部署的 AI 助手页面调用）────────────────────────
    if (path === '/api/chat' && request.method === 'POST') {
      return handleChat(request, env);
    }

    // ── Landing page（边缘直接响应，不回源）────────────────────────────────────
    if (path === '/' || path === '/landing' || path === '/landing/') {
      return new Response(LANDING_HTML, {
        headers: {
          'Content-Type':  'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }

    // ── /w/{workerName}/* → 带 workerId 转发到 FC ──────────────────────────────
    const workerMatch = path.match(/^\/w\/([^/]+)(\/.*)?$/);
    if (workerMatch) {
      const workerName = workerMatch[1];
      const subPath    = workerMatch[2] || '/';
      return proxyToWorker(request, workerName, subPath, url);
    }

    // ── 其余请求透传 FC（neo-api 等）──────────────────────────────────────────
    return proxyRaw(request, path, url);
  },
};

/**
 * Claude AI 对话代理
 * 已部署的 AI 助手页面通过此端点安全调用 Claude，API Key 不暴露到前端。
 */
async function handleChat(request, env) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'AI service not configured on this gateway' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
  try {
    const body = await request.json();
    const { messages, system, model = 'claude-haiku-4-5', max_tokens = 2048 } = body;

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'messages array is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ model, max_tokens, system, messages }),
    });

    const data = await resp.json();
    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}

/** 带 worker 身份代理到 FC */
async function proxyToWorker(request, workerName, subPath, url) {
  const targetUrl = FC_ORIGIN + subPath + url.search;
  const headers   = new Headers(request.headers);
  headers.set('X-Worker-Name', workerName);
  headers.set('X-Worker-Id',   workerName);

  const proxyReq = new Request(targetUrl, {
    method:  request.method,
    headers,
    body:    ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
  });

  try {
    const resp       = await fetch(proxyReq);
    const newHeaders = new Headers(resp.headers);
    Object.entries(corsHeaders()).forEach(([k, v]) => newHeaders.set(k, v));
    newHeaders.set('Content-Disposition', 'inline');
    return new Response(resp.body, { status: resp.status, headers: newHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}

/** 透传到 FC，不注入 worker 身份 */
async function proxyRaw(request, path, url) {
  const targetUrl = FC_ORIGIN + path + url.search;
  const proxyReq  = new Request(targetUrl, {
    method:  request.method,
    headers: request.headers,
    body:    ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
  });

  try {
    const resp       = await fetch(proxyReq);
    const newHeaders = new Headers(resp.headers);
    Object.entries(corsHeaders()).forEach(([k, v]) => newHeaders.set(k, v));
    newHeaders.set('Content-Disposition', 'inline');
    return new Response(resp.body, { status: resp.status, headers: newHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,accessToken,X-Worker-Name',
  };
}

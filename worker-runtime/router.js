'use strict';

/**
 * FC Worker Router — designed for FC3 HTTP trigger (event function).
 *
 * FC3 HTTP trigger calling convention:
 *   handler(event: Buffer, context) => Promise<{ statusCode, headers, body }>
 *
 * The event JSON shape:
 *   {
 *     version: "v1",
 *     rawPath: "/foo",
 *     headers: { ... },
 *     queryParameters: { key: value },
 *     body: "<base64>",
 *     isBase64Encoded: true,
 *     requestContext: { http: { method: "GET", ... }, ... }
 *   }
 */
class Router {
  constructor() {
    this.routes = [];
    this.middlewares = [];
  }

  use(fn)    { this.middlewares.push(fn); return this; }
  get(p, h)  { return this._add('GET',    p, h); }
  post(p, h) { return this._add('POST',   p, h); }
  put(p, h)  { return this._add('PUT',    p, h); }
  patch(p, h){ return this._add('PATCH',  p, h); }
  delete(p, h){ return this._add('DELETE', p, h); }
  options(p, h){ return this._add('OPTIONS', p, h); }
  all(p, h)  { return this._add('ALL',    p, h); }

  _add(method, pattern, handler) {
    this.routes.push({ method, pattern: this._compile(pattern), handler });
    return this;
  }

  _compile(pattern) {
    if (pattern instanceof RegExp) return pattern;
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '(?<$1>[^/]+)')
      .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}\\/?$`);
  }

  async handle(request, env) {
    const { method, path } = request;

    for (const mw of this.middlewares) {
      const res = await mw(request, env);
      if (res instanceof WorkerResponse) return res;
    }

    for (const route of this.routes) {
      if (route.method !== 'ALL' && route.method !== method) continue;
      const match = path.match(route.pattern);
      if (!match) continue;

      request.params = match.groups || {};
      const result = await route.handler(request, env);
      if (result instanceof WorkerResponse) return result;
      if (result !== undefined) return WorkerResponse.json(result);
    }

    return new WorkerResponse('Not Found', { status: 404 });
  }
}

/**
 * WorkerRequest — wraps FC3 event object into a familiar Worker-like API.
 */
class WorkerRequest {
  constructor(eventObj) {
    const http  = eventObj.requestContext && eventObj.requestContext.http || {};
    this.method  = (http.method || 'GET').toUpperCase();
    this.path    = eventObj.rawPath || '/';
    this.headers = eventObj.headers || {};
    this.queries = eventObj.queryParameters || {};
    this.params  = {};

    // Decode body: FC3 sends it as base64 when isBase64Encoded=true
    if (eventObj.body) {
      this._rawBody = eventObj.isBase64Encoded
        ? Buffer.from(eventObj.body, 'base64')
        : Buffer.from(eventObj.body, 'utf8');
    } else {
      this._rawBody = Buffer.alloc(0);
    }

    const host = this.headers['Host'] || this.headers['host'] ||
                 (eventObj.requestContext && eventObj.requestContext.domainName) ||
                 'localhost';
    const qs   = Object.keys(this.queries).length
      ? '?' + new URLSearchParams(this.queries).toString()
      : '';
    this.url = `https://${host}${this.path}${qs}`;
  }

  arrayBuffer() { return Promise.resolve(this._rawBody); }
  text()        { return Promise.resolve(this._rawBody.toString('utf8')); }
  json()        { return this.text().then(JSON.parse); }
}

/**
 * WorkerResponse — mimics the Web Response API.
 * .toFC3() converts it to the { statusCode, headers, body } shape FC3 expects.
 */
class WorkerResponse {
  constructor(body, init = {}) {
    this.status   = init.status || 200;
    this._headers = {};
    if (init.headers) Object.assign(this._headers, init.headers);
    this._body = body;
  }

  static json(data, init = {}) {
    return new WorkerResponse(JSON.stringify(data), {
      ...init,
      status: init.status || 200,
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
  }

  // Convert to the object FC3 HTTP trigger expects as return value
  toFC3() {
    let bodyStr;
    if (this._body == null) {
      bodyStr = '';
    } else if (Buffer.isBuffer(this._body)) {
      // Send binary as base64
      return {
        statusCode: this.status,
        headers: this._headers,
        body: this._body.toString('base64'),
        isBase64Encoded: true,
      };
    } else {
      bodyStr = String(this._body);
    }
    return {
      statusCode: this.status,
      headers: this._headers,
      body: bodyStr,
    };
  }
}

module.exports = { Router, WorkerRequest, WorkerResponse };

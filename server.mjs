import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ApiError } from './src/errors.mjs';
import { serviceFromEnvironment } from './src/panta.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const mime = new Map([['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.ico', 'image/x-icon'], ['.webp', 'image/webp']]);
const security = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'Cross-Origin-Resource-Policy': 'same-origin', 'Cache-Control': 'no-store'
};
function json(res, status, value, headers = {}) {
  res.writeHead(status, { ...security, 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(value));
}
function fail(res, error) {
  const safe = error instanceof ApiError ? error : new ApiError(500, 'INTERNAL_ERROR', 'The server could not complete this request.');
  const payload = { code: safe.code, message: safe.message };
  if (safe.retryAfterSeconds) payload.retryAfterSeconds = safe.retryAfterSeconds;
  json(res, safe.status, { error: payload }, safe.retryAfterSeconds ? { 'Retry-After': String(safe.retryAfterSeconds) } : {});
}
function checkQuery(url, allowed) {
  for (const key of url.searchParams.keys()) {
    if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1)
      throw new ApiError(400, 'INVALID_QUERY', 'Unsupported or repeated query parameter.');
  }
}

export function createSourcebriefServer({ service, publicDir = path.join(root, 'public'), host = '127.0.0.1' } = {}) {
  if (!service) throw new TypeError('service is required');
  const allowedHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
  if (host !== '0.0.0.0' && host !== '::') allowedHosts.add(host);
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'GET') {
        json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET is supported.' } }, { Allow: 'GET' }); return;
      }
      if (req.headers['transfer-encoding'] || (req.headers['content-length'] && req.headers['content-length'] !== '0'))
        throw new ApiError(400, 'GET_BODY_NOT_ALLOWED', 'GET requests must not include a body.');
      let requestHost;
      try { requestHost = new URL(`http://${req.headers.host}`); } catch { throw new ApiError(403, 'HOST_REJECTED', 'Unrecognized local host.'); }
      const port = String(server.address()?.port ?? 80);
      if (!allowedHosts.has(requestHost.hostname) || (requestHost.port || '80') !== port
          || requestHost.username || requestHost.password || requestHost.pathname !== '/')
        throw new ApiError(403, 'HOST_REJECTED', 'Unrecognized local host.');
      if ((req.headers.origin && req.headers.origin !== requestHost.origin) || req.headers['sec-fetch-site'] === 'cross-site')
        throw new ApiError(403, 'ORIGIN_REJECTED', 'Cross-site requests are not supported.');
      if (typeof req.url !== 'string' || !req.url.startsWith('/') || req.url.startsWith('//') || req.url.length > 2048 || req.url.includes('\\'))
        throw new ApiError(400, 'INVALID_REQUEST', 'Invalid request path.');
      let rawPath;
      try { rawPath = decodeURIComponent(req.url.split('?')[0]); } catch { throw new ApiError(400, 'INVALID_REQUEST', 'Invalid encoded path.'); }
      if (rawPath.includes('\\') || rawPath.includes('\0') || rawPath.split('/').some(segment => segment.startsWith('.')))
        throw new ApiError(400, 'INVALID_REQUEST', 'Unsupported path.');
      const url = new URL(req.url, requestHost.origin);
      if (url.pathname === '/api/catalog') {
        checkQuery(url, ['limit', 'cursor']);
        const value = url.searchParams.get('limit') ?? '20';
        if (!/^(?:[1-9]|1[0-9]|20)$/.test(value)) throw new ApiError(400, 'INVALID_LIMIT', 'Limit must be an integer from 1 to 20.');
        json(res, 200, await service.catalog({ limit: Number(value), cursor: url.searchParams.get('cursor') })); return;
      }
      if (url.pathname.startsWith('/api/brief/')) {
        checkQuery(url, ['refresh']);
        const refresh = url.searchParams.get('refresh');
        if (refresh !== null && refresh !== '1') throw new ApiError(400, 'INVALID_REFRESH', 'Refresh must be 1 when supplied.');
        const id = decodeURIComponent(url.pathname.slice('/api/brief/'.length));
        json(res, 200, await service.brief(id, { refresh: refresh === '1' })); return;
      }
      if (url.pathname.startsWith('/api/')) throw new ApiError(404, 'NOT_FOUND', 'Unknown API route.');
      const isIndex = rawPath === '/' || rawPath === '/index.html';
      checkQuery(url, isIndex ? ['q', 'category'] : []);
      if (isIndex && ((url.searchParams.get('q')?.length ?? 0) > 200
          || (url.searchParams.get('category')?.length ?? 0) > 80
          || [...url.searchParams.values()].some(value => /[\u0000-\u001f\u007f]/.test(value))))
        throw new ApiError(400, 'INVALID_FILTER', 'Saved filters exceed the supported size or contain control characters.');
      const filePath = rawPath === '/' ? '/index.html' : rawPath;
      const type = mime.get(path.extname(filePath));
      if (!type) throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
      let bytes;
      try {
        const base = await realpath(publicDir);
        const target = await realpath(path.join(base, filePath));
        const relative = path.relative(base, target);
        if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('outside public root');
        bytes = await readFile(target);
      } catch { throw new ApiError(404, 'NOT_FOUND', 'Resource not found.'); }
      res.writeHead(200, { ...security, 'Content-Type': type }); res.end(bytes);
    } catch (error) { fail(res, error); }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = process.env.PORT === undefined ? 5186 : Number(process.env.PORT);
  const host = process.env.HOST ?? '127.0.0.1';
  if (!Number.isInteger(port) || port < 0 || port > 65535) { console.error('PORT must be an integer from 0 to 65535.'); process.exitCode = 1; }
  else {
    // Configuration errors remain visible as safe API errors while the UI can still load.
    let service;
    try { service = await serviceFromEnvironment(); }
    catch (error) {
      const safe = error instanceof ApiError ? error : new ApiError(503, 'CONFIGURATION_ERROR', 'Check the server configuration locally.');
      service = { mode: 'unavailable', catalog: async () => { throw safe; }, brief: async () => { throw safe; } };
    }
    const server = createSourcebriefServer({ service, host });
    server.on('error', () => { console.error('Sourcebrief could not bind the configured host and port.'); process.exitCode = 1; });
    server.listen(port, host, () => console.log(`Sourcebrief (${service.mode}) listening at http://${host}:${server.address().port}`));
  }
}

import { ApiError } from './src/errors.mjs';
import { createPantaService, validateCatalog, retryAfterSeconds } from './src/panta.mjs';
import { createSolamiService } from './src/solami.mjs';
import { createDbcService, DBC_EXAMPLES, validatePoolAddress } from './src/dbc.mjs';
import { isSolanaId } from './src/normalize.mjs';
import recordedPanta from './fixtures/panta-recording-2026-10-02.json' with { type: 'json' };

const SECURITY = Object.freeze({
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'Cross-Origin-Resource-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cache-Control': 'no-store', 'Vary': 'Origin, Sec-Fetch-Site'
});
const clone = value => structuredClone(value);

function json(status, value, extras = {}) {
  return new Response(JSON.stringify(value), { status, headers: { ...SECURITY, 'Content-Type': 'application/json; charset=utf-8', ...extras } });
}
function failure(error) {
  const safe = error instanceof ApiError ? error : new ApiError(500, 'INTERNAL_ERROR', 'The server could not complete this request.');
  return json(safe.status, { error: { code: safe.code, message: safe.message,
    ...(safe.retryAfterSeconds ? { retryAfterSeconds: safe.retryAfterSeconds } : {}) } },
  safe.retryAfterSeconds ? { 'Retry-After': String(safe.retryAfterSeconds) } : {});
}
function checkQuery(url, allowed) {
  for (const key of url.searchParams.keys())
    if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1)
      throw new ApiError(400, 'INVALID_QUERY', 'Unsupported or repeated query parameter.');
}
function refreshOption(url) {
  const value = url.searchParams.get('refresh');
  if (value !== null && value !== '1') throw new ApiError(400, 'INVALID_REFRESH', 'Refresh must be 1 when supplied.');
  return value === '1';
}
function checkRequest(request) {
  if (request.method !== 'GET') return json(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET is supported.' } }, { Allow: 'GET' });
  if (request.body !== null && request.body !== undefined || request.headers.has('transfer-encoding')
    || request.headers.has('content-length') && request.headers.get('content-length') !== '0')
    throw new ApiError(400, 'GET_BODY_NOT_ALLOWED', 'GET requests must not include a body.');
  let url;
  try { url = new URL(request.url); } catch { throw new ApiError(400, 'INVALID_REQUEST', 'Invalid request URL.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash
    || url.href.length > 2048 || /[%\\\u0000-\u001f\u007f]/.test(url.pathname) || url.pathname.includes('//')
    || url.pathname.split('/').some(segment => segment.startsWith('.')))
    throw new ApiError(400, 'INVALID_REQUEST', 'Unsupported request path.');
  const origin = request.headers.get('origin');
  const externalNavigation = !url.pathname.startsWith('/api/')
    && request.headers.get('sec-fetch-mode') === 'navigate' && request.headers.get('sec-fetch-dest') === 'document';
  if (origin !== null && origin !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site' && !externalNavigation)
    throw new ApiError(403, 'ORIGIN_REJECTED', 'Cross-site API and subresource requests are not supported.');
  return url;
}

/**
 * Only completed, public JSON evidence and numeric counters survive requests.
 * No Request, Response, network Promise or user-specific state crosses a Worker invocation.
 * These limits are per isolate and may reset: they are not a global quota or billing guarantee.
 */
export function createSourcebriefWorker({ fetchImpl = globalThis.fetch, now = Date.now,
  serviceFactory = null, cacheMs = 5000, pantaBudget = 60, solamiBudget = 120 } = {}) {
  if (!Number.isInteger(cacheMs) || cacheMs < 0 || cacheMs > 60000) throw new TypeError('Invalid worker cache duration');
  if (!Number.isInteger(pantaBudget) || pantaBudget < 1 || pantaBudget > 60
    || !Number.isInteger(solamiBudget) || solamiBudget < 1 || solamiBudget > 360) throw new TypeError('Invalid worker read budget');
  const cache = new Map();
  const attempts = { Panta: [], Solami: [] };
  const cooldownUntil = { Panta: 0, Solami: 0 };
  function limitedFetch(provider) {
    return async (...args) => {
      const at = now(), times = attempts[provider], budget = provider === 'Panta' ? pantaBudget : solamiBudget;
      if (cooldownUntil[provider] > at)
        throw new ApiError(429, 'WORKER_UPSTREAM_COOLDOWN', `The ${provider} provider requested a pause. Try again after the indicated delay.`, Math.max(1, Math.ceil((cooldownUntil[provider] - at) / 1000)));
      while (times.length && times[0] <= at - 3600000) times.shift();
      if (times.length >= budget) throw new ApiError(429, 'WORKER_UPSTREAM_BUDGET', `This server instance has reached its hourly ${provider} read budget.`, Math.max(1, Math.ceil((times[0] + 3600000 - at) / 1000)));
      if (provider === 'Solami' && times.filter(value => value > at - 1000).length >= 4)
        throw new ApiError(429, 'WORKER_READ_RATE_LIMIT', 'This server instance is limited to four Solami reads per second. Try again shortly.', 1);
      times.push(at);
      const response = await fetchImpl(...args);
      if (response.status === 429) {
        const receivedAt = now();
        cooldownUntil[provider] = Math.max(cooldownUntil[provider], receivedAt + retryAfterSeconds(response.headers.get('retry-after'), receivedAt) * 1000);
      }
      return response;
    };
  }
  function services(env) {
    if (serviceFactory) return serviceFactory(env);
    // Initialize only the provider needed for this route. One missing/invalid integration must not hide the other.
    return {
      get panta() {
        const mode = env.PANTA_MODE ?? 'live';
        if (!['live', 'recorded'].includes(mode)) throw new ApiError(503, 'PANTA_MODE_INVALID', 'Panta mode must be explicitly live or recorded.');
        return createPantaService({ key: mode === 'live' ? env.PANTA_API_KEY ?? null : null,
          recording: mode === 'recorded' ? recordedPanta : null, fetchImpl: limitedFetch('Panta'), now });
      },
      get dbc() {
        const solami = createSolamiService({ key: env.SOLAMI_API_KEY ?? null, fetchImpl: limitedFetch('Solami'), now });
        return createDbcService({ rpc: solami });
      }
    };
  }
  async function evidence(name, refresh, mode, load) {
    const cacheKey = `${mode}:${name}`, hit = cache.get(cacheKey);
    if (!refresh && hit && now() - hit.at < cacheMs) {
      const value = clone(hit.value);
      if (value.provenance) value.provenance.cached = true;
      return json(200, value);
    }
    const value = await load();
    // Store only successful completed results; a failed refresh does not replace old evidence.
    if (JSON.stringify(value).length <= 512 * 1024) {
      cache.delete(cacheKey);
      if (cache.size >= 64) cache.delete(cache.keys().next().value);
      cache.set(cacheKey, { at: now(), value: clone(value) });
    }
    return json(200, value);
  }
  return {
    async fetch(request, env = {}) {
      try {
        const url = checkRequest(request);
        if (url instanceof Response) return url;
        if (url.pathname === '/api/launch/examples') {
          checkQuery(url, []); return json(200, { items: DBC_EXAMPLES });
        }
        if (url.pathname === '/api/catalog') {
          checkQuery(url, ['limit', 'cursor']);
          const value = url.searchParams.get('limit') ?? '20';
          if (!/^(?:[1-9]|1[0-9]|20)$/.test(value)) throw new ApiError(400, 'INVALID_LIMIT', 'Limit must be an integer from 1 to 20.');
          const limit = Number(value), cursor = url.searchParams.get('cursor'); validateCatalog(limit, cursor);
          return await evidence(`catalog:${JSON.stringify([limit, cursor])}`, false, `${env.PANTA_MODE ?? 'live'}:${!!env.PANTA_API_KEY}`,
            () => services(env).panta.catalog({ limit, cursor }));
        }
        if (url.pathname.startsWith('/api/brief/')) {
          checkQuery(url, ['refresh']); const refresh = refreshOption(url);
          const id = url.pathname.slice('/api/brief/'.length);
          if (!isSolanaId(id)) throw new ApiError(400, 'INVALID_MARKET_ID', 'Market id must be a 32-byte Solana public key.');
          return await evidence(`brief:${id}`, refresh, `${env.PANTA_MODE ?? 'live'}:${!!env.PANTA_API_KEY}`, () => services(env).panta.brief(id, { refresh }));
        }
        if (url.pathname.startsWith('/api/launch/')) {
          checkQuery(url, ['refresh', 'quoteAmount']); const refresh = refreshOption(url);
          const pool = validatePoolAddress(url.pathname.slice('/api/launch/'.length));
          const quoteAmount = url.searchParams.get('quoteAmount') ?? '0.1';
          if (quoteAmount.length > 60 || !/^(0|[1-9]\d*)(\.\d+)?$/.test(quoteAmount) || !/[1-9]/.test(quoteAmount))
            throw new ApiError(400, 'INVALID_QUOTE_AMOUNT', 'Use a positive decimal amount, without commas or exponent notation.');
          return await evidence(`launch:${pool}:${quoteAmount}`, refresh, `live:${!!env.SOLAMI_API_KEY}`, () => services(env).dbc.brief(pool, { refresh, quoteAmount }));
        }
        if (url.pathname.startsWith('/api/') || url.pathname === '/api') throw new ApiError(404, 'NOT_FOUND', 'Unknown API route.');
        const index = ['/', '/index.html'].includes(url.pathname);
        checkQuery(url, index ? ['q', 'category'] : []);
        if (index && ((url.searchParams.get('q')?.length ?? 0) > 200 || (url.searchParams.get('category')?.length ?? 0) > 80
          || [...url.searchParams.values()].some(value => /[\u0000-\u001f\u007f]/.test(value))))
          throw new ApiError(400, 'INVALID_FILTER', 'Saved filters exceed the supported size or contain control characters.');
        if (!env.ASSETS?.fetch) throw new ApiError(503, 'ASSETS_UNAVAILABLE', 'Static application assets are not configured.');
        // The binding exposes only the explicit public asset directory, never repository or secret files.
        const response = await env.ASSETS.fetch(request);
        const headers = new Headers(response.headers);
        for (const [key, value] of Object.entries(SECURITY)) headers.set(key, value);
        headers.delete('access-control-allow-origin'); headers.delete('set-cookie');
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
      } catch (error) { return failure(error); }
    }
  };
}

export default createSourcebriefWorker();

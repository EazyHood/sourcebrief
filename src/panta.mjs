import { readFile } from 'node:fs/promises';
import { ApiError, badUpstream } from './errors.mjs';
import { isObject, isProviderTestMode, isSolanaId, normalizeBrief, normalizeCatalog, normalizeDate } from './normalize.mjs';

export const ORIGIN = 'https://live-api.panta.market';
const MAX_BYTES = 512 * 1024;
const MAX_CACHE = 64;
const clone = value => structuredClone(value);
const missingRecording = () => new ApiError(404, 'RECORDING_NOT_AVAILABLE',
  'This page or market was not captured. Recorded mode never invents a missing response or contacts Panta.');

export function validateCatalog(limit = 20, cursor = null) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new ApiError(400, 'INVALID_LIMIT', 'Limit must be an integer from 1 to 20.');
  if (cursor !== null && (typeof cursor !== 'string' || cursor.length > 512 || /[\u0000-\u001f\u007f]/.test(cursor)))
    throw new ApiError(400, 'INVALID_CURSOR', 'Cursor must be a string of at most 512 characters without control characters.');
}

export function retryAfterSeconds(value, now = Date.now()) {
  if (typeof value !== 'string') return 60;
  if (/^\d+$/.test(value)) return Math.max(1, Math.min(86400, Number(value)));
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(1, Math.min(86400, Math.ceil((timestamp - now) / 1000))) : 60;
}

// The secret is accepted only in server configuration and never copied into a recording.
export async function readApiKey(env) {
  let key = env.PANTA_API_KEY;
  if (!key && env.PANTA_KEY_FILE) {
    try {
      const buffer = await readFile(env.PANTA_KEY_FILE);
      if (buffer.byteLength > 8192) throw new Error('oversize');
      const source = buffer.toString('utf8').trim();
      if (source.startsWith('{')) {
        const value = JSON.parse(source);
        key = value.api_key ?? value.apiKey ?? value.key;
      } else key = source;
    } catch {
      throw new ApiError(503, 'KEY_CONFIGURATION_INVALID', 'The server could not read its Panta key configuration. Check the private key file locally.');
    }
  }
  if (!key) return null;
  if (typeof key !== 'string' || !/^[A-Za-z0-9._-]{8,512}$/.test(key))
    throw new ApiError(503, 'KEY_CONFIGURATION_INVALID', 'The configured Panta key has an unsupported format.');
  return key;
}

function createRecordedSource(recording) {
  if (!isObject(recording) || recording.origin !== ORIGIN || !Array.isArray(recording.requests))
    throw new ApiError(503, 'RECORDING_INVALID', 'Recording must declare the supported Panta production origin and contain captured GET responses.');
  const records = [];
  for (const request of recording.requests) {
    if (!isObject(request) || request.method !== 'GET' || request.status !== 200 || !isObject(request.body)) continue;
    let url;
    try { url = new URL(request.url ?? request.endpoint ?? request.path, ORIGIN); } catch { continue; }
    if (url.origin !== ORIGIN || url.username || url.password || url.hash) continue;
    if (url.pathname !== '/api/v1/markets/' && !/^\/api\/v1\/markets\/[1-9A-HJ-NP-Za-km-z]+\/$/.test(url.pathname)) continue;
    const fetchedAt = normalizeDate(request.completedAt ?? request.completed_at ?? request.fetchedAt ?? request.timestamp);
    if (!fetchedAt) continue;
    records.push({ url, payload: request.body, provenance: { provider: 'Panta', mode: 'recorded', fetchedAt,
      requestId: typeof request.requestId === 'string' ? request.requestId : request.request_id ?? request.headers?.['x-request-id'] ?? null,
      endpoint: url.href, cached: false } });
  }
  if (!records.length) throw new ApiError(503, 'RECORDING_INVALID', 'No supported timestamped market responses were found in the recording.');
  return (path, limit) => {
    const url = new URL(path, ORIGIN);
    const record = records.find(item => item.url.pathname === url.pathname
      && (url.pathname !== '/api/v1/markets/' || (item.url.searchParams.get('cursor') ?? '') === (url.searchParams.get('cursor') ?? '')));
    if (!record) throw missingRecording();
    if (Array.isArray(record.payload.items) && record.payload.items.length > limit)
      throw new ApiError(409, 'RECORDING_PAGE_LIMIT', 'Use a limit large enough for the captured page. Cutting a recorded page would skip markets at the next cursor.');
    return clone({ payload: record.payload, provenance: record.provenance });
  };
}

async function boundedJson(response, key) {
  const length = response.headers.get('content-length');
  if (length && /^\d+$/.test(length) && Number(length) > MAX_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new ApiError(502, 'UPSTREAM_RESPONSE_TOO_LARGE', 'Panta response exceeds the 512 KiB evidence limit.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw badUpstream();
  let total = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) throw new ApiError(502, 'UPSTREAM_RESPONSE_TOO_LARGE', 'Panta response exceeds the 512 KiB evidence limit.');
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks, total);
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // A provider echo cannot turn the private key into a public title, rule or request id.
    return JSON.parse(JSON.stringify(JSON.parse(source)).split(key).join('[REDACTED]'));
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof ApiError) throw error;
    throw badUpstream();
  } finally { reader.releaseLock(); }
}

/** Injectable clock/fetch/recording allow the complete transport policy to be tested offline. */
export function createPantaService({ key = null, recording = null, fetchImpl = globalThis.fetch,
  now = Date.now, timeoutMs = 12000, budget = 60, concurrentLimit = 2, cacheMs = 60000 } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 12000) throw new TypeError('timeout must be <=12000ms');
  if (!Number.isInteger(budget) || budget < 1 || budget > 60) throw new TypeError('budget must be <=60');
  if (!Number.isInteger(concurrentLimit) || concurrentLimit < 1 || concurrentLimit > 2) throw new TypeError('concurrency must be <=2');
  if (!Number.isFinite(cacheMs) || cacheMs < 0 || cacheMs > 60000) throw new TypeError('cache must be <=60000ms');
  if (key !== null && (typeof key !== 'string' || !/^[A-Za-z0-9._-]{8,512}$/.test(key))) throw new TypeError('unsupported key format');
  const recorded = recording ? createRecordedSource(recording) : null;
  const cache = new Map(), inFlight = new Map();
  const attempts = [];
  let active = 0, cooldownUntil = 0;

  async function live(path) {
    if (!key) throw new ApiError(503, 'SETUP_REQUIRED', 'Configure PANTA_API_KEY or PANTA_KEY_FILE on the server, or PANTA_RECORDING_FILE for clearly labeled recorded evidence.');
    const started = now();
    while (attempts.length && attempts[0] <= started - 3600000) attempts.shift();
    if (cooldownUntil > started) throw new ApiError(429, 'UPSTREAM_COOLDOWN', 'Panta requested a pause. Refresh cannot bypass this wait.', Math.ceil((cooldownUntil - started) / 1000));
    if (attempts.length >= budget) throw new ApiError(429, 'REQUEST_BUDGET_EXHAUSTED', 'The server hourly Panta request budget is exhausted.', Math.max(1, Math.ceil((attempts[0] + 3600000 - started) / 1000)));
    if (active >= concurrentLimit) throw new ApiError(429, 'REQUESTS_BUSY', 'Two Panta requests are already running. Try again shortly.', 1);
    attempts.push(started); active++;
    const controller = new AbortController();
    let timer;
    try {
      const operation = (async () => {
        const response = await fetchImpl(ORIGIN + path, { method: 'GET', redirect: 'manual',
          headers: { Accept: 'application/json', 'X-Api-Key': key }, signal: controller.signal });
        if (controller.signal.aborted) { await response.body?.cancel().catch(() => {}); throw new ApiError(504, 'UPSTREAM_TIMEOUT', 'Panta did not finish within 12 seconds.'); }
        if (response.status !== 200) {
          await response.body?.cancel().catch(() => {});
          if (response.status >= 300 && response.status < 400) throw new ApiError(502, 'UPSTREAM_REDIRECT', 'Panta redirected the request. No redirect was followed.');
          if (response.status === 429) {
            const seconds = retryAfterSeconds(response.headers.get('retry-after'), now());
            cooldownUntil = Math.max(cooldownUntil, now() + seconds * 1000);
            throw new ApiError(429, 'UPSTREAM_RATE_LIMIT', 'Panta rate limited this request.', seconds);
          }
          if (response.status === 401 || response.status === 403) throw new ApiError(502, 'UPSTREAM_AUTH', 'Panta did not authorize the server key. Check its access privately.');
          if (response.status === 404) throw new ApiError(404, 'MARKET_NOT_FOUND', 'Panta did not find this market.');
          throw new ApiError(502, 'UPSTREAM_UNAVAILABLE', 'Panta could not return this evidence. Try again later.');
        }
        const payload = await boundedJson(response, key);
        const requestId = response.headers.get('x-request-id') ?? response.headers.get('request-id');
        return { payload, provenance: { provider: 'Panta', mode: 'live', fetchedAt: new Date(now()).toISOString(),
          requestId: requestId ? requestId.split(key).join('[REDACTED]').slice(0, 200) : null,
          endpoint: ORIGIN + path, cached: false } };
      })();
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => {
        controller.abort(); reject(new ApiError(504, 'UPSTREAM_TIMEOUT', 'Panta did not finish within 12 seconds.'));
      }, timeoutMs); });
      return await Promise.race([operation, timeout]);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(502, 'UPSTREAM_UNAVAILABLE', 'Panta could not return this evidence. Try again later.');
    } finally { clearTimeout(timer); active--; }
  }

  async function load(path, refresh, limit, normalize) {
    const hit = cache.get(path);
    if (!refresh && hit && now() - hit.storedAt < cacheMs) {
      const result = clone(hit.value); result.provenance.cached = true; return result;
    }
    if (inFlight.has(path)) return clone(await inFlight.get(path));
    const work = (async () => {
      const raw = recorded ? recorded(path, limit) : await live(path);
      if (isProviderTestMode(raw.payload)) throw new ApiError(502, 'PROVIDER_TEST_MODE', 'Panta returned sandbox fixtures. No live evidence brief was created.');
      const value = normalize(raw.payload, raw.provenance);
      cache.delete(path);
      if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
      cache.set(path, { value: clone(value), storedAt: now() });
      return value;
    })();
    inFlight.set(path, work);
    try { return clone(await work); } finally { inFlight.delete(path); }
  }
  return {
    mode: recorded ? 'recorded' : 'live',
    async catalog({ limit = 20, cursor = null } = {}) {
      validateCatalog(limit, cursor);
      const query = new URLSearchParams({ limit: String(limit) });
      if (cursor !== null) query.set('cursor', cursor);
      return load(`/api/v1/markets/?${query}`, false, limit, (body, provenance) => normalizeCatalog(body, provenance, limit));
    },
    async brief(id, { refresh = false } = {}) {
      if (!isSolanaId(id)) throw new ApiError(400, 'INVALID_MARKET_ID', 'Market id must be a base58 Solana public key decoding to exactly 32 bytes.');
      return load(`/api/v1/markets/${id}/`, refresh === true, null, (body, provenance) => normalizeBrief(body, id, provenance));
    }
  };
}

export async function serviceFromEnvironment(env = process.env, options = {}) {
  if (env.PANTA_RECORDING_FILE) {
    let recording;
    try {
      const bytes = await readFile(env.PANTA_RECORDING_FILE);
      if (bytes.byteLength > 8 * 1024 * 1024) throw new Error('oversize');
      recording = JSON.parse(bytes.toString('utf8'));
    } catch { throw new ApiError(503, 'RECORDING_INVALID', 'The server could not load its recording file.'); }
    return createPantaService({ ...options, recording });
  }
  return createPantaService({ ...options, key: await readApiKey(env) });
}

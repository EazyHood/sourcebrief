import { readFile } from 'node:fs/promises';
import { ApiError } from './errors.mjs';
import { isObject, isSolanaId } from './normalize.mjs';

export const SOLAMI_ORIGIN = 'https://rpc.solami.dev';
export const MAINNET_GENESIS_HASH = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const MAX_BYTES = 512 * 1024;
const MAX_CACHE = 64;
const clone = value => structuredClone(value);
const invalid = () => new ApiError(502, 'SOLAMI_DATA_INVALID', 'Solami returned unsupported evidence. No new chain snapshot was created.');
const badParams = () => new ApiError(400, 'SOLAMI_INVALID_PARAMS', 'Unsupported read-only Solana request parameters.');
const uint = value => Number.isSafeInteger(value) && value >= 0;
const keysWithin = (value, allowed) => isObject(value) && Object.keys(value).every(key => allowed.includes(key));

function config(value, account = false) {
  if (value === undefined) return account ? { commitment: 'confirmed', encoding: 'base64' } : { commitment: 'confirmed' };
  if (!keysWithin(value, account ? ['commitment', 'encoding', 'minContextSlot'] : ['commitment', 'minContextSlot'])
    || (value.commitment !== undefined && value.commitment !== 'confirmed')
    || (account && value.encoding !== undefined && value.encoding !== 'base64')
    || (value.minContextSlot !== undefined && !uint(value.minContextSlot))) throw badParams();
  return { commitment: 'confirmed', ...(account ? { encoding: 'base64' } : {}),
    ...(value.minContextSlot === undefined ? {} : { minContextSlot: value.minContextSlot }) };
}

/** Deliberately not a general RPC proxy: no signing, simulation, broadcast or unbounded scans. */
export function validateSolamiRequest(method, params = []) {
  if (!Array.isArray(params)) throw badParams();
  if (method === 'getGenesisHash' && params.length === 0) return [];
  if (method === 'getSlot' && params.length <= 1) return [config(params[0])];
  if (method === 'getBlockTime' && params.length === 1 && uint(params[0])) return [params[0]];
  if (method === 'getAccountInfo' && params.length >= 1 && params.length <= 2 && isSolanaId(params[0]))
    return [params[0], config(params[1], true)];
  if (method === 'getMultipleAccounts' && params.length >= 1 && params.length <= 2
    && Array.isArray(params[0]) && params[0].length >= 1 && params[0].length <= 10 && params[0].every(isSolanaId))
    return [[...params[0]], config(params[1], true)];
  if (['getGenesisHash', 'getSlot', 'getBlockTime', 'getAccountInfo', 'getMultipleAccounts'].includes(method)) throw badParams();
  throw new ApiError(400, 'SOLAMI_METHOD_BLOCKED', 'This service only reads bounded account, slot and block-time evidence.');
}

function account(value) {
  if (value === null) return null;
  if (!isObject(value) || !isSolanaId(value.owner) || typeof value.executable !== 'boolean'
    || !uint(value.lamports) || !Array.isArray(value.data) || value.data.length !== 2 || value.data[1] !== 'base64'
    || typeof value.data[0] !== 'string' || value.data[0].length > 180000
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.data[0])) throw invalid();
  // Whitelist fields used by the decoder; no provider text or reflected credentials enter exports.
  return { data: [...value.data], executable: value.executable, lamports: value.lamports, owner: value.owner,
    ...(uint(value.space) ? { space: value.space } : {}) };
}

function normalizeResult(method, result, params) {
  if (method === 'getGenesisHash') {
    if (result !== MAINNET_GENESIS_HASH) throw new ApiError(502, 'SOLAMI_NETWORK_MISMATCH', 'The configured Solami RPC did not identify Solana mainnet. No chain brief was created.');
    return result;
  }
  if (method === 'getSlot') { if (!uint(result) || result < (params[0]?.minContextSlot ?? 0)) throw invalid(); return result; }
  if (method === 'getBlockTime') { if (result !== null && !uint(result)) throw invalid(); return result; }
  if (!isObject(result) || !isObject(result.context) || !uint(result.context.slot)
    || result.context.slot < (params[1]?.minContextSlot ?? 0)) throw invalid();
  let value;
  if (method === 'getMultipleAccounts') {
    if (!Array.isArray(result.value) || result.value.length !== params[0].length) throw invalid();
    value = result.value.map(account);
  } else value = account(result.value);
  return { context: { slot: result.context.slot }, value };
}

function retrySeconds(value, timestamp) {
  const seconds = typeof value === 'string' && /^\d+$/.test(value) ? Number(value)
    : Math.ceil((Date.parse(value) - timestamp) / 1000);
  return Number.isFinite(seconds) ? Math.min(86400, Math.max(1, seconds)) : 60;
}

async function boundedJson(response) {
  const length = response.headers.get('content-length');
  if (length && /^\d+$/.test(length) && Number(length) > MAX_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new ApiError(502, 'SOLAMI_RESPONSE_TOO_LARGE', 'Solami evidence exceeded the 512 KiB response limit.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw invalid();
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new ApiError(502, 'SOLAMI_RESPONSE_TOO_LARGE', 'Solami evidence exceeded the 512 KiB response limit.');
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof ApiError) throw error;
    throw invalid();
  } finally { reader.releaseLock(); }
}

/** A fixed-origin, mainnet-checked transport. Injected fetch/clock make failure policy reproducible offline. */
export function createSolamiService({ key = null, fetchImpl = globalThis.fetch, now = Date.now,
  timeoutMs = 10000, budget = 120, concurrentLimit = 2, cacheMs = 5000, perSecond = 4 } = {}) {
  if (key !== null && (typeof key !== 'string' || !/^[A-Za-z0-9._~-]{8,512}$/.test(key))) throw new TypeError('Unsupported Solami key format');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 12000) throw new TypeError('timeout must be 1..12000ms');
  if (!Number.isInteger(budget) || budget < 1 || budget > 360) throw new TypeError('budget must be 1..360 requests/hour');
  if (!Number.isInteger(concurrentLimit) || concurrentLimit < 1 || concurrentLimit > 2) throw new TypeError('concurrency must be 1..2');
  if (!Number.isInteger(perSecond) || perSecond < 1 || perSecond > 4) throw new TypeError('rate must be 1..4 requests/second');
  if (!Number.isInteger(cacheMs) || cacheMs < 0 || cacheMs > 60000) throw new TypeError('cache must be 0..60000ms');
  const cache = new Map(), inFlight = new Map(), attempts = [];
  let active = 0, cooldownUntil = 0, sequence = 0, genesis = null, genesisFlight = null;

  async function live(method, params) {
    if (!key) throw new ApiError(503, 'SOLAMI_SETUP_REQUIRED', 'Live chain evidence requires a private server-side Solami RPC key. No fallback provider or fabricated snapshot is used.');
    const started = now();
    while (attempts.length && attempts[0] <= started - 3600000) attempts.shift();
    if (cooldownUntil > started) throw new ApiError(429, 'SOLAMI_COOLDOWN', 'Solami requested a pause. Refresh does not bypass it.', Math.ceil((cooldownUntil - started) / 1000));
    if (attempts.length >= budget) throw new ApiError(429, 'SOLAMI_BUDGET_EXHAUSTED', 'The server hourly Solami evidence budget is exhausted.', Math.max(1, Math.ceil((attempts[0] + 3600000 - started) / 1000)));
    if (attempts.filter(at => at > started - 1000).length >= perSecond) throw new ApiError(429, 'SOLAMI_LOCAL_RATE_LIMIT', 'Chain reads are limited to four requests per second. Try again shortly.', 1);
    if (active >= concurrentLimit) throw new ApiError(429, 'SOLAMI_BUSY', 'Two chain evidence reads are already running. Try again shortly.', 1);
    attempts.push(started); active++;
    const id = ++sequence;
    const controller = new AbortController();
    let timer;
    try {
      const operation = (async () => {
        const url = new URL('/sol', SOLAMI_ORIGIN); url.searchParams.set('api_key', key);
        const response = await fetchImpl(url.href, { method: 'POST', redirect: 'manual',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), signal: controller.signal });
        if (controller.signal.aborted) { await response.body?.cancel().catch(() => {}); throw new ApiError(504, 'SOLAMI_TIMEOUT', 'Solami did not finish within the evidence timeout.'); }
        if (response.status !== 200) {
          await response.body?.cancel().catch(() => {});
          if (response.status >= 300 && response.status < 400) throw new ApiError(502, 'SOLAMI_REDIRECT', 'Solami redirected this request. No redirect was followed.');
          if (response.status === 429) {
            const seconds = retrySeconds(response.headers.get('retry-after'), now());
            cooldownUntil = Math.max(cooldownUntil, now() + seconds * 1000);
            throw new ApiError(429, 'SOLAMI_RATE_LIMIT', 'Solami rate limited this evidence read.', seconds);
          }
          if ([401, 403].includes(response.status)) throw new ApiError(502, 'SOLAMI_AUTH', 'Solami did not authorize this server RPC key. Check its access privately.');
          if (response.status === 402) throw new ApiError(503, 'SOLAMI_ACCESS_LIMIT', 'Solami access is unavailable on the configured allowance. No plan or charge was activated.');
          throw new ApiError(502, 'SOLAMI_UNAVAILABLE', 'Solami could not return live chain evidence. Try again later.');
        }
        const body = await boundedJson(response);
        if (!isObject(body) || body.jsonrpc !== '2.0' || body.id !== id) throw invalid();
        if (JSON.stringify(body).includes(key)) throw invalid();
        if (body.error) {
          if (body.error.code === -32016) throw new ApiError(429, 'SOLAMI_SLOT_NOT_READY', 'Solami has not reached the requested snapshot slot. Retry shortly; no older evidence was substituted.', 1);
          throw new ApiError(502, 'SOLAMI_RPC_ERROR', 'Solami could not complete this read-only RPC method. No new snapshot was created.');
        }
        const result = normalizeResult(method, body.result, params);
        return { result, provenance: { provider: 'Solami', mode: 'live', network: 'mainnet-beta',
          genesisHash: MAINNET_GENESIS_HASH, fetchedAt: new Date(now()).toISOString(),
          slot: method === 'getSlot' ? result : result?.context?.slot ?? null,
          commitment: method === 'getGenesisHash' || method === 'getBlockTime' ? null : 'confirmed',
          method, endpoint: `${SOLAMI_ORIGIN}/sol`, cached: false } };
      })();
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => {
        controller.abort(); reject(new ApiError(504, 'SOLAMI_TIMEOUT', 'Solami did not finish within the evidence timeout.'));
      }, timeoutMs); });
      return await Promise.race([operation, timeout]);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(502, 'SOLAMI_UNAVAILABLE', 'Solami could not return live chain evidence. Try again later.');
    } finally { clearTimeout(timer); active--; }
  }

  async function ensureMainnet() {
    if (genesis && now() - Date.parse(genesis.provenance.fetchedAt) < 600000) {
      const value = clone(genesis); value.provenance.cached = true; return value;
    }
    if (!genesisFlight) genesisFlight = live('getGenesisHash', []).then(value => { genesis = value; return value; });
    try { return clone(await genesisFlight); } finally { genesisFlight = null; }
  }

  return Object.freeze({
    mode: 'live', provider: 'Solami',
    async rpc(method, params = [], { refresh = false } = {}) {
      const validated = validateSolamiRequest(method, params);
      const network = await ensureMainnet();
      if (method === 'getGenesisHash') return network;
      const name = JSON.stringify([method, validated]);
      const hit = cache.get(name);
      if (!refresh && hit && now() - hit.storedAt < cacheMs) {
        const value = clone(hit.value); value.provenance.cached = true; return value;
      }
      if (inFlight.has(name)) return clone(await inFlight.get(name));
      const work = live(method, validated).then(value => {
        cache.delete(name);
        if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
        cache.set(name, { storedAt: now(), value: clone(value) });
        return value;
      });
      inFlight.set(name, work);
      try { return clone(await work); } finally { inFlight.delete(name); }
    }
  });
}

export async function readSolamiKey(env = process.env) {
  let key = env.SOLAMI_API_KEY;
  if (!key && env.SOLAMI_KEY_FILE) {
    try {
      const bytes = await readFile(env.SOLAMI_KEY_FILE);
      if (bytes.byteLength > 8192) throw new Error('oversize');
      const source = bytes.toString('utf8').trim();
      if (source.startsWith('{')) {
        const value = JSON.parse(source); key = value.api_key ?? value.apiKey ?? value.key;
      } else key = source;
    } catch { throw new ApiError(503, 'SOLAMI_KEY_INVALID', 'The server could not read its private Solami key configuration.'); }
  }
  if (!key) return null;
  if (typeof key !== 'string' || !/^[A-Za-z0-9._~-]{8,512}$/.test(key))
    throw new ApiError(503, 'SOLAMI_KEY_INVALID', 'The configured Solami RPC key has an unsupported format.');
  return key;
}

export async function solamiFromEnvironment(env = process.env, options = {}) {
  return createSolamiService({ ...options, key: await readSolamiKey(env) });
}

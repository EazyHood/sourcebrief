import { isMarketId, isTimestamp, validateBrief, validateCatalog } from './evidence.mjs';

const API_ORIGIN = 'https://sourcebrief.invalid';
const MAX_BYTES = 512 * 1024;
const hashPattern = /^[a-f0-9]{64}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, names) => object(value) && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const result = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});
const error = (status, code, message) => result(status, { error: { code, message } });

function validManifest(value) {
  return keys(value, ['version', 'provider', 'mode', 'generatedAt', 'sourceRecording', 'catalog', 'briefs', 'recordCount', 'capturedAt'])
    && value.version === 1 && value.mode === 'recorded' && value.provider === 'Panta' && isTimestamp(value.generatedAt)
    && keys(value.sourceRecording, ['file', 'sha256']) && value.sourceRecording.file === 'panta-recording-2026-10-02.json' && hashPattern.test(value.sourceRecording.sha256)
    && keys(value.catalog, ['path', 'sha256']) && value.catalog.path === 'data/catalog.json' && hashPattern.test(value.catalog.sha256)
    && object(value.briefs) && Object.keys(value.briefs).length > 0 && Object.keys(value.briefs).length <= 20
    && value.recordCount === Object.keys(value.briefs).length
    && Array.isArray(value.capturedAt) && value.capturedAt.length > 0 && value.capturedAt.length <= 21 && value.capturedAt.every(isTimestamp)
    && Object.entries(value.briefs).every(([id, entry]) => isMarketId(id) && keys(entry, ['path', 'sha256'])
      && entry.path === `data/briefs/${id}.json` && hashPattern.test(entry.sha256));
}

async function readJson(response, limit) {
  if (response.status !== 200 || (Number(response.headers.get('content-length')) || 0) > limit) throw Error('Invalid public asset');
  const reader = response.body?.getReader();
  if (!reader) throw Error('Missing public asset');
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw Error('Oversized public asset');
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), bytes };
  } catch (caught) { await reader.cancel().catch(() => {}); throw caught; }
  finally { reader.releaseLock(); }
}

async function verifyDigest(bytes, expected, cryptoImpl) {
  if (!cryptoImpl?.subtle) throw Error('Secure asset verification unavailable');
  const digest = await cryptoImpl.subtle.digest('SHA-256', bytes);
  const actual = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  if (actual !== expected) throw Error('Public asset checksum mismatch');
}

/** This adapter reads only the public capture; it has no Panta transport or credential path. */
export function createRecordedFetch({ baseURL, fetchImpl = globalThis.fetch, cryptoImpl = globalThis.crypto } = {}) {
  const base = new URL(baseURL ?? './', import.meta.url);
  if (!['http:', 'https:'].includes(base.protocol) || !base.pathname.endsWith('/') || base.username || base.password || base.search || base.hash)
    throw new TypeError('A public HTTP(S) directory URL is required.');
  let manifestPromise;
  const asset = async (relative, signal, max = MAX_BYTES) => {
    const url = new URL(relative, base);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) throw Error('Asset outside demo directory');
    return readJson(await fetchImpl(url.href, { method: 'GET', headers: { Accept: 'application/json' },
      credentials: 'omit', redirect: 'error', signal }), max);
  };
  const manifest = signal => {
    if (!manifestPromise) manifestPromise = asset('manifest.json', signal, 65536).then(({ value }) => {
      if (!validManifest(value)) throw Error('Invalid recorded manifest');
      return value;
    }).catch(caught => { manifestPromise = null; throw caught; });
    return manifestPromise;
  };

  return async function recordedFetch(input, options = {}) {
    if ((options.method ?? 'GET') !== 'GET' || options.body != null)
      return error(405, 'METHOD_NOT_ALLOWED', 'This recorded demo supports GET only.');
    if (typeof input !== 'string' || !input.startsWith('/api/') || input.length > 2048 || /[\\#\u0000-\u001f\u007f]/.test(input))
      return error(400, 'INVALID_REQUEST', 'Only supported local evidence routes are available.');
    const url = new URL(input, API_ORIGIN);
    const catalog = url.pathname === '/api/catalog';
    const match = /^\/api\/brief\/([1-9A-HJ-NP-Za-km-z]+)$/.exec(url.pathname);
    if (!catalog && (!match || !isMarketId(match[1]))) return error(404, 'NOT_FOUND', 'This evidence route is not available.');
    const allowed = catalog ? ['limit', 'cursor'] : ['refresh'];
    for (const key of url.searchParams.keys()) {
      if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1)
        return error(400, 'INVALID_QUERY', 'Unsupported or repeated evidence parameter.');
    }
    const limit = url.searchParams.get('limit') ?? '20';
    if (catalog && !/^(?:[1-9]|1[0-9]|20)$/.test(limit)) return error(400, 'INVALID_LIMIT', 'Limit must be an integer from 1 to 20.');
    const cursor = url.searchParams.get('cursor');
    if (catalog && cursor !== null && (cursor.length > 512 || /[\u0000-\u001f\u007f]/.test(cursor)))
      return error(400, 'INVALID_CURSOR', 'Unsupported recorded page cursor.');
    if (catalog && cursor) return error(404, 'RECORDING_NOT_AVAILABLE', 'This public demo includes one captured page only. Further pages require the live server; no extra records have been invented.');
    if (!catalog && url.searchParams.has('refresh') && url.searchParams.get('refresh') !== '1')
      return error(400, 'INVALID_REFRESH', 'Refresh must be 1 when supplied.');
    try {
      const capture = await manifest(options.signal);
      const entry = catalog ? capture.catalog : capture.briefs[match[1]];
      if (!entry) return error(404, 'RECORDING_NOT_AVAILABLE', 'This market was not included in the public capture. The demo never invents missing evidence.');
      const { value, bytes } = await asset(entry.path, options.signal);
      await verifyDigest(bytes, entry.sha256, cryptoImpl);
      if (!(catalog ? validateCatalog(value) : validateBrief(value)) || value.provenance.mode !== 'recorded'
          || (!catalog && value.id !== match[1])) throw Error('Invalid recorded evidence');
      const endpoint = new URL(value.provenance.endpoint);
      if (endpoint.origin !== 'https://live-api.panta.market' || endpoint.username || endpoint.password
          || !endpoint.pathname.startsWith('/api/v1/markets/') || !capture.capturedAt.includes(value.provenance.fetchedAt))
        throw Error('Invalid capture provenance');
      if (catalog && value.items.length > Number(limit))
        return error(409, 'RECORDING_PAGE_LIMIT', 'Use a limit large enough for the complete captured page. A smaller slice would skip records under its original cursor.');
      return result(200, value);
    } catch (caught) {
      if (caught?.name === 'AbortError' || caught?.name === 'TimeoutError') throw caught;
      return error(503, 'RECORDED_DEMO_UNAVAILABLE', 'The recorded evidence could not be loaded or verified. Reload this page; this demo does not switch to live data.');
    }
  };
}

let browserAdapter;
export function fetchRecorded(input, options) {
  browserAdapter ??= createRecordedFetch({ baseURL: new URL('./', import.meta.url) });
  return browserAdapter(input, options);
}

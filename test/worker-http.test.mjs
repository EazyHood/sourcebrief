import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourcebriefWorker } from '../worker.mjs';
import { ApiError } from '../src/errors.mjs';

const origin = 'https://sourcebrief.test';
const market = 'DW1G3gChuFpMJDCURtkQ6K6Ye2ihyv3Vsob1QE8Tivq7';
const pool = '7chtSL1MVDZ3kMShbnWH8htZE5gayon4t4NMF21cKyqn';
const req = (path, init) => new Request(origin + path, init);
const rawMarket = () => ({ marketId: market, title: 'Offline worker test', yesPrice: '0.5', noPrice: '0.5' });
function fixtures() {
  const calls = [];
  const provenance = () => ({ mode: 'live', fetchedAt: '2026-10-09T22:00:00.000Z', cached: false, slot: 1234 });
  return { calls, factory: () => ({ panta: {
    async catalog(options) { calls.push(['catalog', options]); return { items: [], provenance: provenance() }; },
    async brief(id, options) { calls.push(['market', id, options]); return { id, provenance: provenance() }; }
  }, dbc: {
    async brief(id, options) { calls.push(['launch', id, options]); return { pool: { id }, quote: { inputAmount: options.quoteAmount }, provenance: provenance() }; }
  } }) };
}

test('Worker routes approved GET calls with exact, validated options and security headers', async () => {
  const { calls, factory } = fixtures();
  const app = createSourcebriefWorker({ serviceFactory: factory });
  const catalog = await app.fetch(req('/api/catalog?limit=5&cursor=opaque%2Bcursor'));
  assert.equal(catalog.status, 200);
  assert.deepEqual(calls[0], ['catalog', { limit: 5, cursor: 'opaque+cursor' }]);
  assert.equal(catalog.headers.get('cache-control'), 'no-store');
  assert.match(catalog.headers.get('content-security-policy'), /connect-src 'self'/);
  assert.equal(catalog.headers.get('access-control-allow-origin'), null);
  assert.equal(catalog.headers.get('cross-origin-resource-policy'), 'same-origin');
  await app.fetch(req(`/api/brief/${market}?refresh=1`));
  assert.deepEqual(calls[1], ['market', market, { refresh: true }]);
  const launch = await app.fetch(req(`/api/launch/${pool}?quoteAmount=0.123456789&refresh=1`));
  assert.equal(launch.status, 200);
  assert.deepEqual(calls[2], ['launch', pool, { refresh: true, quoteAmount: '0.123456789' }]);
  const examples = await app.fetch(req('/api/launch/examples'));
  const value = await examples.json();
  assert.equal(value.items.length, 3); assert.equal(value.items[0].id, pool);
  assert.equal(calls.length, 3, 'examples never contact a provider');
});

test('Worker rejects unsafe methods, request bodies, origins, paths and unrecognized queries before services', async () => {
  const { calls, factory } = fixtures();
  let assets = 0;
  const app = createSourcebriefWorker({ serviceFactory: factory });
  const env = { ASSETS: { fetch: async () => { assets++; return new Response('public'); } } };
  for (const method of ['POST', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']) {
    const response = await app.fetch(req('/api/launch/examples', { method }), env);
    assert.equal(response.status, 405); assert.equal(response.headers.get('allow'), 'GET');
  }
  const body = await app.fetch({ method: 'GET', url: origin + '/', headers: new Headers(), body: new ReadableStream({ start(controller) { controller.close(); } }) }, env);
  assert.equal(body.status, 400);
  for (const headers of [{ 'content-length': '1' }, { 'transfer-encoding': 'chunked' }])
    assert.equal((await app.fetch(req('/', { headers }), env)).status, 400);
  for (const headers of [{ origin: 'https://evil.test' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }])
    assert.equal((await app.fetch(req('/api/launch/examples', { headers }), env)).status, 403);
  const badPaths = ['/api/catalog?limit=0', '/api/catalog?limit=21', '/api/catalog?limit=5&limit=6',
    '/api/catalog?endpoint=https://evil.test', '/api/catalog?cursor=%00', `/api/brief/${market}?refresh=2`,
    '/api/brief/invalid', `/api/launch/${pool}?quoteAmount=1e2`, `/api/launch/${pool}?quoteAmount=0.000`,
    `/api/launch/${pool}?quoteAmount=1&quoteAmount=2`, `/api/launch/${pool}?slippage=1`,
    '/api/launch/examples?refresh=1', '/%5c..%5csecret.json', '/%252e%252e/secret.json', '/.dev.vars',
    '/api/%62rief/' + market, '/?q=' + 'x'.repeat(201), '/?category=' + 'x'.repeat(81), '/?q=a&q=b', '/?q=%01'];
  for (const path of badPaths) assert.equal((await app.fetch(req(path), env)).status, 400, path);
  assert.equal((await app.fetch(req('/api/rpc?method=sendTransaction'), env)).status, 404);
  assert.equal((await app.fetch(req('/api'), env)).status, 404);
  assert.equal(calls.length, 0); assert.equal(assets, 0);
});

test('Static assets stream through the binding; external document navigation works without opening API CORS', async () => {
  let seen;
  const app = createSourcebriefWorker();
  const env = { ASSETS: { fetch: async request => {
    seen = request.url;
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('<h1>Sourcebrief</h1>')); controller.close(); } }), {
      headers: { 'content-type': 'text/html', 'access-control-allow-origin': '*', 'set-cookie': 'unneeded=x', 'cache-control': 'public' }
    });
  } } };
  const response = await app.fetch(req('/launch.html', { headers: {
    'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document'
  } }), env);
  assert.equal(response.status, 200); assert.equal(seen, origin + '/launch.html');
  assert.equal(await response.text(), '<h1>Sourcebrief</h1>');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal((await app.fetch(req('/launch.mjs', { headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'script' } }), env)).status, 403);
  assert.equal((await app.fetch(req('/'))).status, 503);
});

test('Successful completed JSON is cached without altering capture time; failed refresh stays an error', async () => {
  let clock = Date.parse('2026-10-09T22:00:00Z'), reads = 0;
  const app = createSourcebriefWorker({ now: () => clock, serviceFactory: () => ({ dbc: { brief: async () => {
    reads++;
    if (reads === 2) throw new ApiError(502, 'SOLAMI_UNAVAILABLE', 'No current evidence.');
    return { pool: { id: pool }, provenance: { fetchedAt: new Date(clock).toISOString(), slot: 1234 + reads, cached: false } };
  } } }) });
  const first = await (await app.fetch(req(`/api/launch/${pool}`))).json();
  first.pool.id = 'client-mutated'; clock += 1000;
  const cached = await (await app.fetch(req(`/api/launch/${pool}`))).json();
  assert.equal(cached.pool.id, pool); assert.equal(cached.provenance.cached, true);
  assert.equal(cached.provenance.fetchedAt, '2026-10-09T22:00:00.000Z'); assert.equal(reads, 1);
  assert.equal((await app.fetch(req(`/api/launch/${pool}?refresh=1`))).status, 502);
  assert.equal((await (await app.fetch(req(`/api/launch/${pool}`))).json()).provenance.fetchedAt, cached.provenance.fetchedAt);
  clock += 5000;
  const fresh = await (await app.fetch(req(`/api/launch/${pool}`))).json();
  assert.equal(fresh.provenance.cached, false); assert.equal(reads, 3);
});

test('Distinct in-flight Worker requests do not reuse request-scoped services or network promises', async () => {
  let created = 0;
  const resolve = [];
  const app = createSourcebriefWorker({ serviceFactory: () => {
    const instance = ++created;
    return { panta: { brief: () => new Promise(done => resolve.push(() => done({ instance, provenance: { cached: false } }))) } };
  } });
  const a = app.fetch(req(`/api/brief/${market}`)), b = app.fetch(req(`/api/brief/${market}`));
  assert.equal(created, 2); resolve.forEach(done => done());
  const first = await (await a).json(), second = await (await b).json();
  assert.equal(first.instance, 1); assert.equal(second.instance, 2);
});

test('Panta live failure is explicit; recorded mode is opt-in and cannot replace a live error', async () => {
  let networkCalls = 0;
  const app = createSourcebriefWorker({ fetchImpl: async () => { networkCalls++; return new Response('private upstream body', { status: 500 }); } });
  const missing = await app.fetch(req('/api/catalog'));
  assert.equal(missing.status, 503); assert.equal((await missing.json()).error.code, 'SETUP_REQUIRED');
  const recorded = await app.fetch(req('/api/catalog'), { PANTA_MODE: 'recorded', SOLAMI_API_KEY: 'invalid-unrelated-key!' });
  assert.equal(recorded.status, 200); assert.equal((await recorded.json()).provenance.mode, 'recorded');
  const failure = await app.fetch(req('/api/catalog'), { PANTA_API_KEY: 'offline-worker-key' });
  assert.equal(failure.status, 502); assert.equal((await failure.json()).error.code, 'UPSTREAM_UNAVAILABLE');
  assert.equal(networkCalls, 1);
  const absentSolami = await app.fetch(req(`/api/launch/${pool}`), { PANTA_MODE: 'invalid-unrelated-mode' });
  assert.equal(absentSolami.status, 503); assert.equal((await absentSolami.json()).error.code, 'SOLAMI_SETUP_REQUIRED');
});

test('Per-isolate read budget applies across fresh services and refresh requests; no key reaches JSON', async () => {
  let calls = 0;
  const key = 'offline-worker-private-key';
  const app = createSourcebriefWorker({ pantaBudget: 1, fetchImpl: async (url, options) => {
    calls++; assert.equal(options.headers['X-Api-Key'], key);
    return new Response(JSON.stringify(rawMarket()));
  } });
  const first = await app.fetch(req(`/api/brief/${market}`), { PANTA_API_KEY: key });
  assert.equal(first.status, 200); assert.equal((await first.text()).includes(key), false);
  const cached = await app.fetch(req(`/api/brief/${market}`), { PANTA_API_KEY: key });
  assert.equal(cached.status, 200); assert.equal(calls, 1);
  const refused = await app.fetch(req(`/api/brief/${market}?refresh=1`), { PANTA_API_KEY: key });
  assert.equal(refused.status, 429); assert.ok(Number(refused.headers.get('retry-after')) > 0);
  assert.equal((await refused.json()).error.code, 'WORKER_UPSTREAM_BUDGET'); assert.equal(calls, 1);
  const noKey = await app.fetch(req(`/api/brief/${market}`));
  assert.equal(noKey.status, 503, 'removing the key does not serve a previous live cache hit');
});

test('Safe API errors preserve retry guidance and unknown exceptions never disclose local details', async () => {
  let safe = false;
  const app = createSourcebriefWorker({ serviceFactory: () => ({ panta: { catalog: async () => {
    if (safe) throw new ApiError(429, 'SOLAMI_COOLDOWN', 'Wait for the provider.', 10);
    throw new Error('PRIVATE_KEY_SHOULD_NEVER_BE_RETURNED');
  } } }) });
  const unknown = await app.fetch(req('/api/catalog'));
  assert.equal(unknown.status, 500); assert.equal((await unknown.text()).includes('PRIVATE_KEY'), false);
  safe = true;
  const response = await app.fetch(req('/api/catalog'));
  assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '10');
  assert.equal((await response.json()).error.retryAfterSeconds, 10);
});

test('Provider Retry-After pauses later Worker requests without fetching until the numeric cooldown expires', async () => {
  let clock = Date.parse('2026-10-09T23:00:00Z'), calls = 0;
  const app = createSourcebriefWorker({ now: () => clock, fetchImpl: async () => {
    calls++;
    if (calls === 1) return new Response('private upstream error', { status: 429,
      headers: { 'retry-after': new Date(clock + 15000).toUTCString() } });
    return new Response(JSON.stringify(rawMarket()));
  } });
  const env = { PANTA_API_KEY: 'offline-worker-key' };
  const first = await app.fetch(req(`/api/brief/${market}?refresh=1`), env);
  assert.equal(first.status, 429); assert.equal(first.headers.get('retry-after'), '15');
  clock += 1000;
  const paused = await app.fetch(req(`/api/brief/${market}?refresh=1`), env);
  assert.equal(paused.status, 429); assert.equal(paused.headers.get('retry-after'), '14');
  assert.equal((await paused.json()).error.code, 'WORKER_UPSTREAM_COOLDOWN');
  assert.equal(calls, 1, 'new request-scoped services cannot bypass provider cooldown');
  clock += 14000;
  assert.equal((await app.fetch(req(`/api/brief/${market}?refresh=1`), env)).status, 200);
  assert.equal(calls, 2);
});

test('Concurrent rate-limit replies retain the longest provider pause across Worker invocations', async () => {
  let clock = Date.parse('2026-10-09T23:00:00Z'), calls = 0;
  const releases = [];
  const app = createSourcebriefWorker({ now: () => clock, fetchImpl: async () => {
    calls++;
    return new Promise(resolve => releases.push(seconds => resolve(new Response(null, {
      status: 429, headers: { 'retry-after': String(seconds) }
    }))));
  } });
  const env = { PANTA_API_KEY: 'offline-worker-key' };
  const first = app.fetch(req(`/api/brief/${market}?refresh=1`), env);
  const second = app.fetch(req(`/api/brief/${market}?refresh=1`), env);
  assert.equal(releases.length, 2);
  releases[0](60); await first;
  releases[1](10); await second;
  clock += 11000;
  const paused = await app.fetch(req(`/api/brief/${market}?refresh=1`), env);
  assert.equal(paused.status, 429); assert.equal(paused.headers.get('retry-after'), '49');
  assert.equal((await paused.json()).error.code, 'WORKER_UPSTREAM_COOLDOWN');
  assert.equal(calls, 2, 'short later reply cannot shorten a longer pause');
});

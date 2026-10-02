import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPantaService, readApiKey, serviceFromEnvironment, retryAfterSeconds, ORIGIN } from '../src/panta.mjs';

const id = 'DW1G3gChuFpMJDCURtkQ6K6Ye2ihyv3Vsob1QE8Tivq7';
const id2 = '4J6WxFGuCw9deMJ6pQ7gwpVXCvLorMrz28icSnCYWeGB';
const id3 = 'pqZAm6T9jhaLuQWXhAJ373eTar6RfVsTT1oq1J5sARM';
const key = 'offline-fake-test-key';
const market = (marketId = id) => ({ marketId, title: 'Provider example', yesPrice: '0', noPrice: '1',
  resolutionRule: 'A precise rule', sources: ['example'], volumeUsdc: '0', totalVolumeUsdc: '5' });
const response = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'x-request-id': 'offline-request' } });
const expectCode = (promise, code, status) => assert.rejects(promise, error => error.code === code && (status === undefined || error.status === status));
function recording() {
  const completedAt = '2026-10-02T13:37:36.033493+00:00';
  return { origin: ORIGIN, requests: [
    { method: 'GET', path: '/api/v1/markets/?limit=5', status: 200, completedAt, headers: { 'x-request-id': 'captured-list' },
      body: { items: [market(id), market(id2)], nextCursor: 'opaque-token' } },
    { method: 'GET', path: `/api/v1/markets/${id}/`, status: 200, completedAt, headers: { 'x-request-id': 'captured-detail' }, body: market() }
  ] };
}

test('fixed production GETs with bounded cursor; invalid requests make no upstream calls', async () => {
  const calls = [];
  const service = createPantaService({ key, fetchImpl: async (url, options) => { calls.push({ url, options }); return response({ items: [], nextCursor: null }); } });
  await service.catalog({ limit: 5, cursor: 'https://evil.test/?x=y&limit=999' });
  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(url.origin, ORIGIN);
  assert.equal(url.searchParams.get('limit'), '5');
  assert.equal(url.searchParams.get('cursor'), 'https://evil.test/?x=y&limit=999');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.redirect, 'manual');
  assert.equal(calls[0].options.headers['X-Api-Key'], key);
  await expectCode(service.brief('../credential'), 'INVALID_MARKET_ID', 400);
  await expectCode(service.catalog({ limit: 21 }), 'INVALID_LIMIT');
  await expectCode(service.catalog({ cursor: '\n' }), 'INVALID_CURSOR');
  assert.equal(calls.length, 1);
});
test('no configured key gives actionable 503 without a fetch', async () => {
  const service = createPantaService({ fetchImpl: () => { throw new Error('must not run'); } });
  await expectCode(service.catalog(), 'SETUP_REQUIRED', 503);
});
test('cache preserves original timestamp, clones values, and refresh uses budget', async () => {
  let clock = Date.parse('2026-10-02T00:00:00Z'), calls = 0;
  const service = createPantaService({ key, now: () => clock, budget: 2, fetchImpl: async () => { calls++; return response(market()); } });
  const first = await service.brief(id);
  first.rule.text = 'local mutation';
  clock += 5000;
  const cached = await service.brief(id);
  assert.equal(cached.rule.text, 'A precise rule');
  assert.equal(cached.provenance.fetchedAt, '2026-10-02T00:00:00.000Z');
  assert.equal(cached.provenance.cached, true);
  assert.equal(calls, 1);
  const refreshed = await service.brief(id, { refresh: true });
  assert.equal(refreshed.provenance.fetchedAt, '2026-10-02T00:00:05.000Z');
  assert.equal(refreshed.provenance.cached, false);
  await expectCode(service.brief(id, { refresh: true }), 'REQUEST_BUDGET_EXHAUSTED', 429);
  assert.equal(calls, 2);
  clock += 3600000;
  await service.brief(id, { refresh: true });
  assert.equal(calls, 3);
});
test('failed refresh is an error and never rewrites the old capture time', async () => {
  let clock = Date.parse('2026-10-02T00:00:00Z'), calls = 0;
  const service = createPantaService({ key, now: () => clock, fetchImpl: async () => ++calls === 1 ? response(market()) : new Response('private upstream body', { status: 500 }) });
  const first = await service.brief(id);
  clock += 1000;
  await expectCode(service.brief(id, { refresh: true }), 'UPSTREAM_UNAVAILABLE');
  assert.equal((await service.brief(id)).provenance.fetchedAt, first.provenance.fetchedAt);
});
test('deduplicates in-flight requests and refuses a third unique upstream call', async () => {
  const pending = [];
  const service = createPantaService({ key, fetchImpl: url => new Promise(resolve => pending.push({ url, resolve })) });
  const one = service.brief(id), same = service.brief(id), two = service.brief(id2);
  assert.equal(pending.length, 2);
  await expectCode(service.brief(id3), 'REQUESTS_BUSY');
  pending[0].resolve(response(market(id))); pending[1].resolve(response(market(id2)));
  const [a, b] = await Promise.all([one, same, two]);
  assert.deepEqual(a, b); assert.notEqual(a, b);
});
test('429 cooldown is honored by refresh, Retry-After date and seconds are bounded', async () => {
  let clock = Date.parse('2026-10-02T00:00:00Z'), calls = 0;
  const service = createPantaService({ key, now: () => clock, fetchImpl: async () => {
    calls++; return calls === 1 ? new Response(null, { status: 429, headers: { 'Retry-After': '10' } }) : response(market());
  } });
  await expectCode(service.brief(id), 'UPSTREAM_RATE_LIMIT', 429);
  clock += 2000;
  await assert.rejects(service.brief(id, { refresh: true }), e => e.code === 'UPSTREAM_COOLDOWN' && e.retryAfterSeconds === 8);
  assert.equal(calls, 1);
  clock += 8000;
  await service.brief(id, { refresh: true });
  assert.equal(retryAfterSeconds('Fri, 02 Oct 2026 00:00:20 GMT', clock), 10);
  assert.equal(retryAfterSeconds('not a date'), 60);
});
test('concurrent 429 responses cannot shorten an already required pause', async () => {
  let clock = Date.parse('2026-10-02T00:00:00Z');
  const pending = [];
  const service = createPantaService({ key, now: () => clock, fetchImpl: () => new Promise(resolve => pending.push(resolve)) });
  const one = service.brief(id), two = service.brief(id2);
  const rejected = [expectCode(one, 'UPSTREAM_RATE_LIMIT'), expectCode(two, 'UPSTREAM_RATE_LIMIT')];
  pending[0](new Response(null, { status: 429, headers: { 'Retry-After': '120' } }));
  await rejected[0];
  pending[1](new Response(null, { status: 429, headers: { 'Retry-After': '1' } }));
  await rejected[1]; clock += 2000;
  await assert.rejects(service.brief(id3), e => e.code === 'UPSTREAM_COOLDOWN' && e.retryAfterSeconds === 118);
  assert.equal(pending.length, 2);
});
test('redirect, HTTP failures, malformed JSON and size limits expose no upstream body', async () => {
  const cases = [
    [() => new Response(key, { status: 302, headers: { Location: 'https://other.test' } }), 'UPSTREAM_REDIRECT'],
    [() => new Response(key, { status: 401 }), 'UPSTREAM_AUTH'],
    [() => new Response(key, { status: 404 }), 'MARKET_NOT_FOUND'],
    [() => new Response(key), 'UPSTREAM_DATA_INVALID'],
    [() => new Response('{}', { headers: { 'content-length': String(524289) } }), 'UPSTREAM_RESPONSE_TOO_LARGE'],
    [() => new Response('x'.repeat(524289)), 'UPSTREAM_RESPONSE_TOO_LARGE']
  ];
  for (const [produce, code] of cases) {
    let calls = 0;
    const service = createPantaService({ key, fetchImpl: async () => { calls++; return produce(); } });
    await assert.rejects(service.brief(id), e => e.code === code && !e.message.includes(key));
    assert.equal(calls, 1);
  }
});
test('timeout bounds both connection and streaming body; no retries', async () => {
  let calls = 0;
  const connection = createPantaService({ key, timeoutMs: 15, fetchImpl: () => { calls++; return new Promise(() => {}); } });
  await expectCode(connection.brief(id), 'UPSTREAM_TIMEOUT', 504);
  const body = createPantaService({ key, timeoutMs: 15, fetchImpl: async () => new Response(new ReadableStream({ start() {} })) });
  await expectCode(body.brief(id), 'UPSTREAM_TIMEOUT', 504);
  assert.equal(calls, 1);
});
test('test-mode fixtures and mismatched IDs never become real evidence', async () => {
  const fixtures = createPantaService({ key, fetchImpl: async () => response({ disclaimer: 'Test mode: This response uses sandbox fixtures and does not access Solana mainnet.', items: [] }) });
  await expectCode(fixtures.catalog(), 'PROVIDER_TEST_MODE', 502);
  const mismatch = createPantaService({ key, fetchImpl: async () => response(market(id2)) });
  await expectCode(mismatch.brief(id), 'UPSTREAM_DATA_INVALID');
});
test('provider key reflection is redacted even after JSON unicode escaping', async () => {
  const body = JSON.stringify({ ...market(), title: key }).replace('offline', '\\u006fffline');
  const service = createPantaService({ key, fetchImpl: async () => new Response(body, { headers: { 'x-request-id': key } }) });
  const result = await service.brief(id);
  assert.equal(JSON.stringify(result).includes(key), false);
  assert.equal(result.title, '[REDACTED]');
  assert.equal(result.provenance.requestId, '[REDACTED]');
});
test('recordings retain original provenance on refresh, never fetch, and never invent missing detail', async () => {
  const service = createPantaService({ recording: recording(), fetchImpl: () => { throw new Error('must not fetch'); } });
  const list = await service.catalog();
  assert.equal(list.items.length, 2); assert.equal(list.nextCursor, 'opaque-token');
  const first = await service.brief(id), refresh = await service.brief(id, { refresh: true });
  assert.equal(first.provenance.mode, 'recorded');
  assert.equal(first.provenance.fetchedAt, '2026-10-02T13:37:36.033Z');
  assert.equal(refresh.provenance.fetchedAt, first.provenance.fetchedAt);
  assert.equal(first.provenance.requestId, 'captured-detail');
  assert.equal(first.provenance.endpoint, `${ORIGIN}/api/v1/markets/${id}/`);
  await expectCode(service.brief(id2), 'RECORDING_NOT_AVAILABLE', 404);
  await expectCode(service.catalog({ cursor: 'opaque-token' }), 'RECORDING_NOT_AVAILABLE');
  await expectCode(service.catalog({ limit: 1 }), 'RECORDING_PAGE_LIMIT');
});
test('recordings reject other origins and cannot relabel POST captures as Panta GET evidence', () => {
  const wrong = recording(); wrong.origin = 'https://unrelated-provider.invalid';
  assert.throws(() => createPantaService({ recording: wrong }), e => e.code === 'RECORDING_INVALID');
  const post = recording(); post.requests.forEach(request => { request.method = 'POST'; });
  assert.throws(() => createPantaService({ recording: post }), e => e.code === 'RECORDING_INVALID');
});
test('server-only key file supports api_key; recording takes precedence over private key configuration', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sourcebrief-test-'));
  try {
    const file = path.join(directory, 'fake-key.json');
    await writeFile(file, JSON.stringify({ api_key: key }));
    assert.equal(await readApiKey({ PANTA_KEY_FILE: file }), key);
    await expectCode(readApiKey({ PANTA_KEY_FILE: path.join(directory, 'missing') }), 'KEY_CONFIGURATION_INVALID');
    const record = path.join(directory, 'recording.json');
    await writeFile(record, JSON.stringify(recording()));
    const service = await serviceFromEnvironment({ PANTA_KEY_FILE: 'unreadable-must-not-be-read', PANTA_RECORDING_FILE: record });
    assert.equal((await service.brief(id)).provenance.mode, 'recorded');
  } finally {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('sourcebrief-test-'));
    await rm(directory, { recursive: true, force: true });
  }
});

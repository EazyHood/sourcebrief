import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSolamiService, solamiFromEnvironment, readSolamiKey, validateSolamiRequest,
  MAINNET_GENESIS_HASH, SOLAMI_ORIGIN } from '../src/solami.mjs';
import { isSolanaId } from '../src/normalize.mjs';

// Independently captured on 2026-10-09 from the official Solana endpoint:
// POST https://api.mainnet-beta.solana.com getGenesisHash -> result below.
// Fixtures must not import their expected network identity from the implementation.
const OBSERVED_MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';

const key = 'offline-fake-solami-key';
const address = '11111111111111111111111111111111';
const address2 = 'So11111111111111111111111111111111111111112';
const rawAccount = () => ({ owner: address, executable: false, lamports: 123456,
  data: [Buffer.from('synthetic binary test fixture').toString('base64'), 'base64'], space: 29 });
const accountResult = (slot = 1234, value = rawAccount()) => ({ context: { slot, apiVersion: 'unused' }, value });
const code = (promise, expected, status) => assert.rejects(promise, error => error.code === expected
  && (status === undefined || error.status === status) && !error.message.includes(key));
const json = (id, result) => new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { headers: { 'content-type': 'application/json' } });
function mockFetch(handler) {
  return async (url, options) => {
    const request = JSON.parse(options.body);
    return request.method === 'getGenesisHash' ? json(request.id, OBSERVED_MAINNET_GENESIS) : handler(request, url, options);
  };
}

test('mainnet identity matches an independent official-RPC capture and decodes to all 32 bytes', () => {
  assert.equal(MAINNET_GENESIS_HASH, OBSERVED_MAINNET_GENESIS);
  assert.equal(isSolanaId(MAINNET_GENESIS_HASH), true);
  assert.equal(isSolanaId('5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'), false);
});

test('fixed Solami POST origin and mainnet guard; only whitelisted read methods cross the boundary', async () => {
  const calls = [];
  const service = createSolamiService({ key, fetchImpl: async (url, options) => {
    const request = JSON.parse(options.body); calls.push({ url, options, request });
    return json(request.id, request.method === 'getGenesisHash' ? OBSERVED_MAINNET_GENESIS : accountResult());
  } });
  const result = await service.rpc('getAccountInfo', [address]);
  assert.deepEqual(calls.map(call => call.request.method), ['getGenesisHash', 'getAccountInfo']);
  assert.equal(new URL(calls[1].url).origin, SOLAMI_ORIGIN);
  assert.equal(new URL(calls[1].url).pathname, '/sol');
  assert.equal(new URL(calls[1].url).searchParams.get('api_key'), key);
  assert.equal(calls[1].options.method, 'POST'); assert.equal(calls[1].options.redirect, 'manual');
  assert.deepEqual(calls[1].request.params, [address, { commitment: 'confirmed', encoding: 'base64' }]);
  assert.equal(result.provenance.network, 'mainnet-beta');
  assert.equal(result.provenance.genesisHash, OBSERVED_MAINNET_GENESIS);
  assert.equal(result.provenance.slot, 1234);
  assert.equal(result.provenance.endpoint, 'https://rpc.solami.dev/sol');
  assert.equal(JSON.stringify(result).includes(key), false);
  for (const method of ['sendTransaction', 'requestAirdrop', 'simulateTransaction', 'getProgramAccounts', 'https://evil.invalid'])
    await code(service.rpc(method, []), 'SOLAMI_METHOD_BLOCKED', 400);
  await code(service.rpc('getAccountInfo', ['not-a-public-key']), 'SOLAMI_INVALID_PARAMS', 400);
  await code(service.rpc('getAccountInfo', [address, { encoding: 'jsonParsed' }]), 'SOLAMI_INVALID_PARAMS');
  await code(service.rpc('getMultipleAccounts', [Array(11).fill(address)]), 'SOLAMI_INVALID_PARAMS');
  await code(service.rpc('getAccountInfo', [address, { url: 'https://evil.invalid', minContextSlot: -1 }]), 'SOLAMI_INVALID_PARAMS');
  assert.equal(calls.length, 2);
});

test('missing key and a non-mainnet provider cannot produce a live account snapshot', async () => {
  let calls = 0;
  await code(createSolamiService({ fetchImpl: () => { calls++; } }).rpc('getSlot'), 'SOLAMI_SETUP_REQUIRED', 503);
  assert.equal(calls, 0);
  const wrong = createSolamiService({ key, fetchImpl: async (_url, options) => {
    calls++; const request = JSON.parse(options.body); return json(request.id, 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1');
  } });
  await code(wrong.rpc('getAccountInfo', [address]), 'SOLAMI_NETWORK_MISMATCH', 502);
  assert.equal(calls, 1);
});

test('single-context multiple account snapshots honor minContextSlot and preserve null accounts', async () => {
  let read = 0;
  const service = createSolamiService({ key, fetchImpl: mockFetch(async request => {
    read++;
    assert.deepEqual(request.params, [[address, address2], { commitment: 'confirmed', encoding: 'base64', minContextSlot: 900 }]);
    return json(request.id, accountResult(1000, [rawAccount(), null]));
  }) });
  const result = await service.rpc('getMultipleAccounts', [[address, address2], { minContextSlot: 900 }]);
  assert.equal(result.result.context.slot, 1000); assert.equal(result.provenance.slot, 1000);
  assert.equal(result.result.value[1], null); assert.equal(read, 1);
  const stale = createSolamiService({ key, fetchImpl: mockFetch(async request => json(request.id, accountResult(899, [rawAccount()]))) });
  await code(stale.rpc('getMultipleAccounts', [[address], { minContextSlot: 900 }]), 'SOLAMI_DATA_INVALID', 502);
});

test('cache clones evidence, keeps original capture time and slot, failed refresh does not replace it', async () => {
  let clock = Date.parse('2026-10-09T22:00:00Z'), reads = 0;
  const service = createSolamiService({ key, now: () => clock, fetchImpl: mockFetch(async request => {
    reads++;
    return reads === 1 ? json(request.id, accountResult()) : new Response(key, { status: 500 });
  }) });
  const first = await service.rpc('getAccountInfo', [address]); first.result.value.owner = 'modified';
  clock += 1000;
  const cached = await service.rpc('getAccountInfo', [address]);
  assert.equal(cached.result.value.owner, address); assert.equal(cached.provenance.cached, true);
  assert.equal(cached.provenance.fetchedAt, '2026-10-09T22:00:00.000Z'); assert.equal(reads, 1);
  await code(service.rpc('getAccountInfo', [address], { refresh: true }), 'SOLAMI_UNAVAILABLE');
  assert.equal((await service.rpc('getAccountInfo', [address])).provenance.fetchedAt, cached.provenance.fetchedAt);
  assert.equal((await service.rpc('getGenesisHash')).provenance.cached, true);
});

test('concurrent identical reads and mainnet checks deduplicate; third distinct active read is refused', async () => {
  const pending = [], methods = [];
  const service = createSolamiService({ key, fetchImpl: async (_url, options) => {
    const request = JSON.parse(options.body); methods.push(request.method);
    if (request.method === 'getGenesisHash') return json(request.id, OBSERVED_MAINNET_GENESIS);
    return new Promise(resolve => pending.push({ request, resolve }));
  } });
  const a = service.rpc('getAccountInfo', [address]), b = service.rpc('getAccountInfo', [address]);
  const c = service.rpc('getAccountInfo', [address2]);
  while (pending.length < 2) await new Promise(resolve => setImmediate(resolve));
  await code(service.rpc('getSlot'), 'SOLAMI_BUSY', 429);
  for (const item of pending) item.resolve(json(item.request.id, accountResult()));
  const [one, same] = await Promise.all([a, b, c]);
  assert.deepEqual(one, same); assert.notEqual(one, same);
  assert.equal(methods.filter(method => method === 'getGenesisHash').length, 1);
  assert.equal(methods.length, 3);
});

test('hourly and per-second budgets include mainnet checks and cannot be bypassed with refresh', async () => {
  let clock = Date.parse('2026-10-09T22:00:00Z'), calls = 0;
  const fetchImpl = mockFetch(async request => { calls++; return json(request.id, 1234); });
  const limited = createSolamiService({ key, budget: 2, now: () => clock, fetchImpl });
  await limited.rpc('getSlot'); clock += 2000;
  await code(limited.rpc('getSlot', [], { refresh: true }), 'SOLAMI_BUDGET_EXHAUSTED', 429);
  assert.equal(calls, 1);
  const rate = createSolamiService({ key, perSecond: 2, now: () => clock, fetchImpl });
  await rate.rpc('getSlot');
  await code(rate.rpc('getSlot', [], { refresh: true }), 'SOLAMI_LOCAL_RATE_LIMIT', 429);
  clock += 1000; await rate.rpc('getSlot', [], { refresh: true });
});

test('provider cooldown, unsupported access and upstream errors contain no body or key', async () => {
  let clock = Date.parse('2026-10-09T22:00:00Z');
  const cases = [[302, 'SOLAMI_REDIRECT'], [401, 'SOLAMI_AUTH'], [403, 'SOLAMI_AUTH'],
    [402, 'SOLAMI_ACCESS_LIMIT'], [500, 'SOLAMI_UNAVAILABLE']];
  for (const [status, expected] of cases) {
    const service = createSolamiService({ key, fetchImpl: mockFetch(async () => new Response(key, { status })) });
    await code(service.rpc('getSlot'), expected);
  }
  const service = createSolamiService({ key, now: () => clock,
    fetchImpl: mockFetch(async () => new Response(key, { status: 429, headers: { 'retry-after': '60' } })) });
  await code(service.rpc('getSlot'), 'SOLAMI_RATE_LIMIT', 429); clock += 2000;
  await assert.rejects(service.rpc('getSlot', [], { refresh: true }), error => error.code === 'SOLAMI_COOLDOWN' && error.retryAfterSeconds === 58);
});

test('malformed, oversized, reflected-secret and mismatched RPC responses fail closed', async () => {
  const bad = [
    request => new Response(key),
    request => new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id + 1, result: 1234 })),
    request => new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: 1234, message: key })),
    request => json(request.id, { context: { slot: 1000 }, value: { ...rawAccount(), data: ['<script>', 'base64'] } }),
    request => json(request.id, { context: { slot: 1000 }, value: { ...rawAccount(), owner: 'not-solana' } }),
    request => json(request.id, { context: { slot: 1000 }, value: [] })
  ];
  for (const produce of bad) {
    const service = createSolamiService({ key, fetchImpl: mockFetch(async request => produce(request)) });
    await code(service.rpc('getAccountInfo', [address]), 'SOLAMI_DATA_INVALID', 502);
  }
  for (const body of [new Response('{}', { headers: { 'content-length': String(524289) } }), new Response('x'.repeat(524289))]) {
    await code(createSolamiService({ key, fetchImpl: mockFetch(async () => body) }).rpc('getSlot'), 'SOLAMI_RESPONSE_TOO_LARGE', 502);
  }
});

test('RPC slot-not-reached is an explicit retry, not an older snapshot or mocked result', async () => {
  const service = createSolamiService({ key, fetchImpl: mockFetch(async request => new Response(JSON.stringify({
    jsonrpc: '2.0', id: request.id, error: { code: -32016, message: key }
  }))) });
  // Any reflected secret invalidates the whole response, even on an error path.
  await code(service.rpc('getSlot'), 'SOLAMI_DATA_INVALID');
  const honest = createSolamiService({ key, fetchImpl: mockFetch(async request => new Response(JSON.stringify({
    jsonrpc: '2.0', id: request.id, error: { code: -32016, message: 'Minimum context slot not reached' }
  }))) });
  await code(honest.rpc('getSlot', [{ minContextSlot: 1234 }]), 'SOLAMI_SLOT_NOT_READY', 429);
});

test('timeout bounds connection and streaming; there are no automatic retries', async () => {
  let calls = 0;
  const hanging = createSolamiService({ key, timeoutMs: 10, fetchImpl: async () => { calls++; return new Promise(() => {}); } });
  await code(hanging.rpc('getSlot'), 'SOLAMI_TIMEOUT', 504); assert.equal(calls, 1);
  const stream = createSolamiService({ key, timeoutMs: 10, fetchImpl: mockFetch(async () => new Response(new ReadableStream({ start() {} }))) });
  await code(stream.rpc('getSlot'), 'SOLAMI_TIMEOUT', 504);
});

test('private key files and injected settings have bounded, explicit validation', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sourcebrief-solami-test-'));
  try {
    const file = path.join(directory, 'fake-key.json'); await writeFile(file, JSON.stringify({ api_key: key }));
    assert.equal(await readSolamiKey({ SOLAMI_KEY_FILE: file }), key);
    assert.equal(await readSolamiKey({ SOLAMI_API_KEY: key, SOLAMI_KEY_FILE: 'not-read' }), key);
    await code(readSolamiKey({ SOLAMI_KEY_FILE: path.join(directory, 'absent') }), 'SOLAMI_KEY_INVALID');
    await code(readSolamiKey({ SOLAMI_API_KEY: 'https://secret.invalid' }), 'SOLAMI_KEY_INVALID');
    const service = await solamiFromEnvironment({ SOLAMI_KEY_FILE: file }, { fetchImpl: mockFetch(async request => json(request.id, 42)) });
    assert.equal((await service.rpc('getSlot')).result, 42);
    assert.throws(() => createSolamiService({ perSecond: 100 }), /rate/);
    assert.throws(() => createSolamiService({ budget: 1000 }), /budget/);
    assert.throws(() => validateSolamiRequest('getMultipleAccounts', [[address], { commitment: 'processed' }]), error => error.code === 'SOLAMI_INVALID_PARAMS');
  } finally {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('sourcebrief-solami-test-'));
    await rm(directory, { recursive: true, force: true });
  }
});

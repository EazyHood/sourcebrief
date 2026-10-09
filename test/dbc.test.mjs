import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import BN from 'bn.js';
import { buildDbcBrief, createDbcService, DBC_EXAMPLES, parseTokenAmount, formatTokenAmount, decimalRatio, MAINNET_GENESIS } from '../src/dbc.mjs';

const capture = JSON.parse(await readFile(new URL('./fixtures/dbc-mainnet-2026-10-09.json', import.meta.url), 'utf8'));
const coder = new DynamicBondingCurveClient({ commitment: 'confirmed' }, 'confirmed').state.program.coder.accounts;
function bundle(index = 0) {
  const request = structuredClone(capture.requests.filter(item => item.method === 'getMultipleAccounts')[index]);
  const [poolAddress, configAddress, baseMintAddress, quoteMintAddress] = request.params[0];
  return { poolAddress, configAddress, baseMintAddress, quoteMintAddress,
    result: request.result, provenance: { ...request.provenance, mode: 'recorded' } };
}
function changeBytes(value, accountIndex, change) {
  const account = value.result.value[accountIndex];
  const bytes = Buffer.from(account.data[0], 'base64');
  change(bytes);
  account.data[0] = bytes.toString('base64');
}
async function changeDecoded(value, accountIndex, name, change) {
  const account = value.result.value[accountIndex];
  const decoded = coder.decode(name, Buffer.from(account.data[0], 'base64'));
  change(decoded);
  const bytes = await coder.encode(name, decoded);
  account.data = [bytes.toString('base64'), 'base64'];
  account.space = bytes.length;
}

test('decimal parsing preserves amounts above Number.MAX_SAFE_INTEGER and rejects silent rounding', () => {
  assert.equal(parseTokenAmount('9007199.254740993', 9), 9007199254740993n);
  assert.equal(formatTokenAmount('9007199254740993', 9), '9007199.254740993');
  assert.equal(formatTokenAmount(100n, 0), '100');
  assert.equal(formatTokenAmount(10000000000n, 9), '10');
  assert.equal(decimalRatio(1n, 3n, 6), '0.333333');
  assert.equal(decimalRatio(1n, 10n ** 24n, 24), '0.000000000000000000000001');
  for (const input of ['0', '-1', '1e3', '01', '1,000', ' 1', '1.', '.1', '1.0000000001', '18446744074'])
    assert.throws(() => parseTokenAmount(input, 9));
});

test('authentic mainnet fixture decodes DBC curve/config, exact reserves and verified pool derivation', () => {
  const brief = buildDbcBrief(bundle());
  assert.equal(brief.pool.derivedAddressVerified, true);
  assert.equal(brief.reserves.baseRaw, '809094056895877516');
  assert.equal(brief.reserves.quoteRaw, '6533410978');
  assert.equal(brief.migration.threshold, '85');
  assert.equal(brief.migration.remaining, '78.466589022');
  assert.equal(brief.migration.progressPercent, '7.6863');
  assert.equal(brief.curve.segments.length, 2);
  assert.equal(brief.fees.baseBps, '200');
  assert.equal(brief.provenance.mode, 'recorded');
  assert.equal(brief.provenance.hashes.length, 5);
  assert.equal(brief.provenance.genesisHash, '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d');
  assert.equal(brief.provenance.clockSlot, String(brief.provenance.slot));
  JSON.stringify(brief); // No BN/BigInt leaks into public JSON.
});

test('official SDK exact-in calculation reconciles input fees and outputs on the captured curve', () => {
  const { quote } = buildDbcBrief(bundle());
  assert.equal(quote.status, 'available');
  assert.equal(quote.outputRaw, '2420973106714988');
  assert.equal(quote.minimumOutputRaw, '2408868241181413');
  assert.equal(BigInt(quote.actualInputRaw) + BigInt(quote.feeRaw), BigInt(quote.inputRaw));
  assert.equal(BigInt(quote.tradingFeeRaw) + BigInt(quote.protocolFeeRaw) + BigInt(quote.referralFeeRaw), BigInt(quote.feeRaw));
  assert.equal(quote.simulation, true);
  assert.match(quote.note, /No transaction simulation, signing, broadcast or execution/);
});

test('migrated pool never treats remaining DBC state as a fresh launch or returns a DBC quote', () => {
  const brief = buildDbcBrief(bundle(1));
  assert.equal(brief.migration.status, 'Migrated');
  assert.equal(brief.migration.progressPercent, '100');
  assert.equal(brief.migration.remainingRaw, '0');
  assert.equal(brief.migration.targetVerified, false);
  assert.equal(brief.quote.status, 'unavailable');
  assert.equal(brief.quote.outputRaw, undefined);
  assert.ok(brief.findings.some(item => item.code === 'MIGRATED'));
});

test('transfer-hook pool is decoded but its external program is not silently simulated', () => {
  const brief = buildDbcBrief(bundle(2));
  assert.equal(brief.pool.accountType, 'transferHookPool');
  assert.equal(brief.quote.status, 'unavailable');
  assert.match(brief.quote.reason, /transfer-hook/);
  assert.ok(brief.pool.transferHookProgram);
  assert.ok(brief.findings.some(item => item.code === 'TRANSFER_HOOK'));
});

test('owner, discriminator, length, malformed base64 and missing accounts fail before analysis', () => {
  const mutations = [
    value => { value.result.value[0].owner = '11111111111111111111111111111111'; },
    value => { value.result.value[0].executable = true; },
    value => changeBytes(value, 0, bytes => { bytes[0] ^= 255; }),
    value => { value.result.value[0].data[0] += 'AAAA'; },
    value => { value.result.value[0].data[0] = 'a'.repeat(20000); },
    value => { value.result.value[0].data[1] = 'jsonParsed'; },
    value => { value.result.value[0].data[0] = '????'; },
    value => { value.result.value[1] = null; },
    value => { value.result.value[2].space = 83; },
    value => { value.result.value[4].owner = '11111111111111111111111111111111'; }
  ];
  for (const mutate of mutations) { const value = bundle(); mutate(value); assert.throws(() => buildDbcBrief(value)); }
});

test('mismatched mint/config references and unrelated derived addresses are rejected', () => {
  for (const field of ['configAddress', 'baseMintAddress', 'quoteMintAddress', 'poolAddress']) {
    const value = bundle(); value[field] = '11111111111111111111111111111111';
    assert.throws(() => buildDbcBrief(value));
  }
});

test('mainnet attribution, observation time and a bounded coherent context are mandatory', () => {
  const mutations = [
    value => { value.provenance.genesisHash = MAINNET_GENESIS.slice(0, -10); },
    value => { value.provenance.network = 'devnet'; },
    value => { value.provenance.mode = 'synthetic'; },
    value => { value.provenance.fetchedAt = 'unknown'; },
    value => { value.result.context.slot = 1; },
    value => { value.result.context.slot = Number.MAX_SAFE_INTEGER + 1; },
    value => { value.result.value.pop(); }
  ];
  for (const mutate of mutations) { const value = bundle(); mutate(value); assert.throws(() => buildDbcBrief(value)); }
});

test('curve completion is distinct from executed migration', async () => {
  const value = bundle();
  await changeDecoded(value, 0, 'virtualPool', decoded => { decoded.poolState.quoteReserve = new BN('85000000000'); });
  const brief = buildDbcBrief(value);
  assert.equal(brief.migration.status, 'Curve complete · migration pending');
  assert.equal(brief.migration.graduated, false);
  assert.equal(brief.quote.status, 'unavailable');
  assert.ok(brief.findings.some(item => item.code === 'MIGRATION_PENDING'));
});

test('future activation refuses quote without claiming present availability', async () => {
  const value = bundle();
  await changeDecoded(value, 0, 'virtualPool', decoded => { decoded.poolState.activationPoint = new BN('999999999'); });
  const brief = buildDbcBrief(value);
  assert.equal(brief.migration.status, 'Not active yet');
  assert.equal(brief.quote.status, 'unavailable');
  assert.equal(brief.fees.baseBps, null);
});

test('invalid curve ordering and mint/config decimal mismatch never produce an attractive quote', async () => {
  const curve = bundle();
  // Pinned SDK layout ends with twenty (u128 sqrt price, u128 liquidity) pairs.
  // Anchor's encode helper allocates 1000 bytes, smaller than this 1048-byte config.
  changeBytes(curve, 1, bytes => { const start = bytes.length - 20 * 32; bytes.copy(bytes, start + 32, start, start + 16); });
  assert.throws(() => buildDbcBrief(curve));
  const decimals = bundle(); changeBytes(decimals, 2, bytes => { bytes[44] = 6; });
  assert.throws(() => buildDbcBrief(decimals));
});

test('oversized amount has a truthful SDK abstention instead of a made-up output', () => {
  const value = bundle(); value.quoteAmount = '10000';
  const brief = buildDbcBrief(value);
  assert.equal(brief.quote.status, 'unavailable');
  assert.equal(brief.quote.outputRaw, undefined);
  assert.match(brief.quote.reason, /remaining liquidity|SDK constraint/);
});

test('service injects only three read calls with monotonic minContextSlot and final joint context', async () => {
  const records = structuredClone(capture.requests.slice(0, 3));
  const calls = [];
  const service = createDbcService({ rpc: async (method, params, options) => {
    calls.push({ method, params, options });
    const response = records.shift();
    return { result: response.result, provenance: { ...response.provenance, mode: 'recorded' } };
  } });
  const brief = await service.brief(DBC_EXAMPLES[0].id, { refresh: true });
  assert.deepEqual(calls.map(item => item.method), ['getAccountInfo', 'getAccountInfo', 'getMultipleAccounts']);
  assert.equal(calls[1].params[1].minContextSlot, capture.requests[0].result.context.slot);
  assert.equal(calls[2].params[1].minContextSlot, capture.requests[1].result.context.slot);
  assert.equal(calls[2].params[0].length, 5);
  assert.ok(calls.every(item => item.options.refresh === true));
  assert.equal(brief.provenance.slot, capture.requests[2].result.context.slot);
});

test('invalid request is rejected before RPC, and older final context is not accepted', async () => {
  let calls = 0;
  const service = createDbcService({ rpc: async () => { calls++; throw new Error('must not run'); } });
  await assert.rejects(() => service.brief('not-a-pool'));
  await assert.rejects(() => service.brief(DBC_EXAMPLES[0].id, { quoteAmount: '1e99' }));
  await assert.rejects(() => service.brief(DBC_EXAMPLES[0].id, { quoteAmount: '0.000' }));
  assert.equal(calls, 0);
  const records = structuredClone(capture.requests.slice(0, 3));
  records[2].result.context.slot = records[1].result.context.slot - 1;
  const stale = createDbcService({ rpc: async () => records.shift() });
  await assert.rejects(() => stale.brief(DBC_EXAMPLES[0].id), error => error.code === 'DBC_DATA_INVALID');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isPoolAddress, validateLaunch, amount, compareLaunches, exportLaunchMarkdown, readLaunchCheckpoint } from '../public/launch.mjs';

const POOL = '7chtSL1MVDZ3kMShbnWH8htZE5gayon4t4NMF21cKyqn';
const OTHER = '5ktYWjqP8xYTpsiATvUNgW3r62hc9Vg9uQHsjeayvDvo';
// Synthetic view-model fixture only. These values do not assert the state of the named public accounts.
function fixture() {
  return {
    version: 1, type: 'dbc-launch',
    pool: { id: POOL, baseMint: 'AtQYwjZdLHkrCkhbTmKASASFiErd9nFyzNFATY37BAGS', quoteMint: 'So11111111111111111111111111111111111111112', config: OTHER, creator: POOL },
    tokens: { base: { decimals: 9 }, quote: { decimals: 9, symbol: 'SOL' } },
    reserves: { base: '1000000.000000001', quote: '12.300000001' },
    migration: { status: 'Bonding curve', target: 'DAMM v2', graduated: false, threshold: '20', remaining: '7.699999999', progressPercent: '61.500000005' },
    fees: { mode: 'Quote token', baseBps: '100', dynamicEnabled: false, creatorSharePercent: '20' },
    curve: { currentPrice: '0.000000031415926535897932', startPrice: '0.00000001', segments: [{ price: '0.00000001', liquidityRaw: '900719925474099300000' }] },
    quote: { status: 'available', inputAmount: '0.1', outputAmount: '100.000000001', minimumOutputAmount: '99.000000001', slippageBps: '100', simulation: true },
    findings: [{ code: 'SYNTHETIC', severity: 'attention', title: 'Synthetic test only', detail: 'Not an observed mainnet result.' }],
    provenance: { provider: 'Solami', mode: 'live', network: 'mainnet-beta', fetchedAt: '2026-10-09T22:00:00.000Z', slot: 400000001, cached: false, endpoint: 'https://rpc.solami.dev/[private]' }
  };
}

test('pool input checks decoded public-key length, not just plausible characters', () => {
  assert.equal(isPoolAddress(POOL), true);
  assert.equal(isPoolAddress('11111111111111111111111111111111'), true);
  for (const input of ['SOL', '', POOL + '1', '0'.repeat(44), 'z'.repeat(44), '1'.repeat(33), '<script>']) assert.equal(isPoolAddress(input), false, input);
});

test('view-model preserves large reserves and tiny price units without floating-point rounding', () => {
  assert.equal(amount('9007199254740993.000000001'), '9,007,199,254,740,993.000000001');
  assert.equal(amount('0.000000000000000001'), '0.000000000000000001');
  assert.equal(amount('0'), '0');
  assert.equal(amount(null), 'Not supplied');
  assert.equal(amount('1e20'), 'Not supplied');
  assert.equal(amount('NaN'), 'Not supplied');
});

test('only the supported launch version and explicit mainnet capture modes are accepted', () => {
  assert.equal(validateLaunch(fixture()), true);
  for (const mutate of [
    (brief) => { brief.version = 2; },
    (brief) => { brief.type = 'prediction-market'; },
    (brief) => { brief.provenance.mode = 'demo'; },
    (brief) => { brief.provenance.network = 'devnet'; },
    (brief) => { brief.provenance.fetchedAt = 'yesterday'; },
    (brief) => { brief.provenance.slot = Number.MAX_SAFE_INTEGER + 1; },
    (brief) => { brief.pool.config = 'fake'; },
    (brief) => { brief.findings = [{ title: 'Missing detail' }]; },
    (brief) => { brief.curve.segments = [null]; },
    (brief) => { brief.reserves.quote = 'NaN'; },
    (brief) => { brief.quote.simulation = false; },
    (brief) => { brief.quote.status = 'executed'; },
    (brief) => { brief.quote.outputAmount = '-5'; }
  ]) { const brief = fixture(); mutate(brief); assert.equal(validateLaunch(brief), false); }
  const saved = fixture(); saved.provenance.mode = 'recorded'; assert.equal(validateLaunch(saved), true);
});

test('comparison identifies an economic state change but ignores capture metadata and scenario edits', () => {
  const before = fixture(); const after = structuredClone(before);
  after.provenance.fetchedAt = '2026-10-09T22:10:00.000Z'; after.provenance.slot += 2; after.provenance.cached = true;
  after.quote.inputAmount = '0.2'; after.quote.outputAmount = '199';
  assert.deepEqual(compareLaunches(before, after), []);
  after.reserves.quote = '12.300000002';
  assert.deepEqual(compareLaunches(before, after), [{ label: 'Quote reserve', path: 'reserves.quote', before: '12.300000001', after: '12.300000002' }]);
  after.pool.id = OTHER; assert.throws(() => compareLaunches(before, after), /same pool/);
});

test('curve configuration comparison is not affected by object property order', () => {
  const before = fixture(); const after = fixture();
  after.curve.segments = [{ liquidityRaw: '900719925474099300000', price: '0.00000001' }];
  assert.deepEqual(compareLaunches(before, after), []);
  after.curve.segments[0].price = '0.00000002';
  assert.equal(compareLaunches(before, after)[0].path, 'curve.segments');
});

test('checkpoint storage distinguishes corrupt records, wrong pool, denied storage and absence', () => {
  assert.equal(readLaunchCheckpoint({ getItem: () => null }, POOL).kind, 'absent');
  assert.equal(readLaunchCheckpoint({ getItem: () => '{broken' }, POOL).kind, 'invalid');
  assert.equal(readLaunchCheckpoint({ getItem: () => 'x'.repeat(1000001) }, POOL).kind, 'invalid');
  assert.equal(readLaunchCheckpoint({ getItem: () => { throw Error('Denied'); } }, POOL).kind, 'unavailable');
  assert.equal(readLaunchCheckpoint({ getItem: () => JSON.stringify(fixture()) }, OTHER).kind, 'invalid');
  const result = readLaunchCheckpoint({ getItem: (key) => { assert.equal(key, `sourcebrief:launch:v1:${POOL}`); return JSON.stringify(fixture()); } }, POOL);
  assert.equal(result.kind, 'saved'); assert.equal(result.brief.reserves.quote, '12.300000001');
});

test('recorded exports preserve original provenance and label the SDK result as an estimate', () => {
  const brief = fixture(); brief.provenance.mode = 'recorded';
  const markdown = exportLaunchMarkdown(brief);
  assert.match(markdown, /Mode: recorded/);
  assert.match(markdown, /2026-10-09T22:00:00/);
  assert.match(markdown, /not a token endorsement, forecast or execution receipt/);
  assert.match(markdown, /No transaction was created, signed or sent/);
  assert.match(markdown, /900719925474099300000/);
  assert.doesNotMatch(markdown, /Executed trade|Confirmed trade/);
});

test('provider strings cannot create active HTML, Markdown headings, links or tables in the readable export', () => {
  const brief = fixture();
  brief.findings[0].title = '<img src=x onerror=alert(1)>';
  brief.findings[0].detail = '[click](https://evil.example)\n# Forged heading\n| new | table |';
  const markdown = exportLaunchMarkdown(brief);
  assert.ok(markdown.includes('\\<img src=x onerror=alert\\(1\\)\\>'));
  assert.ok(markdown.includes('\\[click\\]\\(https://evil\\.example\\)'));
  assert.doesNotMatch(markdown, /\n# Forged heading/);
  assert.ok(markdown.includes('\\| new \\| table \\|'));
});

test('export comparison names its earlier capture and separates no tracked change from no activity', () => {
  const before = fixture(); const after = fixture(); after.provenance.fetchedAt = '2026-10-09T23:00:00Z';
  const markdown = exportLaunchMarkdown(after, before);
  assert.match(markdown, /Earlier capture: 2026-10-09T22:00:00/);
  assert.match(markdown, /No tracked facts differ. That does not imply no on-chain activity./);
});

test('actual preserved Solami cases validate, export and keep quote abstention distinct from zero output', async () => {
  const recording = JSON.parse(await readFile(new URL('../fixtures/dbc-solami-recording-2026-10-09.json', import.meta.url), 'utf8'));
  assert.equal(recording.briefs.length, 3);
  for (const brief of recording.briefs) {
    assert.equal(validateLaunch(brief), true, brief.pool.id);
    assert.equal(brief.provenance.provider, 'Solami');
    const markdown = exportLaunchMarkdown(brief);
    assert.ok(markdown.includes(brief.provenance.fetchedAt.replace(/\./g, '\\.')));
    assert.ok(markdown.includes(brief.pool.id));
    assert.ok(markdown.includes(brief.provenance.snapshotHash));
  }
  const active = recording.briefs.find((brief) => brief.pool.id === POOL);
  assert.equal(active.quote.status, 'available');
  assert.equal(active.quote.inputAmount, '0.1');
  for (const brief of recording.briefs.filter((brief) => brief !== active)) {
    assert.equal(brief.quote.status, 'unavailable');
    assert.equal(brief.quote.outputAmount, undefined);
    assert.ok(brief.quote.reason.length > 0);
    assert.ok(exportLaunchMarkdown(brief).includes(brief.quote.reason));
  }
});

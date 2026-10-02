import test from 'node:test';
import assert from 'node:assert/strict';
import { isMarketId, isTimestamp, isUnitPrice, validateBrief, validateCatalog, readCheckpoint, saveCheckpoint, compareBriefs, exportEvidence, exportMarkdown, pricePresentation, CHECKPOINT_PREFIX, MAX_CHECKPOINT_BYTES } from '../public/evidence.mjs';

const ID = '11111111111111111111111111111111';
const OTHER = 'So11111111111111111111111111111111111111112';
function sample() {
  return { version: 1, id: ID, title: 'Synthetic test market', description: 'Unit-test fixture, not market evidence.', category: 'Testing', phase: 'open',
    rule: { text: 'A test rule.', sources: ['test-source'] }, timeline: { startAt: '2026-10-01T00:00:00.000Z', endAt: '2026-10-12T00:00:00.000Z', resolutionAt: null },
    prices: { yes: '0.5', no: '0.5', source: 'test-fixture', valuationStatus: 'normalized' }, volume: { reported: '100', total: '200', currency: 'USDC' },
    checks: [{ code: 'test', status: 'present', label: 'Test fixture', detail: 'Only for testing.', field: 'rule.text' }],
    provenance: { provider: 'Panta', mode: 'recorded', fetchedAt: '2026-10-02T09:00:00.000Z', requestId: null, endpoint: 'https://live-api.panta.market/test', cached: false }, providerFields: { oracle: null, resolved: false } };
}
function store() { const values = new Map(); return { getItem: (key) => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, value) }; }

test('market identifiers decode to exactly 32 bytes', () => {
  assert.ok(isMarketId(ID)); assert.ok(isMarketId(OTHER));
  for (const bad of ['', '1111111111111111111111111111111', '111111111111111111111111111111111', '0'.repeat(44), '../../api', 'z'.repeat(44)]) assert.equal(isMarketId(bad), false, bad);
});
test('timestamps reject nonexistent dates, local-only times and overflow', () => {
  assert.ok(isTimestamp('2024-02-29T12:30:00Z')); assert.ok(isTimestamp('2026-10-02T08:30:00-05:00'));
  for (const value of ['2026-02-29T00:00:00Z', '2026-02-30T00:00:00Z', '2026-10-02T24:00:00Z', '2026-10-02', '2026-10-02T12:00:00', 0, null]) assert.equal(isTimestamp(value), false);
});
test('decimal prices preserve zero and reject exponent or out-of-range forms', () => {
  for (const value of [null, '0', '0.000', '0.000000000000000000001', '1', '1.000']) assert.ok(isUnitPrice(value));
  for (const value of [0, NaN, 'NaN', '1.01', '-0.1', '5e-1', '00.50', '.5', '', 'Infinity']) assert.equal(isUnitPrice(value), false);
});
test('complete briefs validate but missing and unexpected fields fail', () => {
  assert.ok(validateBrief(sample()));
  const missing = sample(); delete missing.rule.sources; assert.equal(validateBrief(missing), false);
  const extra = sample(); extra.apiKey = 'not-a-real-key'; assert.equal(validateBrief(extra), false);
  const undefinedField = sample(); undefinedField.timeline.resolutionAt = undefined; assert.equal(validateBrief(undefinedField), false);
});
test('untrusted stored structure cannot masquerade as provider data', () => {
  for (const mutate of [(b) => b.provenance.mode = 'verified', (b) => b.provenance.provider = 'Other', (b) => b.checks[0].status = 'safe', (b) => b.rule.sources = '<script>', (b) => b.providerFields.resolved = 'false', (b) => b.volume.currency = 'USD', (b) => b.volume.total = '1e9']) {
    const b = sample(); mutate(b); assert.equal(validateBrief(b), false);
  }
});
test('the storage byte budget bounds complete records', () => {
  const brief = sample(); brief.rule.sources = Array.from({ length: 100 }, () => 's'.repeat(4000)); brief.checks = Array.from({ length: 40 }, () => ({ code: 'x', status: 'present', label: 'x', detail: 'd'.repeat(9000), field: 'x' }));
  assert.ok(JSON.stringify(brief).length > MAX_CHECKPOINT_BYTES); assert.equal(validateBrief(brief), false);
  const multibyte = sample(); multibyte.checks = Array.from({ length: 20 }, () => ({ code: 'x', status: 'present', label: 'x', detail: '漢'.repeat(9000), field: 'x' }));
  assert.ok(JSON.stringify(multibyte).length < MAX_CHECKPOINT_BYTES); assert.equal(validateBrief(multibyte), false);
});
test('catalogue accepts untitled records and rejects invented cursor shapes', () => {
  const data = { items: [{ id: ID, title: '', category: '', phase: '', endAt: null }], nextCursor: 'opaque+value', provenance: sample().provenance };
  assert.ok(validateCatalog(data)); assert.equal(validateCatalog({ ...data, nextCursor: {} }), false);
  assert.ok(validateCatalog({ ...data, nextCursor: '' }));
  assert.equal(validateCatalog({ ...data, items: [...data.items, { ...data.items[0], id: 'not-a-market' }] }), false);
});
test('checkpoint persistence preserves capture time and survives a fresh read', () => {
  const memory = store(), brief = sample();
  assert.equal(readCheckpoint(memory, ID).kind, 'absent'); assert.equal(saveCheckpoint(memory, brief).kind, 'saved');
  assert.deepEqual(readCheckpoint(memory, ID), { kind: 'saved', brief });
});
test('corrupt, mismatched, oversized and old-version checkpoints are rejected', () => {
  const memory = store();
  for (const raw of ['{', 'null', ' '.repeat(MAX_CHECKPOINT_BYTES + 1), JSON.stringify({ ...sample(), id: OTHER }), JSON.stringify({ ...sample(), version: 2 })]) {
    memory.setItem(CHECKPOINT_PREFIX + ID, raw); assert.equal(readCheckpoint(memory, ID).kind, 'invalid');
  }
});
test('storage failure remains a recoverable unavailable state', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  assert.equal(readCheckpoint(blocked, ID).kind, 'unavailable'); assert.equal(saveCheckpoint(blocked, sample()).kind, 'unavailable');
  const memory = store(); assert.equal(saveCheckpoint(memory, { id: ID }).kind, 'invalid'); assert.equal(memory.getItem(CHECKPOINT_PREFIX + ID), null);
});
test('capture timestamps, request IDs, cache and derived checks are not data changes', () => {
  const before = sample(), after = sample(); after.provenance.fetchedAt = '2026-10-02T10:00:00.000Z'; after.provenance.requestId = 'new-request'; after.provenance.cached = true; after.checks = [];
  assert.deepEqual(compareBriefs(before, after), []);
});
test('equivalent decimals compare without float coercion or rounding', () => {
  const before = sample(), after = sample(); before.prices.yes = '0.500000'; after.prices.yes = '0.5'; before.volume.total = '200.00';
  assert.deepEqual(compareBriefs(before, after), []);
  before.prices.yes = '0.500000000000000000001'; after.prices.yes = '0.500000000000000000002';
  assert.equal(compareBriefs(before, after)[0].field, 'prices.yes');
});
test('rule, sources, dates and each volume field produce separate before/after entries', () => {
  const before = sample(), after = sample(); after.rule.text = 'Changed test rule'; after.rule.sources.push('new-source'); after.timeline.resolutionAt = '2026-10-13T00:00:00.000Z'; after.volume.reported = '0'; after.volume.total = '201';
  const changes = compareBriefs(before, after);
  assert.deepEqual(changes.map((c) => c.field), ['rule.text', 'rule.sources', 'timeline.resolutionAt', 'volume.reported', 'volume.total']);
  assert.deepEqual(changes[0], { field: 'rule.text', label: 'Resolution wording', before: 'A test rule.', after: 'Changed test rule' });
});
test('comparisons refuse different market IDs and schema versions', () => {
  assert.throws(() => compareBriefs(sample(), { ...sample(), id: OTHER }), /different market/);
  assert.throws(() => compareBriefs(sample(), { ...sample(), version: 2 }), /complete version 1/);
});
test('JSON export retains both captures, source provenance and changes', () => {
  const before = sample(), after = sample(); after.rule.text = 'Changed';
  const output = exportEvidence(after, before, '2026-10-02T11:00:00.000Z');
  assert.equal(output.brief.provenance.fetchedAt, '2026-10-02T09:00:00.000Z'); assert.equal(output.exportedAt, '2026-10-02T11:00:00.000Z');
  assert.deepEqual(output.checkpoint, before); assert.equal(output.changes[0].before, 'A test rule.');
  output.brief.rule.text = 'mutated copy'; assert.equal(after.rule.text, 'Changed');
});
test('Markdown export escapes provider markup and includes comparison evidence', () => {
  const before = sample(), after = sample(); after.rule.text = '<script>alert(1)</script>\n# heading\n[click](javascript:alert(1))'; after.rule.sources = ['<https://bad.example>'];
  const md = exportMarkdown(after, before, '2026-10-02T11:00:00.000Z');
  assert.ok(!md.includes('<script>')); assert.ok(!md.includes('[click](javascript:')); assert.ok(md.includes('&lt;script&gt;')); assert.ok(md.includes('Before: A test rule')); assert.ok(md.includes('After: &lt;script&gt;'));
  for (const expected of ['Captured at:', 'Checkpoint captured at:', 'Price source', 'Price valuation status', 'Reported volume', 'Total volume', 'identifiers, not independently verified']) assert.ok(md.includes(expected), expected);
});
test('missing information stays missing in exports and zeros stay visible', () => {
  const brief = sample(); brief.rule.text = ''; brief.rule.sources = []; brief.prices.yes = '0'; brief.prices.no = null;
  const md = exportMarkdown(brief, null, '2026-10-02T11:00:00.000Z');
  assert.ok(md.includes('YES indicative unit price:** 0')); assert.ok(md.includes('NO indicative unit price:** Not supplied')); assert.ok(md.includes('No local checkpoint supplied.'));
});
test('resolved outcome values are distinguished from indicative trading prices', () => {
  const before = sample(), after = sample(); after.prices = { yes: '0', no: '1', source: 'resolved_outcome', valuationStatus: 'complete' }; after.providerFields.resolved = true;
  assert.equal(pricePresentation(after).heading, 'Provider outcome values');
  const exported = exportEvidence(after, before, '2026-10-02T11:00:00.000Z');
  assert.ok(exported.priceInterpretation.outcome); assert.ok(exported.priceInterpretation.explanation.includes('complete'));
  assert.equal(exported.changes.find(c => c.field === 'prices.yes').label, 'YES normalized value');
  const md = exportMarkdown(after, before, '2026-10-02T11:00:00.000Z');
  assert.ok(md.includes('YES provider outcome value:** 0')); assert.ok(md.includes('NO provider outcome value:** 1'));
  assert.ok(!md.includes('YES indicative unit price')); assert.ok(md.includes('not current trading quotes'));
});

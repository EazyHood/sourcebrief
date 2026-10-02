import test from 'node:test';
import assert from 'node:assert/strict';
import { isSolanaId, normalizeDate, decimal, normalizeBrief, normalizeCatalog } from '../src/normalize.mjs';

const id = 'DW1G3gChuFpMJDCURtkQ6K6Ye2ihyv3Vsob1QE8Tivq7';
const provenance = { mode: 'live', fetchedAt: '2026-10-02T08:37:36.033493-05:00',
  requestId: 'test-id', endpoint: `https://live-api.panta.market/api/v1/markets/${id}/`, cached: false };
const market = overrides => ({ marketId: id, title: 'Does the stated event happen?', category: 'test',
  phase: 'secondary', resolutionRule: 'YES only if the final published result says YES.', sources: ['source-identifier'],
  startTime: 1790866800, endTime: 1791151200, resolutionTime: 1791151200,
  yesPrice: '0.5000', noPrice: '0.5', secondaryYesPrice: '500000000', secondaryNoPrice: '500000000',
  priceSource: 'secondary_last_trade', valuationStatus: 'indicative', volumeUsdc: '0.00', totalVolumeUsdc: '5.00',
  oracle: 'source-identifier', resolved: false, ...overrides });
const brief = overrides => normalizeBrief(market(overrides), id, provenance);

test('IDs decode to exactly 32 bytes, rather than merely looking like base58', () => {
  for (const valid of [id, 'pqZAm6T9jhaLuQWXhAJ373eTar6RfVsTT1oq1J5sARM', '1'.repeat(32)]) assert.equal(isSolanaId(valid), true);
  for (const invalid of ['1'.repeat(31), '1'.repeat(33), 'z'.repeat(44), '0'.repeat(32), 'TestMarket123456789', `${id}/../`, null])
    assert.equal(isSolanaId(invalid), false);
  assert.throws(() => normalizeBrief(market(), '1'.repeat(32), provenance), /unsupported response/);
});
test('decimal strings preserve zero and precision without scaled-price guessing', () => {
  assert.equal(decimal('000.0000', true), '0');
  assert.equal(decimal('0.123456789012345678901', true), '0.123456789012345678901');
  assert.equal(decimal('01.000', true), '1');
  for (const value of [0, 1, '1e-3', '-0.1', '+0.2', ' 0.3', '.5', '1.0001', '500000000']) assert.equal(decimal(value, true), null);
  const result = brief({ yesPrice: '0', noPrice: '1' });
  assert.deepEqual([result.prices.yes, result.prices.no], ['0', '1']);
  assert.deepEqual(result.volume, { reported: '0', total: '5', currency: 'USDC' });
  assert.equal(result.checks.filter(c => c.code === 'RAW_PRICE_SCALE').length, 2);
  assert.equal(brief({ yesPrice: null }).prices.yes, null);
});
test('price checks distinguish resolved outcomes, observed indicative trades and unknown provider semantics', () => {
  const priceChecks = result => result.checks.filter(check => ['PRICE_YES', 'PRICE_NO'].includes(check.code));
  const outcome = brief({ yesPrice: '0', noPrice: '1', priceSource: 'resolved_outcome', valuationStatus: 'complete' });
  for (const check of priceChecks(outcome)) {
    assert.match(check.label, /provider outcome value$/);
    assert.doesNotMatch(check.label, /indicative/);
    assert.match(check.detail, /not a current trading quote/);
    assert.match(check.detail, /Provider valuation status: complete\./);
    assert.equal(check.status, 'present');
  }
  for (const check of priceChecks(brief())) {
    assert.match(check.label, /indicative unit price$/);
    assert.match(check.detail, /Provider valuation status: indicative\./);
  }
  for (const overrides of [{ priceSource: 'unrecognized_source', valuationStatus: 'estimated' },
    { priceSource: 'secondary_last_trade', valuationStatus: 'unavailable' },
    { priceSource: undefined, valuationStatus: undefined }]) {
    for (const check of priceChecks(brief(overrides))) {
      assert.match(check.label, /normalized provider value$/);
      assert.match(check.detail, /no trading-quote or outcome interpretation is inferred/);
      assert.ok(check.detail.includes(`Provider valuation status: ${overrides.valuationStatus || 'not supplied'}.`));
    }
  }
});
test('timestamps require actual dates and explicit timezone; Unix epoch zero is valid', () => {
  assert.equal(normalizeDate(0), '1970-01-01T00:00:00.000Z');
  assert.equal(normalizeDate('2024-02-29T01:00:00+01:00'), '2024-02-29T00:00:00.000Z');
  assert.equal(normalizeDate('2026-10-02T08:37:36.033493-05:00'), '2026-10-02T13:37:36.033Z');
  for (const value of ['2025-02-29T01:00:00Z', '2026-13-01T00:00:00Z', '2026-01-01', '2026-01-01T00:00:00',
    '2026-01-01T24:00:00Z', '2026-01-01T00:00:00+25:00', '1790866800', Infinity, null]) assert.equal(normalizeDate(value), null);
  assert.ok(brief({ startTime: 3, endTime: 2, resolutionTime: 1 }).checks.some(c => c.code === 'CHRONOLOGY_CONFLICT'));
});
test('rule wording remains exact, source identifiers are not invented URLs, absent fields are flagged', () => {
  const wording = '<script>untrusted()</script>  YES\nonly on the stated evidence.  ';
  const result = brief({ resolutionRule: wording, sources: ['identifier-with-no-url'], title: '', priceSource: '' });
  assert.equal(result.rule.text, wording);
  assert.deepEqual(result.rule.sources, ['identifier-with-no-url']);
  assert.equal(result.checks.find(c => c.code === 'TITLE').status, 'missing');
  assert.equal(result.checks.find(c => c.code === 'PRICE_SOURCE').status, 'missing');
  assert.match(result.checks.find(c => c.code === 'SOURCES').detail, /not verified/);
});
test('fallback is only for absent rule and sources, not empty top-level values', () => {
  const chain = { resolutionRule: 'Chain rule', sources: ['chain'] };
  const absent = market({ onChain: chain }); delete absent.resolutionRule; delete absent.sources;
  assert.deepEqual(normalizeBrief(absent, id, provenance).rule, { text: 'Chain rule', sources: ['chain'] });
  const empty = brief({ resolutionRule: '', sources: [], onChain: chain });
  assert.deepEqual(empty.rule, { text: '', sources: [] });
  assert.equal(empty.checks.filter(c => c.code === 'PROVIDER_FIELD_CONFLICT').length, 2);
  assert.equal(empty.checks.find(c => c.code === 'RULE').status, 'missing');
});
test('conflicting provider copies are retained as visible attention checks', () => {
  const result = brief({ onChain: { resolutionRule: 'Different', sources: ['other'], startTime: 0, isResolved: true } });
  assert.ok(result.checks.some(c => c.code === 'PROVIDER_FIELD_CONFLICT' && c.field === 'timeline.startAt'));
  assert.ok(result.checks.some(c => c.code === 'RESOLUTION_FLAG_CONFLICT'));
  assert.equal(result.providerFields.resolved, false);
});
test('bounded provider text is never silently presented as the entire rule', () => {
  const result = brief({ resolutionRule: 'a'.repeat(16001), sources: Array(33).fill('source'), description: 'x'.repeat(12001) });
  assert.equal(result.rule.text.length, 16000);
  assert.ok(result.checks.some(c => c.code === 'TEXT_TRUNCATED' && c.field === 'rule.text' && /full wording is not represented/.test(c.detail)));
  assert.ok(result.checks.some(c => c.code === 'SOURCES_PARTIAL'));
  assert.equal(result.rule.sources.length, 32);
});
test('catalog normalizes only real rows and preserves opaque cursor and capture provenance', () => {
  const result = normalizeCatalog({ items: [market({ title: undefined })], nextCursor: 'abc/+=' }, { ...provenance, mode: 'recorded' });
  assert.equal(result.items[0].title, '');
  assert.equal(result.nextCursor, 'abc/+=');
  assert.equal(result.provenance.fetchedAt, '2026-10-02T13:37:36.033Z');
  assert.equal(result.provenance.mode, 'recorded');
  assert.throws(() => normalizeCatalog({ items: [market({ marketId: 'fake' })] }, provenance));
  assert.throws(() => normalizeCatalog({ items: [market()], nextCursor: 'x'.repeat(513) }, provenance));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizedEvidence, projectRecording } from '../scripts/project-fixture.mjs';

test('public fixture projection removes unused identities but preserves normalized output byte-for-byte', async () => {
  const fixture = JSON.parse(await readFile(new URL('../fixtures/panta-recording-2026-10-02.json', import.meta.url), 'utf8'));
  const enriched = structuredClone(fixture);
  for (const request of enriched.requests) {
    if (request.body.items) for (const item of request.body.items) {
      item.creatorAddress = 'unneeded-wallet'; item.images = ['https://example.test/did:privy:unneeded'];
    }
    if (request.body.marketId) {
      request.body.creatorTwitterHandle = '@unneeded'; request.body.creatorAddress = 'unneeded-wallet';
      request.body.images = ['https://example.test/did:privy:unneeded'];
      request.body.onChain = { ...request.body.onChain, creator: 'unneeded-wallet' };
    }
  }
  enriched.requests.push({ method: 'GET', path: '/api/v1/categories/', status: 200, body: { categories: ['unused'] } });
  const projected = projectRecording(enriched);
  assert.equal(await normalizedEvidence(enriched), await normalizedEvidence(projected));
  assert.doesNotMatch(JSON.stringify(projected), /creatorAddress|creatorTwitterHandle|did:privy:|unneeded-wallet/);
  assert.equal(projected.requests.length, 6);
  const details = projected.requests.filter(request => request.body.marketId);
  assert.equal(details.length, 5);
  assert.ok(details.some(request => request.body.secondaryYesPrice === '500000000'));
  assert.ok(details.some(request => request.body.yesPrice === '0'));
  assert.deepEqual(projectRecording(projected), projected, 'Projection is idempotent');
  for (const request of details) {
    const original = fixture.requests.find(item => item.path === request.path);
    assert.equal(request.completedAt, original.completedAt);
    assert.deepEqual(request.headers, { 'x-request-id': original.headers['x-request-id'] });
    assert.equal(request.body.resolutionRule, original.body.resolutionRule);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPantaService } from '../src/panta.mjs';
import { validateBrief, validateCatalog } from '../public/evidence.mjs';

test('the genuine captured Panta catalogue and all captured details satisfy the browser contract offline', async () => {
  const recording = JSON.parse(await readFile(new URL('../fixtures/panta-recording-2026-10-02.json', import.meta.url), 'utf8'));
  const service = createPantaService({ recording, fetchImpl: () => { throw new Error('recorded integration must not fetch'); } });
  const catalog = await service.catalog();
  assert.equal(validateCatalog(catalog), true);
  assert.equal(catalog.provenance.mode, 'recorded');
  assert.ok(catalog.items.length > 0);
  let checked = 0;
  for (const item of catalog.items) {
    const capture = recording.requests.find(request => request.path === `/api/v1/markets/${item.id}/` && request.status === 200);
    if (!capture) continue;
    const brief = await service.brief(item.id);
    assert.equal(validateBrief(brief), true, item.id);
    assert.equal(brief.provenance.fetchedAt, new Date(capture.completedAt).toISOString());
    assert.equal(brief.provenance.mode, 'recorded');
    const refreshed = await service.brief(item.id, { refresh: true });
    assert.equal(refreshed.provenance.fetchedAt, brief.provenance.fetchedAt);
    checked++;
  }
  assert.equal(checked, catalog.items.length, 'Every visible recorded catalogue item must have its real captured detail');
  const first = await service.brief(catalog.items[0].id);
  assert.equal(first.volume.reported, '0');
  assert.equal(first.volume.total, '5');
  assert.deepEqual([first.prices.yes, first.prices.no], ['0.5', '0.5']);
});

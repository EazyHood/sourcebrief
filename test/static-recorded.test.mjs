import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, rm } from 'node:fs/promises';
import { createHash, randomUUID, webcrypto } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { buildRecordedDemo } from '../scripts/build-recorded.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, 'artifacts', `static-test-${randomUUID()}`);
const baseURL = 'https://example.github.io/sourcebrief/';
const id = 'DW1G3gChuFpMJDCURtkQ6K6Ye2ihyv3Vsob1QE8Tivq7';
const keyPattern = /pk_(?:live|test)_[A-Za-z0-9_-]{12,}/;
const sha256 = value => createHash('sha256').update(value).digest('hex');

test('static recorded build and adapter preserve the contract on a GitHub Pages subpath', async t => {
  const sourceApp = await readFile(path.join(root, 'public', 'app.mjs'));
  const sourceHTML = await readFile(path.join(root, 'public', 'index.html'));
  await buildRecordedDemo({ outDir: destination, generatedAt: '2026-10-02T16:00:00.000Z' });
  const { createRecordedFetch } = await import(pathToFileURL(path.join(destination, 'recorded-fetch.mjs')).href);
  const manifest = JSON.parse(await readFile(path.join(destination, 'manifest.json'), 'utf8'));
  function transport(overrides = new Map()) {
    const calls = [];
    return { calls, fetchImpl: async (url, options) => {
      calls.push({ url, options });
      assert.ok(url.startsWith(baseURL), 'No root-relative or external request may escape the demo directory');
      assert.equal(options.method, 'GET'); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
      assert.deepEqual(options.headers, { Accept: 'application/json' });
      const relative = url.slice(baseURL.length);
      const bytes = overrides.has(relative) ? overrides.get(relative) : await readFile(path.join(destination, relative));
      return new Response(bytes, { headers: { 'Content-Type': 'application/json' } });
    } };
  }
  try {
    await t.test('build publishes only the allowlist, never raw provider fields or source credentials', async () => {
      assert.deepEqual((await readdir(destination)).sort(), ['.nojekyll', 'app.mjs', 'data', 'evidence.mjs', 'index.html', 'manifest.json', 'recorded-fetch.mjs', 'styles.css']);
      assert.equal(manifest.mode, 'recorded'); assert.equal(manifest.recordCount, 5);
      assert.equal(Object.keys(manifest.briefs).length, 5);
      for (const entry of [manifest.catalog, ...Object.values(manifest.briefs)]) {
        const bytes = await readFile(path.join(destination, entry.path));
        assert.equal(sha256(bytes), entry.sha256);
        const text = bytes.toString('utf8');
        assert.doesNotMatch(text, keyPattern);
        assert.doesNotMatch(text, /"creatorAddress"|"creatorTwitterHandle"|did:privy:/);
        assert.equal(JSON.parse(text).provenance.mode, 'recorded');
      }
      assert.deepEqual(await readFile(path.join(root, 'public', 'app.mjs')), sourceApp);
      assert.deepEqual(await readFile(path.join(root, 'public', 'index.html')), sourceHTML);
      const html = await readFile(path.join(destination, 'index.html'), 'utf8');
      assert.match(html, /Recorded demo · 5 captured markets/);
      assert.match(html, /href="\.\/styles.css"/); assert.match(html, /src="\.\/app.mjs"/);
      assert.doesNotMatch(html, /href="\/"|src="\/app/);
      assert.match(await readFile(path.join(destination, 'app.mjs'), 'utf8'), /Replay captured evidence/);
    });
    await t.test('catalogue and replay preserve real recorded timestamps and volumes', async () => {
      const fake = transport(); const fetch = createRecordedFetch({ baseURL, fetchImpl: fake.fetchImpl, cryptoImpl: webcrypto });
      const catalog = await (await fetch('/api/catalog?limit=20')).json();
      assert.equal(catalog.items.length, 5); assert.equal(catalog.provenance.mode, 'recorded');
      const first = await (await fetch(`/api/brief/${id}`)).json();
      const replay = await (await fetch(`/api/brief/${id}?refresh=1`)).json();
      assert.deepEqual(first, replay);
      assert.equal(first.volume.reported, '0'); assert.equal(first.volume.total, '5');
      assert.equal(first.provenance.fetchedAt, '2026-10-02T13:37:36.033Z');
      assert.deepEqual(fake.calls.map(call => new URL(call.url).pathname), [
        '/sourcebrief/manifest.json', '/sourcebrief/data/catalog.json', `/sourcebrief/data/briefs/${id}.json`, `/sourcebrief/data/briefs/${id}.json`
      ]);
    });
    await t.test('methods, host injection, unknown paths and unavailable pages make no asset request', async () => {
      const fake = transport(); const fetch = createRecordedFetch({ baseURL, fetchImpl: fake.fetchImpl, cryptoImpl: webcrypto });
      for (const [route, options, status] of [
        ['/api/catalog', { method: 'POST' }, 405], ['https://live-api.panta.market/api/v1/markets/', {}, 400],
        ['//other.test/api/catalog', {}, 400], ['/api/account', {}, 404], ['/api/catalog?url=https://other.test', {}, 400],
        ['/api/catalog?limit=999', {}, 400], ['/api/catalog?limit=5&limit=20', {}, 400],
        ['/api/catalog?cursor=outside-capture', {}, 404], [`/api/brief/${id}?refresh=2`, {}, 400],
        ['/api/brief/../../secret', {}, 404]
      ]) assert.equal((await fetch(route, options)).status, status, route);
      assert.equal(fake.calls.length, 0);
    });
    await t.test('unknown valid ID stays unavailable and small page limit cannot skip data', async () => {
      const fake = transport(); const fetch = createRecordedFetch({ baseURL, fetchImpl: fake.fetchImpl, cryptoImpl: webcrypto });
      const missing = await fetch('/api/brief/' + '1'.repeat(32));
      assert.equal(missing.status, 404); assert.equal((await missing.json()).error.code, 'RECORDING_NOT_AVAILABLE');
      assert.equal(fake.calls.length, 1);
      assert.equal((await fetch('/api/catalog?limit=1')).status, 409);
    });
    await t.test('foreign asset URLs, live-labelled evidence and stale asset hashes fail closed', async () => {
      const foreign = structuredClone(manifest); foreign.catalog.path = 'https://other.test/file.json';
      let fake = transport(new Map([['manifest.json', JSON.stringify(foreign)]]));
      let fetch = createRecordedFetch({ baseURL, fetchImpl: fake.fetchImpl, cryptoImpl: webcrypto });
      assert.equal((await fetch('/api/catalog')).status, 503); assert.equal(fake.calls.length, 1);
      const catalog = JSON.parse(await readFile(path.join(destination, manifest.catalog.path), 'utf8'));
      catalog.provenance.mode = 'live';
      const content = JSON.stringify(catalog); const altered = structuredClone(manifest); altered.catalog.sha256 = sha256(content);
      fake = transport(new Map([['manifest.json', JSON.stringify(altered)], ['data/catalog.json', content]]));
      fetch = createRecordedFetch({ baseURL, fetchImpl: fake.fetchImpl, cryptoImpl: webcrypto });
      assert.equal((await fetch('/api/catalog')).status, 503);
      fake = transport(new Map([['data/catalog.json', '{}']]));
      fetch = createRecordedFetch({ baseURL, fetchImpl: fake.fetchImpl, cryptoImpl: webcrypto });
      assert.equal((await fetch('/api/catalog')).status, 503);
    });
  } finally {
    assert.equal(path.dirname(destination), path.join(root, 'artifacts'));
    assert.match(path.basename(destination), /^static-test-[A-Za-z0-9-]+$/);
    await rm(destination, { recursive: true, force: true });
  }
});

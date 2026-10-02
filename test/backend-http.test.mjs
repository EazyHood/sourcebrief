import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createSourcebriefServer } from '../server.mjs';
import { createPantaService } from '../src/panta.mjs';

const id = 'DW1G3gChuFpMJDCURtkQ6K6Ye2ihyv3Vsob1QE8Tivq7';
function request(port, pathname, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method, headers }, res => {
      let body = ''; res.on('data', part => { body += part; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }); req.on('error', reject); req.end();
  });
}
test('local HTTP service enforces method, origin, path, query and safe API errors', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sourcebrief-http-'));
  const publicDir = path.join(directory, 'public'); await mkdir(publicDir);
  await writeFile(path.join(publicDir, 'index.html'), '<!doctype html><title>Sourcebrief test</title>');
  await writeFile(path.join(directory, 'secret.json'), 'PRIVATE');
  let calls = 0;
  const service = createPantaService({ key: 'offline-http-key', budget: 1, fetchImpl: async () => {
    calls++; return new Response(JSON.stringify({ marketId: id, title: 'Example', yesPrice: '0', noPrice: '1' }));
  } });
  const server = createSourcebriefServer({ service, publicDir });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const index = await request(port, '/');
    assert.equal(index.status, 200); assert.match(index.body, /Sourcebrief test/);
    assert.match(index.headers['content-security-policy'], /connect-src 'self'/);
    assert.equal((await request(port, '/?q=example&category=test')).status, 200);
    assert.equal((await request(port, '/index.html?q=example')).status, 200);
    assert.equal((await request(port, '/?q=' + 'x'.repeat(201))).status, 400);
    assert.equal((await request(port, '/?category=' + 'x'.repeat(81))).status, 400);
    assert.equal((await request(port, '/?q=one&q=two')).status, 400);
    const valid = await request(port, `/api/brief/${id}`);
    assert.equal(valid.status, 200); assert.equal(JSON.parse(valid.body).prices.yes, '0');
    assert.equal(calls, 1);
    for (const route of ['/api/catalog?limit=99', '/api/catalog?limit=5&limit=6', '/api/catalog?url=https://evil.test',
      `/api/brief/${id}?refresh=2`, '/api/brief/invalid']) assert.equal((await request(port, route)).status, 400, route);
    const post = await request(port, `/api/brief/${id}`, {}, 'POST');
    assert.equal(post.status, 405); assert.equal(post.headers.allow, 'GET');
    assert.equal((await request(port, '/', { Host: `evil.test:${port}` })).status, 403);
    assert.equal((await request(port, '/', { Origin: 'https://evil.test' })).status, 403);
    assert.equal((await request(port, '/', { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await request(port, '/%2e%2e/secret.json')).status, 400);
    assert.equal((await request(port, '/secret.json')).status, 404);
    assert.equal((await request(port, '/%5c..%5csecret.json')).status, 400);
    const exhausted = await request(port, `/api/brief/${id}?refresh=1`);
    assert.equal(exhausted.status, 429); assert.ok(Number(exhausted.headers['retry-after']) > 0);
    assert.equal(JSON.parse(exhausted.body).error.code, 'REQUEST_BUDGET_EXHAUSTED');
    assert.equal(calls, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('sourcebrief-http-'));
    await rm(directory, { recursive: true, force: true });
  }
});

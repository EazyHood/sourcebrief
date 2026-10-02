import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPantaService, ORIGIN } from '../src/panta.mjs';
import { isObject, isSolanaId, isProviderTestMode } from '../src/normalize.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = value => createHash('sha256').update(value).digest('hex');
const pick = (value, fields) => Object.fromEntries(fields.filter(field => Object.hasOwn(value, field)).map(field => [field, structuredClone(value[field])]));
const catalogFields = ['marketId', 'title', 'category', 'phase', 'endTime'];
const detailFields = ['marketId', 'title', 'description', 'category', 'phase', 'resolutionRule', 'sources',
  'startTime', 'endTime', 'resolutionTime', 'yesPrice', 'noPrice', 'priceSource', 'valuationStatus',
  'secondaryYesPrice', 'secondaryNoPrice', 'resolved', 'volumeUsdc', 'totalVolumeUsdc', 'oracle'];
const chainFields = ['resolutionRule', 'sources', 'startTime', 'endTime', 'resolutionTime', 'isResolved'];

export function projectRecording(recording) {
  if (!isObject(recording) || recording.origin !== ORIGIN || !Array.isArray(recording.requests)) throw Error('Unsupported recording.');
  const requests = [];
  for (const request of recording.requests) {
    if (!isObject(request) || request.method !== 'GET' || request.status !== 200 || !isObject(request.body)) continue;
    if (isProviderTestMode(request.body)) throw Error('Sandbox fixtures cannot become production evidence.');
    const url = new URL(request.path, ORIGIN);
    if (url.origin !== ORIGIN) throw Error('Unsupported recording origin.');
    let body;
    if (url.pathname === '/api/v1/markets/') {
      if (!Array.isArray(request.body.items)) throw Error('Invalid catalogue.');
      body = { items: request.body.items.map(item => pick(item, catalogFields)), ...pick(request.body, ['nextCursor']) };
    } else {
      const match = /^\/api\/v1\/markets\/([^/]+)\/$/.exec(url.pathname);
      if (!match || !isSolanaId(match[1])) continue;
      body = pick(request.body, detailFields);
      if (isObject(request.body.onChain)) body.onChain = pick(request.body.onChain, chainFields);
    }
    requests.push({ ...pick(request, ['method', 'path', 'status']),
      headers: pick(request.headers ?? {}, ['x-request-id']), body,
      ...pick(request, ['completedAt']) });
  }
  return { origin: ORIGIN, requests };
}

export async function normalizedEvidence(recording) {
  const service = createPantaService({ recording, fetchImpl: () => { throw Error('No network permitted'); } });
  const catalog = await service.catalog();
  const briefs = [];
  for (const item of catalog.items) briefs.push(await service.brief(item.id));
  return JSON.stringify({ catalog, briefs });
}

export async function minimizeFixture({ archiveDir } = {}) {
  if (typeof archiveDir !== 'string' || !path.isAbsolute(archiveDir)) throw Error('Supply an explicit absolute archive directory outside this project.');
  const archive = path.resolve(archiveDir);
  const relative = path.relative(root, archive);
  if (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
    throw Error('Original capture must be archived outside the public project.');
  const fixturePath = path.join(root, 'fixtures', 'panta-recording-2026-10-02.json');
  const source = await readFile(fixturePath);
  const recording = JSON.parse(source);
  const projection = projectRecording(recording);
  const before = await normalizedEvidence(recording);
  const after = await normalizedEvidence(projection);
  if (before !== after) throw Error('Projection changes normalized evidence; source was not modified.');
  const projectedBytes = Buffer.from(JSON.stringify(projection, null, 2) + '\n');
  if (JSON.stringify(recording) === JSON.stringify(projection))
    return { unchanged: true, projectedSHA256: hash(source), normalizedSHA256: hash(after) };
  await mkdir(archive, { recursive: true });
  const realArchiveRelative = path.relative(await realpath(root), await realpath(archive));
  if (realArchiveRelative !== '..' && !realArchiveRelative.startsWith(`..${path.sep}`) && !path.isAbsolute(realArchiveRelative))
    throw Error('Archive resolves inside the public project.');
  const originalSHA256 = hash(source);
  const archiveFile = path.join(archive, `sourcebrief-combined-original-${originalSHA256}.json`);
  try { await writeFile(archiveFile, source, { flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  if (hash(await readFile(archiveFile)) !== originalSHA256) throw Error('Archive verification failed; public fixture was not modified.');
  await writeFile(fixturePath, projectedBytes);
  if (hash(await readFile(fixturePath)) !== hash(projectedBytes)) throw Error('Projection write verification failed. Original remains archived.');
  return { unchanged: false, archiveFile, originalSHA256, projectedSHA256: hash(projectedBytes),
    normalizedSHA256: hash(after), originalBytes: source.length, projectedBytes: projectedBytes.length,
    preservedRequests: projection.requests.length, marketCount: JSON.parse(after).briefs.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 4 || process.argv[2] !== '--archive-dir')
    throw Error('Usage: node scripts/project-fixture.mjs --archive-dir ABSOLUTE_PRIVATE_ARCHIVE_DIRECTORY');
  console.log(JSON.stringify(await minimizeFixture({ archiveDir: process.argv[3] }), null, 2));
}

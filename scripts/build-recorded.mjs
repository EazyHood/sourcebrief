import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPantaService, ORIGIN } from '../src/panta.mjs';
import { validateBrief, validateCatalog } from '../public/evidence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const replaceOnce = (source, anchor, replacement) => {
  if (source.split(anchor).length !== 2) throw new Error(`Build anchor is missing or ambiguous: ${anchor}`);
  return source.replace(anchor, replacement);
};

export async function buildRecordedDemo({ outDir = path.join(root, 'dist'), generatedAt = new Date().toISOString() } = {}) {
  const actualRoot = await realpath(root);
  const output = path.resolve(outDir);
  const relative = path.relative(actualRoot, output);
  if (relative !== 'dist' && !/^artifacts[\\/]static-test-[A-Za-z0-9-]+$/.test(relative))
    throw new Error('Output must be project/dist or a named project/artifacts/static-test-* directory.');
  await mkdir(path.dirname(output), { recursive: true });
  if (await realpath(path.dirname(output)) !== path.dirname(output)) throw new Error('Output parent cannot be a symlink.');
  const outputStat = await lstat(output).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (outputStat?.isSymbolicLink()) throw new Error('Output directory cannot be a symlink.');
  if (outputStat && await realpath(output) !== output) throw new Error('Output resolved outside the intended directory.');
  // Exact checked output only: an allowlist rebuild must not inherit unrelated files.
  if (outputStat) await rm(output, { recursive: true, force: true });
  await mkdir(path.join(output, 'data', 'briefs'), { recursive: true });
  const sourceFile = path.join(root, 'fixtures', 'panta-recording-2026-10-02.json');
  const source = await readFile(sourceFile);
  const recording = JSON.parse(source);
  if (recording.origin !== ORIGIN) throw new Error('Recording must declare the production Panta origin.');
  const service = createPantaService({ recording, fetchImpl: () => { throw new Error('Static builds must never access the network'); } });
  const catalog = await service.catalog({ limit: 20 });
  if (!validateCatalog(catalog) || catalog.provenance.mode !== 'recorded') throw new Error('Invalid normalized recorded catalogue.');
  const manifest = { version: 1, provider: 'Panta', mode: 'recorded', generatedAt,
    sourceRecording: { file: path.basename(sourceFile), sha256: sha256(source) },
    catalog: {}, briefs: {}, recordCount: catalog.items.length, capturedAt: [] };
  const saveJSON = async (relativePath, body) => {
    const bytes = JSON.stringify(body, null, 2) + '\n';
    await writeFile(path.join(output, relativePath), bytes);
    return { path: relativePath, sha256: sha256(bytes) };
  };
  manifest.catalog = await saveJSON('data/catalog.json', catalog);
  const times = new Set([catalog.provenance.fetchedAt]);
  for (const item of catalog.items) {
    const brief = await service.brief(item.id);
    if (!validateBrief(brief) || brief.provenance.mode !== 'recorded') throw new Error('Invalid normalized recorded detail.');
    manifest.briefs[item.id] = await saveJSON(`data/briefs/${item.id}.json`, brief);
    times.add(brief.provenance.fetchedAt);
  }
  manifest.capturedAt = [...times].sort();
  let html = await readFile(path.join(root, 'public', 'index.html'), 'utf8');
  html = replaceOnce(html, 'href="/styles.css"', 'href="./styles.css"');
  html = replaceOnce(html, 'src="/app.mjs"', 'src="./app.mjs"');
  html = replaceOnce(html, 'class="wordmark" href="/"', 'class="wordmark" href="./"');
  html = replaceOnce(html, '<meta name="color-scheme" content="light">', `<meta name="color-scheme" content="light">\n  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'">\n  <meta name="referrer" content="no-referrer">`);
  html = replaceOnce(html, '<main class="wrap">', `<main class="wrap">\n    <aside class="notice" aria-label="Recorded demo scope"><strong>Recorded demo · ${catalog.items.length} captured markets</strong><p>Genuine Panta production responses captured on 2 October 2026. Replay retains the original capture time; this public demo never calls the live API. Additional pages are outside this capture. The complete repository includes the live server.</p></aside>`);
  html = replaceOnce(html, 'No background monitoring.<br>New data is requested only when you open, load or refresh.',
    'Recorded evidence only.<br>Replay reloads the same capture. Save a checkpoint and export the original evidence.');
  let app = await readFile(path.join(root, 'public', 'app.mjs'), 'utf8');
  app = `import { fetchRecorded } from './recorded-fetch.mjs';\n` + replaceOnce(app,
    'const response = await fetch(path, {', 'const response = await fetchRecorded(path, {');
  app = replaceOnce(app, "'Refresh evidence'", "'Replay captured evidence'");
  await writeFile(path.join(output, 'index.html'), html);
  await writeFile(path.join(output, 'app.mjs'), app);
  await writeFile(path.join(output, 'recorded-fetch.mjs'), await readFile(path.join(root, 'static', 'recorded-fetch.mjs')));
  for (const name of ['styles.css', 'evidence.mjs']) await writeFile(path.join(output, name), await readFile(path.join(root, 'public', name)));
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(path.join(output, '.nojekyll'), '');
  return { outDir: output, recordCount: manifest.recordCount, sourceSHA256: manifest.sourceRecording.sha256 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await buildRecordedDemo();
  console.log(`Recorded demo built in ${result.outDir}; ${result.recordCount} real captured markets. No live API requests.`);
}

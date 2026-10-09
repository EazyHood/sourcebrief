import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyPresentationAssets } from './presentation-assets.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'live-dist');
await mkdir(out, { recursive: true });
// An explicit list prevents private proof files or developer previews reaching the deployment.
for (const name of ['index.html', 'styles.css', 'app.mjs', 'evidence.mjs', 'launch.html', 'launch.css', 'launch.mjs']) {
  await writeFile(path.join(out, name), await readFile(path.join(root, 'public', name)));
}
const presentationMedia = await copyPresentationAssets(out);
await writeFile(path.join(out, 'presentation-manifest.json'), JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), assets: presentationMedia }, null, 2) + '\n');
await writeFile(path.join(out, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'
  Cache-Control: no-cache
`);
console.log('Live assets built from explicit public-file and reviewed-media lists. No credentials bundled.');

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PRESENTATION_MEDIA = Object.freeze([
  'sourcebrief-pitch-2026-10-09.mp4',
  'sourcebrief-pitch-2026-10-09.en.vtt',
  'pitch-poster-2026-10-09.png',
  'sourcebrief-demo-2026-10-09.mp4',
  'sourcebrief-demo-2026-10-09.en.vtt',
  'demo-poster-2026-10-09.png',
]);

// Resolve every required file before writing any presentation output. A missing
// final recording must fail the release, rather than publish a broken player.
export async function copyPresentationAssets(output) {
  const pages = await Promise.all(['presentation.html', 'presentation.css'].map(async name => ({
    name, bytes: await readFile(path.join(root, 'static', name)),
  })));
  const media = await Promise.all(PRESENTATION_MEDIA.map(async name => {
    const bytes = await readFile(path.join(root, 'static', 'media', name));
    if (!bytes.length || bytes.length >= 25 * 1024 * 1024) throw new Error(`Presentation asset is empty or exceeds the 25 MiB limit: ${name}`);
    if (name.endsWith('.vtt') && !bytes.toString('utf8').startsWith('WEBVTT')) throw new Error(`Invalid WebVTT header: ${name}`);
    return { name, bytes };
  }));
  await mkdir(path.join(output, 'media'), { recursive: true });
  for (const page of pages) await writeFile(path.join(output, page.name), page.bytes);
  for (const item of media) await writeFile(path.join(output, 'media', item.name), item.bytes);
  return media.map(item => ({ path: `media/${item.name}`, bytes: item.bytes.length, sha256: createHash('sha256').update(item.bytes).digest('hex') }));
}

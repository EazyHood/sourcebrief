import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createDbcService, DBC_EXAMPLES } from '../src/dbc.mjs';
import { solamiFromEnvironment } from '../src/solami.mjs';

// Deliberate operator command: three bounded read-only RPC requests per pool,
// plus the provider's mainnet guard. Never writes a key or full private endpoint.
const output = process.argv[2];
if (!output) throw new Error('Usage: node scripts/dbc-capture.mjs <private-or-public-output.json> [pool-address]');
const solami = await solamiFromEnvironment(process.env);
const rpcRecords = [];
const rpc = async (method, params, options) => {
  const response = await solami.rpc(method, params, options);
  rpcRecords.push({ method, params, ...response });
  return response;
};
const service = createDbcService({ rpc });
const ids = process.argv[3] ? [process.argv[3]] : DBC_EXAMPLES.map(example => example.id);
const briefs = [], failures = [];
for (const [index, id] of ids.entries()) {
  if (index) await new Promise(resolve => setTimeout(resolve, 1100));
  try { briefs.push(await service.brief(id, { refresh: true })); }
  catch (error) { failures.push({ id, code: error.code ?? 'CAPTURE_FAILED', message: error.code ? error.message : 'Read-only capture failed.' }); }
}
const artifact = { type: 'sourcebrief-dbc-capture', version: 1, capturedAt: new Date().toISOString(),
  network: 'mainnet-beta', provider: 'Solami', requests: rpcRecords, briefs, failures,
  note: 'Real read-only account responses. Quote fields are local mathematical scenarios, never transactions.' };
const path = resolve(output);
await mkdir(dirname(path), { recursive: true });
await writeFile(path, JSON.stringify(artifact, null, 2) + '\n');
console.log(JSON.stringify({ output: path, captured: briefs.length, failed: failures.length,
  slots: briefs.map(brief => brief.provenance.slot), failures }, null, 2));
if (failures.length) process.exitCode = 1;

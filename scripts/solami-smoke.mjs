import { writeFile } from 'node:fs/promises';
import { solamiFromEnvironment } from '../src/solami.mjs';
import { ApiError } from '../src/errors.mjs';

// Opt-in live read: three RPC requests, no wallet, signing, transfer, subscription or paid-plan activation.
const args = process.argv.slice(2);
if (args.length !== 0 && !(args.length === 2 && args[0] === '--out' && args[1])) {
  console.error('Usage: node scripts/solami-smoke.mjs [--out NEW_FILE.json]');
  process.exitCode = 1;
} else {
  try {
    const service = await solamiFromEnvironment();
    const network = await service.rpc('getGenesisHash');
    const slot = await service.rpc('getSlot');
    const blockTime = await service.rpc('getBlockTime', [slot.result]);
    const evidence = { format: 'sourcebrief-solami-smoke/v1', checkedAt: new Date().toISOString(),
      readOnly: true, network: 'mainnet-beta', checks: { network, slot, blockTime },
      limits: ['RPC identity and a live slot only; not a DBC integration test or a latency benchmark.',
        'No account plan, billing setting or transaction was changed by this script.'] };
    const serialized = JSON.stringify(evidence, null, 2) + '\n';
    if (args.length) await writeFile(args[1], serialized, { flag: 'wx' });
    console.log(serialized);
  } catch (error) {
    const safe = error instanceof ApiError ? { code: error.code, message: error.message,
      ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}) }
      : { code: 'SMOKE_FAILED', message: 'The live check or evidence-file write failed. Inspect local configuration without publishing credentials.' };
    console.error(JSON.stringify(safe));
    process.exitCode = 1;
  }
}

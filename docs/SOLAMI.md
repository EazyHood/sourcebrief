# Live chain evidence through Solami

Sourcebrief uses Solami as the sole transport for its live Meteora DBC account evidence. The server verifies the RPC's mainnet genesis hash, reads the pool to locate its configuration, and lets the DBC service request a coherent account set at one RPC context slot. The SDK decodes those bytes and calculates a local, unsigned quote. No wallet or signing key belongs in this application.

The RPC transport is implemented in [`src/solami.mjs`](../src/solami.mjs). It contains no simulation, signing, airdrop or transaction-broadcast method. A quote based on chain state is a calculation, not a trade, price guarantee or claim about users.

## Private configuration

Create a **RPC-type API key** on Solami's Free tier and confirm the allowance in the account dashboard. Do not activate PAYG, a funded balance, a paid plan, gRPC or Blur to run this workflow. Sourcebrief only needs RPC reads. The server configuration accepts either:

- `SOLAMI_API_KEY` supplied privately by the deployment environment; or
- `SOLAMI_KEY_FILE`, the absolute path to a private file outside this repository. Its contents may be a plain key or JSON containing `api_key`, `apiKey` or `key`.

Use an environment setting containing the file path, not the API key, for a local session:

```powershell
$env:SOLAMI_KEY_FILE = 'C:/private/sourcebrief-solami.json'
node scripts/solami-smoke.mjs --out 'C:/evidence/sourcebrief-solami-smoke.json'
```

The example paths are placeholders to replace locally. The smoke script creates a new evidence file and refuses to overwrite an existing one. It performs three read-only calls: mainnet identity, confirmed slot and that slot's block time. A missing key fails with `SOLAMI_SETUP_REQUIRED`; there is no public-RPC or mock fallback. The smoke check does **not** by itself demonstrate the complete DBC workflow.

The API key is added server-side to the official endpoint `https://rpc.solami.dev/sol?api_key=…`. The exported endpoint deliberately excludes its query string. Do not put the full RPC URL in client JavaScript, screenshots, shell history, videos or exported briefs. The transport discards upstream error text and unexpected fields; a response reflecting the configured key is rejected entirely.

## Integration contract

```js
import { solamiFromEnvironment } from './src/solami.mjs';
const rpc = await solamiFromEnvironment();
const { result, provenance } = await rpc.rpc('getAccountInfo', [publicKey, {
  commitment: 'confirmed', encoding: 'base64'
}]);
```

`rpc(method, params, { refresh = false })` returns `{ result, provenance }`. Supported methods are `getGenesisHash`, `getSlot`, `getBlockTime`, `getAccountInfo` and `getMultipleAccounts`. Account reads only accept base64/confirmed data; a multiple-account read contains at most ten keys and can require `minContextSlot`. Calls with unknown options or methods fail before an upstream request. Account data is bounded and remains binary/base64 until the Meteora decoder validates it.

Provenance contains provider `Solami`, mode `live`, network `mainnet-beta`, checked mainnet genesis hash, RPC method, credential-free endpoint, context slot (when applicable), commitment, capture time and `cached`. The DBC service must use the **final multiple-account read's** context/provenance for its snapshot. An earlier pool lookup is discovery, not the final coherent snapshot.

The mainnet identity check is cached for ten minutes. Successful RPC results are cached for five seconds by default; the original capture time and context slot survive cache hits. Refresh uses the same request budget and provider cooldown. A failed refresh returns an error rather than relabeling an old capture as current. Recorded evidence, if served elsewhere, must retain its original time and use a separate `recorded` label; this transport never produces recorded results.

## Bounds and failure behavior

- Fixed HTTPS origin and path; no user-controlled endpoint or redirects.
- At most 120 upstream requests/hour by default, four/second, two concurrent reads. Mainnet checks count toward these limits. Optional constructor settings can only lower or conservatively bound them (maximum hourly budget 360).
- Ten-second timeout by default, including streamed response bodies; 512 KiB maximum per response. No automatic retries.
- In-flight identical requests are deduplicated. A failed refresh leaves the old cache entry untouched and exposes the failure.
- Provider rate-limit pauses apply to subsequent refreshes. HTTP 402/401/403 does not trigger purchasing, plan changes or credential workarounds.
- Null accounts and unavailable block times stay null. A response behind `minContextSlot`, with a mismatched JSON-RPC ID or from a different network cannot become a chain brief.

Useful error labels include `SOLAMI_SETUP_REQUIRED`, `SOLAMI_AUTH`, `SOLAMI_ACCESS_LIMIT`, `SOLAMI_NETWORK_MISMATCH`, `SOLAMI_TIMEOUT`, `SOLAMI_RATE_LIMIT`, `SOLAMI_COOLDOWN`, `SOLAMI_SLOT_NOT_READY`, `SOLAMI_BUDGET_EXHAUSTED`, `SOLAMI_LOCAL_RATE_LIMIT` and `SOLAMI_DATA_INVALID`. They distinguish unavailable evidence from evidence that contradicts a claim. Do not interpret a provider failure as an absent pool or a failed launch.

## Public source verification — 9 October 2026

- [Solami's public overview](https://solami.dev/llms.txt) identifies `rpc.solami.dev`, advertises a Free tier without a card and describes standard Solana RPC. It advertises 10 RPS in prose.
- The [live official pricing endpoint](https://api.solami.dev/pricing) returned **Free price 0, `rpc_rps: 5`, no gRPC or WebSocket access** on this review. This differs from the prose, so Sourcebrief's local cap is four requests/second. This observation is a public offer, not proof that a particular account has been provisioned.
- The [official RPC interface](https://solami.dev/rpcs) and its public frontend bundle document `https://rpc.solami.dev/sol?api_key=<key>`; the interactive account panel is the source for the private key. No account endpoint was called during documentation research.

Independent identity check on 9 October: a `getGenesisHash` POST to the official Solana endpoint `https://api.mainnet-beta.solana.com` returned `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`. Solami returned the same full value. The first implementation accidentally truncated this identity; the live smoke caught the mismatch, and the constant was corrected before a live snapshot was accepted. Tests now use the separately captured official value rather than deriving their fixture from the production constant, and check its full 32-byte decoding.

Offline verification: `node --test test/solami-service.test.mjs` passes twelve tests covering the independent identity anchor, method/origin restrictions, mainnet mismatch, coherent slot enforcement, cache freshness, deduplication, budgets, timeout, provider failures, response bounds and secret handling. These synthetic tests do not prove live access. Preserve the separately executed smoke and DBC evidence with the submitted version before claiming the live requirement is complete.

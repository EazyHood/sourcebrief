# Live deployment record — 9 October 2026

## Status and scope

Live application: [sourcebrief.jhonatandelrio9.workers.dev](https://sourcebrief.jhonatandelrio9.workers.dev/). [Launch evidence](https://sourcebrief.jhonatandelrio9.workers.dev/launch.html).

Current published Worker version: `51fe9223-8922-48d6-980c-4da0aea693ec`, adding the reviewed presentation and media. The previous version `103c34f7-ef10-4599-80b9-47933dc675db` was verified at **2026-10-09 23:04:08 UTC**: Panta HTTP 200 in live mode and Solami DBC HTTP 200 on mainnet at context slot **455034122**. Subsequent genuine browser use at 23:17–23:21 UTC captured Panta comparison and Solami launch/scenario/export/abstention paths. These observations do not guarantee indefinite availability or constitute a hackathon submission.

Final integrated suite: **97 tests passed, zero failed**. A media-inventory change initially broke the strict recorded-market manifest and was corrected by keeping `presentation-manifest.json` separate; the real replay adapter passes again. All 91 tracked/nonignored release files were scanned for the two known provider credentials (literal, URL-encoded and Base64) with zero matches. Private founder-form data stays outside the repository. The reviewed live asset inventory contains only app files, presentation metadata and the six final media files.

The public presentation loads both 1920×1080 H.264 videos without a media error: pitch **118 seconds**, demo **140 seconds**. Browser metadata reports readyState 4 for both. The pitch is an editorial presentation; the demo is explicitly disclosed sampled live UI, not a continuous screen recording. Their original dates, mainnet slots, sampling limits and final hashes are documented in the submission media records.

The [GitHub Pages recorded archive](https://eazyhood.github.io/sourcebrief/) and [source repository](https://github.com/EazyHood/sourcebrief) are distinct from this live service. The archive's older Panta video is not proof of the later Solami integration. Official registration/submission receipts are tracked separately.

Sourcebrief has two evidence views within one product: Panta prediction-market rules and Solami-sourced Meteora DBC launch state. The read/checkpoint/compare/export workflow is shared. Market and launch records are not automatically joined or asserted to refer to the same asset.

There is no wallet connection, private signing key, order, deposit, signing, transaction simulation or broadcast route. The Meteora SDK supplies account decoding, deterministic address derivation and local quote arithmetic. A scenario is not a swap. No users, launches, adoption, trading activity or financial results are inferred from the public examples.

## Runtime and build

Use Node.js 22+. The lockfile pins the dependency graph, including DBC SDK 1.5.13, Solana web3.js 1.98.4, bn.js 5.2.5 and Wrangler 4.149.0 at this review.

```powershell
npm ci
npm test
node scripts/build-live.mjs
npx wrangler deploy --dry-run --outdir artifacts/worker-bundle
npx wrangler dev --local
```

The dry run builds a local artifact; it does not publish. `build-live.mjs` copies an explicit browser-file list into `live-dist/` and writes static security headers. It does not copy credentials or captures into browser assets. The Worker bundle contains a Panta recording solely for explicit `PANTA_MODE=recorded`; default live mode does not use it on failure.

`wrangler.jsonc` selects `worker.mjs`, compatibility date `2026-10-09`, `nodejs_compat`, an `ASSETS` binding to `live-dist/`, and `run_worker_first: ["/api/*"]`. Ordinary assets use the asset service and `_headers`; API routes use Worker response headers. Application observability is disabled in this configuration. This does not imply that the hosting platform retains no infrastructure logs.

Only the explicit public asset directory is publishable. The repository root, local environment files, `.private`, artifacts and private provider files are not deployment assets. Never deploy the repository directory as static content.

## Private configuration

| Runtime | Panta | Solami |
| --- | --- | --- |
| Node server | `PANTA_API_KEY` or `PANTA_KEY_FILE` | `SOLAMI_API_KEY` or `SOLAMI_KEY_FILE` |
| Local Wrangler | Private `PANTA_API_KEY` binding | Private `SOLAMI_API_KEY` binding |
| Published Worker | Cloudflare secret `PANTA_API_KEY` | Cloudflare secret `SOLAMI_API_KEY` |

Node private files may contain a bare key or JSON with `api_key`, `apiKey` or `key`. Keep them outside the repository. Worker bindings contain key values, not local filesystem paths. Local Wrangler can read ignored `.dev.vars`, populated privately; do not commit or copy its contents into transcripts, screenshots or evidence.

The operator must obtain legitimate provider access and confirm the account allowance. The Solami account used for integration was a free RPC account; Panta was tested with an existing private key. The application does not activate paid plans or top up balances. These observations do not guarantee future pricing, availability or unlimited usage.

Panta receives the key as an upstream header. Solami receives it in its official RPC endpoint query, constructed server-side; exported provenance contains only `https://rpc.solami.dev/sol`. No secret reaches browser assets, local browser storage or normalized exports. Raw upstream error bodies and private request URLs must never be copied into public logs or recordings.

Worker Panta mode defaults to `live`; a missing key produces a setup error. `PANTA_MODE=recorded` explicitly selects the bundled fixture and labels responses accordingly. The Node server separately supports `PANTA_RECORDING_FILE`, which takes precedence over its Panta key. A live launch failure never silently falls back to a recording.

## Recorded archive

```powershell
node scripts/build-recorded.mjs
```

Only `dist/` is the static archive. The current builder packages five genuine Panta captures from October 2 and three DBC briefs from October 9, retaining original times and recorded labels. Replay never requests current provider data; the launch view replays captured scenarios. Publishing an updated archive is a separate operation and is not implied by the live Worker release.

The minimized Panta fixture and hashes are documented in [PROVENANCE.md](PROVENANCE.md). The Panta manifest checks file integrity, not provider truth. DBC hashes identify captured account bytes; they are not independent cryptographic authentication of an RPC response.

## Read path and resource limits

The browser exposes GET routes for the catalogue, one market brief, launch examples and one launch brief. Unknown queries, unsupported methods, request bodies, invalid identifiers and invalid amounts fail before provider calls. There is no arbitrary upstream URL, general RPC method input, mutable slippage setting or transaction route.

Solami backend POST requests are restricted to mainnet identity, slots/block times and account reads. A DBC brief discovers references and then captures pool, config, both mints and Clock together with monotonic `minContextSlot`. Only the final joint response determines its observation time and slot. Owners, layouts, references and the derived pool address are checked before analysis. See [DBC-INTEGRATION.md](DBC-INTEGRATION.md) and [SOLAMI.md](SOLAMI.md).

The Worker retains only completed public JSON and numeric counters/cooldown timestamps between requests. A pending fetch or Response is never shared across invocations. Its completed-response cache lasts five seconds and has at most 64 entries. Source timestamps/slots survive cache hits. A failed refresh stays an error and does not relabel older evidence.

Default Worker limits are **per isolate**: 60 Panta attempts/hour, 120 Solami attempts/hour and four Solami attempts/second. A fresh uncached launch normally uses four RPC calls including genesis verification, allowing about 30 such loads under that isolate's hourly budget. Failed upstream attempts count. Multiple/restarted isolates can reset or multiply the limits. These are not global quotas, paid-plan safeguards or billing guarantees; provider account limits remain authoritative.

Provider HTTP 429 responses update a numeric per-provider cooldown using `Retry-After` seconds or dates. Subsequent invocations cannot fetch that provider until expiry. Concurrent replies retain the longest pause. Cache reads can still return recently completed public evidence, with its original provenance. This cooldown is also per isolate; production-wide enforcement would need shared coordination.

Provider services remain request-local. Their 12-second Panta and ten-second Solami timeouts, 512 KiB response ceilings, fixed endpoints and no-redirect/no-auto-retry policies apply. Per-service concurrency bounds do not become a cross-isolate semaphore. The Node server separately retains services, caches, concurrency and cooldowns for its process lifetime.

Same-origin API checks, restrictive CSP, bounded queries and public-file allowlists reduce exposure. They do not authenticate visitors or block every non-browser client. Public load can exhaust the free read allowance and show explicit unavailable states. No background polling runs.

## Verification observed

| Check | Result | Scope |
| --- | --- | --- |
| Direct Solami smoke, October 9 22:49 UTC | Full genesis matched independent official Solana RPC; slot `455029991`, block time `1791586143` | Real authorized read access and network identity; not the full app |
| Three DBC captures | Slots `455030227`, `455030235`, `455030241`; active, migrated and transfer-hook examples | Real Solami account data interpreted by the SDK; third-party pools |
| Worker HTTP suite | Ten tests passed after the cooldown change | Routing, validation, secrets, modes, cache/budget/cooldown and request-local isolation under injected transports |
| Wrangler dry run before cooldown change | Exit 0; 2052.86 KiB / 353.92 KiB gzip; `ASSETS` binding | Bundle construction; size applies to that dry-run build |
| Actual local Wrangler smoke | Panta HTTP 200 and live DBC slot `455032482` | Real integrations execute in the Worker runtime |
| Published Worker | Version above; live Panta HTTP 200, Solami mainnet DBC HTTP 200 at slot `455034122` | Public API access at the recorded time |

Solami's twelve offline tests and the DBC suite separately cover mainnet mismatch, invalid accounts/references, exact decimals, quote behavior and abstentions. Offline tests do not consume live provider quota. Browser rendering, download, accessibility and performance checks require separate evidence; they are not inferred from API responses.

The initial Solami implementation had a truncated genesis constant. Live validation caught it before an accepted DBC snapshot. The corrected full identity is `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`. Tests now use a separately observed official value rather than a fixture derived from the production constant.

## Dependency audit: scoped review

`npm audit` reported **13 affected dependency nodes: six high and seven moderate**. Several parent packages inherit the same transitive findings; this is not thirteen distinct application exploits. No automatic breaking upgrade was applied, and the tree is not described as clean.

The dry-run bundle and application call paths were inspected:

- **bigint-buffer:** the Worker bundles `dist/browser.js`, using pure JavaScript conversion rather than native bindings. The [reported buffer overflow](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg) concerns `toBigIntLE`; the reviewed Worker does not load its native converter. Node deployment requires separate assessment because the Node package attempts native bindings.
- **TOML:** the parser is absent from this Worker bundle and no app route accepts TOML. The transitive [recursion](https://github.com/advisories/GHSA-82x6-q7mm-w9cf) and [prototype-pollution](https://github.com/advisories/GHSA-v5mp-jgw5-2x6j) parser paths are not exposed by the reviewed API.
- **stream-json / Jayson:** stream-json and Jayson server code are absent from the bundle. Jayson browser-client code is present through web3.js, but Sourcebrief does not create a web3 `Connection` or expose a JSON-RPC server. Solami uses the application's bounded parser and fixed method/endpoint allowlist. This does not test every dormant SDK function.
- **uuid:** browser code is bundled, but the app has no v3/v5/v6 path with caller-controlled buffers. The bundled Jayson client selects v4. The [advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq) concerns v3/v5/v6 bounds checks when callers provide buffers.

This is a scoped reachability review, not a waiver of findings or a complete security audit. SDK/runtime updates and new input paths require rechecking. The public demo is bounded, read-only and unauthenticated; it makes no security certification.

## Interpretation limits

Checkpoints are browser-local, not an authenticated history. Panta's source assertions are not independently verified. Solami RPC observations may change after capture. Example pools are not ours, and token names are not invented. Derived destination addresses do not prove destination liquidity. Configured locks are not verified holdings.

The SDK calculator abstains for completed/migrated pools, hooks, Token-2022 extensions and other unsupported conditions. Pool trading fees exclude network and priority fees. No executed trade, user result, sponsor endorsement, prize or official acceptance follows from a quote, hosted build or recording.

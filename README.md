# Sourcebrief

Sourcebrief turns market and launch data into an inspectable evidence brief. Read the source, see what is missing, save a browser checkpoint, compare a later observation and export the evidence with its original provenance.

**Market briefs**, powered by Panta, preserve exact resolution wording, source identifiers, dates, explicit unit prices, separate volume fields and missing or conflicting information. **Launch briefs**, powered by Solami and Meteora, inspect live mainnet DBC accounts, curve and fee behavior, activation/migration state and mint authorities. Solami supplies the account bytes; Meteora's official SDK decodes them and calculates a supported local quote scenario.

The two views share an evidence workflow; a Panta market and a launch token are not assumed to be related. The project includes a live Node server, a Cloudflare Worker and a static archive of genuine captures. It has no wallet connection, signing key, order, deposit, signing, transaction simulation or broadcast route. A mathematical quote is not a swap or a promise about execution. No real-user adoption, ownership of example launches or financial outcomes are claimed.

## Try it

Live application: [sourcebrief.jhonatandelrio9.workers.dev](https://sourcebrief.jhonatandelrio9.workers.dev/). Public Panta and Solami DBC API reads were verified on 9 October 2026 at 23:04 UTC; the DBC response used mainnet slot **455034122**. [Open launch evidence](https://sourcebrief.jhonatandelrio9.workers.dev/launch.html).

Product films for the expanded application are [available here](https://sourcebrief.jhonatandelrio9.workers.dev/presentation): a **1:58 product pitch** and a **2:20 demonstration**. Both are caption-led, 1080p videos. The demonstration uses genuine sampled frames of live application use, with pauses and cuts disclosed; it is not a continuous screen recording. The pitch contains original graphics and one explicitly labelled static application illustration. Neither has narration or music.

The recorded archive and source are separate:

- Recorded demo: [eazyhood.github.io/sourcebrief](https://eazyhood.github.io/sourcebrief/).
- Full source: [EazyHood/sourcebrief](https://github.com/EazyHood/sourcebrief).
- Product films mirror: [pitch and application demonstration](https://eazyhood.github.io/sourcebrief/presentation.html).

That archive contains **five genuine Panta market captures from 2 October 2026**. Its visible recorded label and original timestamps remain in the brief and exports. It has no API key and never contacts Panta. “Replay captured evidence” reloads the same evidence; it does not claim a fresh market observation. Additional pages are outside the capture and return a clear unavailable message.

The current static builder also packages three genuine DBC captures from 9 October and the two new films. Static launch scenarios replay the captured results; they do not request current data. The Pages workflow validates and publishes the current revision; its deployment status is independent of the live Worker release.

Choose a market, inspect its rule and gaps, save a checkpoint, replay, and export JSON or Markdown. Use **Larger text** in the header to enlarge the evidence text for reading. Replaying the same capture correctly reports no tracked data changes. A checkpoint saved from a different genuine capture can be compared without changing either date or mode label.

The public browser check confirmed the five recorded markets, original timestamps, checkpoint persistence after reload, unchanged replay, an actual JSON download and an explicit message for an uncaptured next page. The hosted 1080p video played and responded to seek/pause controls. See the [QA record](docs/QA-2026-10-02.md) for the tested release and limits, including checks not performed.

Publishing this demo and repository does not mean an official hackathon entry has been submitted or accepted. Any official entry receipt is tracked separately.

## Requirements and startup

Node.js 22 or newer. Install the pinned SDK and tooling dependencies before running the expanded application.

From this directory:

```powershell
npm ci
npm test
npm start
```

Open `http://127.0.0.1:5186` for markets or `http://127.0.0.1:5186/launch.html` for launches. Without configured provider access, the UI can load and the relevant API returns an explicit setup error. The default binding is loopback. `PORT` and `HOST` can be configured; keep the loopback binding for local use. The Node server is not an authenticated public service.

### Offline recorded evidence

```powershell
$env:PANTA_RECORDING_FILE = Join-Path (Get-Location) 'fixtures/panta-recording-2026-10-02.json'
node server.mjs
```

The included file is a minimized projection of genuine captured Panta production responses from October 2, 2026. Unused creator profile, wallet and image fields were removed; the normalized catalogue and all five briefs were verified byte-identical before and after projection. [Provenance and hashes](docs/PROVENANCE.md) describe the original archive and transformation. Recorded mode never calls Panta and always returns `provenance.mode: "recorded"`. The capture timestamps and request IDs remain those of the original requests, including after refresh. A recorded refresh is a replay, not a new observation.

Only captured pages and details are available. A missing page/detail returns `RECORDING_NOT_AVAILABLE`; it is never synthesized. The catalogue retains its original next cursor, which may point beyond the recording. A requested limit smaller than the captured page returns `RECORDING_PAGE_LIMIT`, avoiding skipped rows under the opaque upstream cursor.

### Live evidence

Configure `PANTA_KEY_FILE` to point to an existing private file outside this project, then start the server. Accepted file forms are a bare key or a JSON object containing `api_key` (also `apiKey` or `key`). Alternatively, inject `PANTA_API_KEY` in the server environment. The environment key takes precedence over the private file. Never put keys in source, browser storage, query parameters, screenshots or committed files.

If both recording and key configuration are present, **recording wins for Panta**. Remove `PANTA_RECORDING_FILE` from the launching shell to explicitly select live mode. This setting does not turn the Solami launch API into a recorded API. Neither live integration silently falls back to a recording when a provider fails.

The Panta key only goes to fixed host `https://live-api.panta.market` in `X-Api-Key`; its upstream requests are GET. For launches, configure `SOLAMI_KEY_FILE` to a private file outside this repository, or inject `SOLAMI_API_KEY`. The accepted private-file forms are the same as Panta's. Solami uses backend POST requests to a fixed allowlist of read-only JSON-RPC methods; no general RPC proxy is exposed.

The Solami key is added server-side to `https://rpc.solami.dev/sol?api_key=…`. Public provenance contains only the credential-free endpoint. No wallet or signing key is needed. See [Solami configuration and transport](docs/SOLAMI.md).

### Build the static demo

```powershell
node scripts/build-recorded.mjs
```

Serve only generated `dist/` over HTTP(S). The current build packages five Panta market captures and three saved Solami DBC briefs, all explicitly recorded. It uses an asset allowlist and relative paths suitable for a GitHub Pages project subpath. The Panta manifest identifies its input projection and hashes its normalized market files; the browser verifies those hashes. This checks integrity, not independent authenticity of provider claims. [Static build details](docs/STATIC-DEMO.md) also document the earlier Panta release.

### Worker build and local runtime

```powershell
node scripts/build-live.mjs
npx wrangler deploy --dry-run --outdir artifacts/worker-bundle
npx wrangler dev --local
```

The dry run creates a bundle; it does **not** publish it. Local Wrangler needs private `PANTA_API_KEY` and `SOLAMI_API_KEY` bindings, for example in ignored `.dev.vars`. Worker bindings contain key values, not local key-file paths. The production operator supplies the same names through Cloudflare secrets. Never commit local environment files or credentials.

`worker.mjs` defaults to live Panta. `PANTA_MODE=recorded` explicitly selects the bundled Panta fixture; missing live credentials fail with 503. There is no recorded fallback for live launches. `ASSETS` serves `live-dist/`, and `/api/*` runs the Worker first. See [deployment and verification notes](docs/LIVE-DEPLOYMENT-2026-10-09.md).

## API and resource limits

The exact browser/server schema is frozen in [CONTRACT.md](CONTRACT.md).

- `GET /api/catalog?limit=20&cursor=...`: one provider page; limit 1–20, opaque cursor up to 512 characters.
- `GET /api/brief/:id`: one market. The ID must decode from base58 to exactly 32 bytes.
- `GET /api/brief/:id?refresh=1`: bypass the one-minute cache, never the request budget or provider pause.
- `GET /api/launch/examples`: three known public DBC examples; no provider call.
- `GET /api/launch/:pool?quoteAmount=0.1&refresh=1`: one coherent mainnet DBC brief and, where supported, a local SDK scenario. The amount must be a positive ordinary decimal that fits the token's precision and u64 base units. `refresh=1` is optional.
- Other HTTP methods return 405. Unknown or repeated query parameters are rejected. Static files are restricted to the public directory. The index supports bounded `q`/`category` parameters for reloadable local filters.

The Node Panta service defaults allow at most 60 upstream attempts per rolling hour, two concurrent requests, a one-minute cache and 64 cached resources. Identical in-flight requests are shared within that service. Solami defaults are 120 upstream attempts/hour, four/second, two concurrent reads and a five-second cache. No automatic retries, background polling or fetch-all loop runs. Failed attempts consume budget. These limits are process-local, not global quotas or billing guarantees.

Panta requests have a 12-second overall timeout; Solami uses ten seconds. Both have a 512 KiB response ceiling and refuse redirects. An upstream 429 starts a cooldown; simultaneous rate-limit responses retain the longest required pause. API 429 errors include `Retry-After`. A failed refresh returns an error and never relabels older evidence as freshly retrieved. Ordinary cache hits preserve the original capture time and slot, where applicable.

The Worker separately retains only completed public JSON (five seconds, at most 64 entries), numeric per-isolate attempt counts and provider cooldown timestamps. Network services/promises remain request-local. Its defaults allow 60 Panta and 120 Solami attempts/hour per isolate, plus four Solami reads/second. A fresh launch typically uses four RPC calls including genesis verification. Multiple/restarted isolates can reset or multiply these limits. They are not a global budget, and same-origin checks are not authentication. See the deployment notes for the public-service limits.

Same-origin and Host checks protect the local server from unrelated browser pages. The browser cannot choose an upstream host or route. Keys, headers, raw upstream error bodies and stack traces are not returned to clients. Unexpected transport failures use a fixed safe error. Exact key reflections in successful provider payloads are redacted before normalization.

## Interpreting the evidence

- `yesPrice` and `noPrice` must be explicit non-negative decimal strings in `[0,1]`. Zero is valid. Decimal strings preserve precision; no floating-point display rounding is introduced.
- Raw secondary prices such as `500000000` are not treated as unit prices. A scale warning explains why they were ignored; no undocumented conversion is guessed.
- `volumeUsdc` and `totalVolumeUsdc` remain separate. `0` in the former is not replaced with `5` from the latter.
- Resolution text and sources prefer the top-level fields. Only absent/null values fall back to `onChain`. Empty top-level text or lists stay empty. Conflicting copies produce an attention check.
- Sources are provider identifiers, not invented links or verified authorities. `present` means present in a supported field, not independently verified.
- Dates accept finite Unix seconds or calendar-valid timezone-qualified ISO strings and normalize to UTC. Missing, invalid and chronologically conflicting dates are explicit.
- Provider strings are bounded. Resolution text is limited to 16,000 characters; any truncation adds a visible `TEXT_TRUNCATED` attention check stating that the full wording is not represented. Source lists are limited to 32 entries with an explicit partial-list warning. Do not treat a truncated brief as a complete rule transcription.
- Known sandbox-fixture responses are rejected with `PROVIDER_TEST_MODE`; a test key cannot silently produce live evidence.

## Validation

```powershell
npm test
node --check server.mjs
node --check src/panta.mjs
node --check src/normalize.mjs
node --test test/solami-service.test.mjs test/dbc.test.mjs test/worker-http.test.mjs
node --check worker.mjs
```

The tests run offline using injected transport, local temporary files and an ephemeral loopback HTTP server. They cover ID validation, zero/precision preservation, raw-scale isolation, rule/source precedence and conflicts, provenance, recording boundaries, cache refresh, secret reflection, budget/concurrency, timeout, size limits, rate-limit pauses, redirects, safe HTTP routes and the actual captured five-market fixture against the frontend validators. Frontend unit tests cover persistence, comparison and exports. Static-build tests cover subpath routing, an asset allowlist, manifest/data validation, integrity failures and explicit recorded mode. A fixture-projection regression checks byte-identical normalized output after removing unused personal fields.

The expanded offline tests also cover independent mainnet identity, coherent account references, exact DBC math, quotes/abstentions, Worker request boundaries and provider cooldown across invocations. On October 2, 2026, the earlier release passed **50 tests**; that historical count does not describe the expanded suite. Browser interaction, hosted-site verification and live validation are recorded separately rather than inferred from offline tests.

On October 9, Wrangler's dry run succeeded, and an actual local Wrangler smoke returned live Panta HTTP 200 plus a live Solami DBC brief at slot **455032482**. The published Worker subsequently returned both live providers successfully, including DBC slot **455034122**. Earlier DBC captures used slots **455030227**, **455030235** and **455030241**, demonstrating active, migrated and transfer-hook cases. These are third-party public pools, not Sourcebrief launches or users. These checks establish integration and the tested public routes, not hackathon acceptance. The [deployment record](docs/LIVE-DEPLOYMENT-2026-10-09.md) separates these checks.

## Launch evidence and abstentions

After discovering the pool/configuration references, the server reads pool, config, both mints and Clock together. Only that final RPC context becomes the launch brief. It verifies mainnet identity, owners/layouts, references and the derived DBC address. Exported slots, original timestamps, account hashes and decoder version identify the observed snapshot; hashes are not independently verified RPC proofs.

The calculator uses exact base units and the official Meteora SDK. It abstains for migrated/completed pools, transfer hooks, Token-2022 extension behavior, future activation, unsupported layouts and unquotable amounts. Pool trading fees exclude network and priority fees. A derived migration destination does not prove that it exists or has liquidity. Configured locks are not independently verified destination holdings. See the [DBC contract, examples and source references](docs/DBC-INTEGRATION.md).

## Current limits

The local checkpoint is browser-local, not server history or an authenticated audit log. Panta fields and source identifiers are not independently authenticated on-chain. Records can change after a capture. Catalogue search only filters loaded rows. There is no background monitoring, whole-catalogue indexing or server persistence. Provider permissions, quota and availability still apply. The static archive has no live backend; the Node server is intended for loopback use, and the read-only Worker is not an authenticated multi-tenant service. No sponsor approval, user adoption, submitted entry or verified outcome accuracy is claimed.

The October 9 dependency audit still reports 13 affected dependency nodes. The reviewed Worker routes do not expose the specific advisory paths examined, but this is not a clean dependency audit or complete security assessment. See the [scoped audit findings](docs/LIVE-DEPLOYMENT-2026-10-09.md#dependency-audit-scoped-review).

Detailed browser, live-integration and download verification: [QA record](docs/QA-2026-10-02.md).

## License and data

Original code and original documentation are provided under the [MIT License](LICENSE). Provider data, projected captures, derived evidence exports and third-party marks are not relicensed by it. See [NOTICE](NOTICE) for the distinction. The Meteora SDK's MIT license does not relicense its separately licensed on-chain programs. Provider names identify technical inputs, not endorsement.

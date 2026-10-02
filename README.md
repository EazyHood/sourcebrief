# Sourcebrief

Sourcebrief turns a Panta market response into an inspectable evidence brief: exact resolution wording, source identifiers, dates, explicit unit prices, independently reported volume fields and missing or conflicting information. Save a browser checkpoint, refresh manually, compare supported fields and export the evidence as JSON or Markdown.

Sourcebrief has a static evaluator demo using genuine recorded responses and a local server that can fetch live data with the operator's own Panta access. It does not place trades, connect wallets, certify sources, forecast outcomes or give investment advice. Its checks explain the response, not whether a market is trustworthy.

## Try the evaluator demo

Published and checked in the browser on 2 October 2026:

- Recorded demo: [eazyhood.github.io/sourcebrief](https://eazyhood.github.io/sourcebrief/).
- Full source: [EazyHood/sourcebrief](https://github.com/EazyHood/sourcebrief).
- Product walkthrough: [2:34 video with captions](https://eazyhood.github.io/sourcebrief/presentation.html).

The static demo contains **five genuine Panta market captures from 2 October 2026**. Its visible recorded label and original timestamps remain in the brief and exports. It has no API key and never contacts Panta. “Replay captured evidence” reloads the same evidence; it does not claim a fresh market observation. Additional pages are outside the capture and return a clear unavailable message.

Choose a market, inspect its rule and gaps, save a checkpoint, replay, and export JSON or Markdown. Use **Larger text** in the header to enlarge the evidence text for reading. Replaying the same capture correctly reports no tracked data changes. A checkpoint saved from a different genuine capture can be compared without changing either date or mode label.

The public browser check confirmed the five recorded markets, original timestamps, checkpoint persistence after reload, unchanged replay, an actual JSON download and an explicit message for an uncaptured next page. The hosted 1080p video played and responded to seek/pause controls. See the [QA record](docs/QA-2026-10-02.md) for the tested release and limits, including checks not performed.

Publishing this demo and repository does not mean an official hackathon entry has been submitted or accepted. Any official entry receipt is tracked separately.

## Requirements and startup

Node.js 22 or newer. There are no runtime or test dependencies to install.

From this directory:

```powershell
node server.mjs
```

Open `http://127.0.0.1:5186`. Without a configured key or recording, the interface loads and the API returns an actionable `503 SETUP_REQUIRED`. The default binding is loopback. `PORT` and `HOST` can be configured; keep the loopback binding for this local prototype. It is not an authenticated public service.

### Offline recorded evidence

```powershell
$env:PANTA_RECORDING_FILE = Join-Path (Get-Location) 'fixtures/panta-recording-2026-10-02.json'
node server.mjs
```

The included file is a minimized projection of genuine captured Panta production responses from October 2, 2026. Unused creator profile, wallet and image fields were removed; the normalized catalogue and all five briefs were verified byte-identical before and after projection. [Provenance and hashes](docs/PROVENANCE.md) describe the original archive and transformation. Recorded mode never calls Panta and always returns `provenance.mode: "recorded"`. The capture timestamps and request IDs remain those of the original requests, including after refresh. A recorded refresh is a replay, not a new observation.

Only captured pages and details are available. A missing page/detail returns `RECORDING_NOT_AVAILABLE`; it is never synthesized. The catalogue retains its original next cursor, which may point beyond the recording. A requested limit smaller than the captured page returns `RECORDING_PAGE_LIMIT`, avoiding skipped rows under the opaque upstream cursor.

### Live evidence

Configure `PANTA_KEY_FILE` to point to an existing private file outside this project, then start the server. Accepted file forms are a bare key or a JSON object containing `api_key` (also `apiKey` or `key`). Alternatively, inject `PANTA_API_KEY` in the server environment. The environment key takes precedence over the private file. Never put keys in source, browser storage, query parameters, screenshots or committed files.

If both recording and key configuration are present, **recording wins**. Remove `PANTA_RECORDING_FILE` from the launching shell to explicitly select live mode. The service does not silently switch modes.

The key only goes to the fixed host `https://live-api.panta.market` in `X-Api-Key`. This prototype exposes no account-management, order, deposit, wallet or transaction route. Every upstream request is GET.

### Build the static demo

```powershell
node scripts/build-recorded.mjs
```

Serve the generated `dist/` directory over HTTP(S), or publish only that directory as a static site. The build normalizes the saved responses through the same model and verifies the frontend schema. Its adapter uses relative asset paths, so it works under a GitHub Pages project subpath. The manifest identifies the input projection and hashes each normalized data file; the browser verifies those hashes. This checks file integrity, not independent authenticity of provider claims. [Static build details](docs/STATIC-DEMO.md).

## API and resource limits

The exact browser/server schema is frozen in [CONTRACT.md](CONTRACT.md).

- `GET /api/catalog?limit=20&cursor=...`: one provider page; limit 1–20, opaque cursor up to 512 characters.
- `GET /api/brief/:id`: one market. The ID must decode from base58 to exactly 32 bytes.
- `GET /api/brief/:id?refresh=1`: bypass the one-minute cache, never the request budget or provider pause.
- Other HTTP methods return 405. Unknown or repeated query parameters are rejected. Static files are restricted to the public directory. The index supports bounded `q`/`category` parameters for reloadable local filters.

Production defaults allow at most 60 upstream attempts per rolling hour, at most two concurrent requests, a one-minute cache and at most 64 cached resources. In-flight requests for the same resource are shared. No automatic retries, background polling or fetch-all loop runs. Failed attempts consume budget. These limits are process-local; restarting creates a fresh process budget and must not be used to evade provider limits.

Each upstream request has a 12-second overall timeout and 512 KiB response ceiling. Redirects are never followed. An upstream 429 starts a cooldown; simultaneous rate-limit responses retain the longest required pause. API 429 errors include `Retry-After`. A failed refresh returns an error and never relabels older evidence as freshly retrieved. Ordinary cache hits retain the original capture time and are labeled `cached: true`.

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
```

The tests run offline using injected transport, local temporary files and an ephemeral loopback HTTP server. They cover ID validation, zero/precision preservation, raw-scale isolation, rule/source precedence and conflicts, provenance, recording boundaries, cache refresh, secret reflection, budget/concurrency, timeout, size limits, rate-limit pauses, redirects, safe HTTP routes and the actual captured five-market fixture against the frontend validators. Frontend unit tests cover persistence, comparison and exports. Static-build tests cover subpath routing, an asset allowlist, manifest/data validation, integrity failures and explicit recorded mode. A fixture-projection regression checks byte-identical normalized output after removing unused personal fields.

On October 2, 2026, `npm test` passed **50 tests** after the static-demo and fixture-projection checks. No new Panta calls were made by these tests; the included production responses were captured separately. Browser interaction, hosted-site verification and live validation are recorded separately rather than inferred from the offline suite.

## Current limits

The local checkpoint is browser-local, not server history or an authenticated audit log. Panta fields and source identifiers are not independently authenticated on-chain. Records can change after a capture. Catalogue search only filters loaded rows. There is no background monitoring, whole-catalogue indexing or server persistence. Provider permissions, quota and service availability still apply to live keys. The static demo exposes no live backend; the local live server has not been hardened as an authenticated public service. This implementation does not claim sponsor approval, a submitted hackathon entry or verified outcome accuracy.

Detailed browser, live-integration and download verification: [QA record](docs/QA-2026-10-02.md).

## License and data

Original code and original documentation are provided under the [MIT License](LICENSE). Panta/provider data, its projected captures, derived evidence exports and third-party marks are not relicensed by that license. See [NOTICE](NOTICE) for the distinction. “Powered by Panta” identifies the data source, not endorsement.

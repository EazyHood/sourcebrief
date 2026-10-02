# Provenance and limits

Sourcebrief is a new candidate built with Codex assistance on 2 October 2026. It is not yet a Colosseum or Panta submission. Mermail is a separate candidate, currently blocked by its sign-in page; this project does not claim Mermail integration.

## What was executed

- A Panta developer account was created by its owner. The owner authorized a private API key, then separately authorized a live key for read-only access after the test key returned provider-declared fixtures.
- The test-key response declared sandbox fixtures. It was not treated as evidence of live markets. The probe stopped before using its invalid sample address.
- The live probe made authenticated GET requests for categories, five catalogue rows and the detail of one returned address. Four more GET requests captured the remaining details. These were actual API responses, not reconstructed screens or invented market records.
- The complete seven-request capture (categories, catalogue, five details) is preserved outside this public project. `fixtures/panta-recording-2026-10-02.json` is a field-minimized projection retaining the catalogue and all five details, each with its own original capture time and request ID. Recorded mode means replay of those saved responses. It is not a current feed. Times must never be reset when the recording is loaded.
- No wallet was connected; no position was opened, token launched, funds transferred, or paid plan selected. The keys remain outside this repository. Free unlimited API service has not been established; sustained operation must respect the account's current commercial terms and configured request budget.

## Why an adapter is needed

Observed catalogue rows may have empty titles that detail fills. The detail response exposes resolution wording and source identifiers not listed in the short public schema. Some raw secondary price fields use a different numeric scale from normalized top-level prices. The adapter explicitly uses top-level normalized prices and retains uncertainty rather than guessing conversions.

The fixture contains a resolved market with a zero YES price, which is a valid value. Reported volume and total volume are different provider fields. Neither is a statement about available liquidity. A source identifier or URL supplied by Panta is not evidence that Sourcebrief visited, authenticated or corroborated it. An API response does not by itself prove direct independent on-chain verification.

## Honest demonstration

A live demonstration must show the live mode label and its capture time. A recorded demonstration must retain the recorded label. A controlled test that changes a rule or price is a synthetic test, not a claim that an external market changed. A checkpoint refresh with only metadata changes must report no tracked changes. No users, revenue, investment outcomes or accuracy rates have been measured.

## Sources

- Listing: https://superteam.fun/earn/listing/panta-api-side-track/
- API guide: https://docs.panta.market/quickstart.md
- Catalogue contract: https://docs.panta.market/api-reference/markets/list.md
- Detail contract: https://docs.panta.market/api-reference/markets/get.md
- API terms: https://docs.panta.market/guides/terms-of-use.md

Code is independently written. The public Panta playground informed integration behavior but its code was not copied; no general open-source license was found there. Powered by Panta identifies the data provider, not endorsement.


## Subsequent application check

The completed application also made a bounded production catalogue/detail read. The browser-exported live detail and the older recorded checkpoint are preserved together in `evidence/live-ui-export.json`; the comparison correctly reports no tracked data differences. See `QA-2026-10-02.md`. The live server was stopped and the preview returned to recorded mode.

## Public fixture projection — 2 October 2026

Before publishing, the original combined capture was copied byte-for-byte to an archive outside this repository and its SHA-256 was verified before the public fixture was changed. The archived filename is `sourcebrief-combined-original-a5b7dab4db1a9f9b52bf6c16990b8b29b9ace57d187009c74aedca36064680f3.json`. The original is 42,227 bytes; the public projection is 10,932 bytes.

The projection removes the unused categories response, creator wallet/profile/social fields, image URLs, transaction details, unrelated chain fields and unused transport metadata. It retains only the catalogue fields, detailed fields and on-chain comparison fields consumed by normalization, including raw secondary prices required to explain scale differences. Provider wording, identifiers used as market/source evidence, zero prices, the two separate volume values, endpoint paths, request IDs and capture times are unchanged. This is a projection of actual responses, not a fresh API observation or a replacement for the archived original.

`scripts/project-fixture.mjs` creates this allowlist projection. It requires an explicit external archive directory, refuses to overwrite a different original archive and compares the normalized catalogue plus all five normalized briefs before writing. The before/after JSON serialization was **byte-identical**. The regression test also checks that adding unrelated creator fields cannot affect the normalized evidence and that projecting twice is idempotent.

SHA-256 values:

| Artifact | SHA-256 |
|---|---|
| Complete original capture | `a5b7dab4db1a9f9b52bf6c16990b8b29b9ace57d187009c74aedca36064680f3` |
| Public fixture projection | `4b93e5e8375ddd9b99a86f11baf6d36f45f5a729b3ef34eddb93ddffcd2889cb` |
| Identical normalized catalogue + five briefs, before and after | `eec9ae445ca2d6d0ccf13f24a057c81cab21e5590f756254527682a785398a87` |

The static build manifest hashes this public fixture projection as its input. Individual generated data hashes still describe the same normalized evidence. These checks prove the documented file transformation, not independent authentication of Panta's assertions or completeness of data outside this capture.

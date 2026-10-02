# Sourcebrief — candidate text

Prepared 2 October 2026. **Candidate text; official Colosseum/Crypto World's Fair and Panta Earn entries have not been submitted.** The source repository was first published from commit `cb36790`; the browser-verified public release is `1616f17`, deployed successfully by Pages run `37015736379`. The recorded evaluator demo and hosted presentation are available at the verified links below. Publication is not organizer acceptance; reconcile the actual form and any later official receipts before declaring submission.

- Verified evaluator demo: https://eazyhood.github.io/sourcebrief/ — genuine recorded data, not a live feed.
- Published full repository: https://github.com/EazyHood/sourcebrief — includes the local live server.
- Verified presentation player: https://eazyhood.github.io/sourcebrief/presentation.html — approximately 2 minutes 34 seconds, 1080p, English narration and visible captions. Public playback and seek/pause controls were checked; no listening audit is claimed.

## Project name

Sourcebrief

## One sentence

Turn a Panta market into a dated evidence brief, compare it with a saved checkpoint, and export the supported fields with their provenance.

## Short project description

A market headline leaves important questions unanswered: what exactly resolves the market, which sources did the provider supply, and what changed since the last review?

Sourcebrief is a research workspace for community editors and analysts who need to explain a Panta market before interpreting it. Choose a market, inspect its resolution wording, source identifiers, dates and price provenance, save a local checkpoint, then refresh and compare the supported fields. Export a readable Markdown brief or structured JSON with the original capture times and before/after differences.

Panta supplies the market catalogue and detail data. Sourcebrief adds a careful reading and handoff workflow: missing information stays visible, zero stays distinct from missing, separate volume fields stay separate, and resolved outcome values are distinguished from indicative unit prices. A timestamp or request-ID change does not masquerade as a market-data change.

The prototype includes a server-side Panta integration, a responsive browser interface, a Larger text reading control and 50 passing offline tests. Its static evaluator demo presents five genuine Panta responses captured on 2 October 2026 in an explicitly labelled recorded mode. Live mode runs locally with the operator's own configured server-side access; recording replay never becomes a live observation.

The result is evidence a reviewer can inspect and share. Sourcebrief does not independently verify source claims, forecast outcomes or execute trades. No user adoption, revenue or time savings have been measured yet.

## Who it is for and when it helps

**Initial target:** a community editor or researcher preparing a market explainer, newsletter note or internal review. This is a proposed audience, not a claim that these people already use the product.

**Moment of use:** the reviewer has a market to discuss and needs to separate the headline from the provider's actual wording, source identifiers and reported values. On a later review, the reviewer needs to know whether the supported fields differ from the earlier capture.

**Output:** a dated Markdown or JSON evidence packet that keeps the capture mode, provider endpoint and request ID, available resolution information, gaps, and checkpoint differences together. The packet is suitable for further human review; it is not an authenticity certificate.

## The completed product journey

1. Load one bounded catalogue page. Search and category filters apply only to rows already loaded.
2. Choose a market. Where a catalogue title is absent, the interface says so and loads its detail; it does not invent a headline or fetch every detail in advance.
3. Read the resolution wording and provider-supplied identifiers alongside UTC dates, price source/status, independent volume fields and explicit checks for supported missing or conflicting information. The Larger text control enlarges the evidence text. Long provider text may be bounded, with a visible truncation warning.
4. Save a validated checkpoint in this browser. Reloading preserves it when browser storage is available.
5. Refresh manually in local live mode, or use Replay captured evidence in the static demo. Compare the same market and schema version, retaining the two captures' provenance. Replaying an unchanged capture reports no tracked changes; it does not manufacture a changed market. Exact decimal-string comparison avoids floating-point rounding and treats equivalent formatting such as `0.50` and `0.5` as unchanged.
6. Export JSON or Markdown. Both retain source context; Markdown escapes provider markup. A failed request does not re-date previous evidence as fresh.

## Why Panta is central

The integration uses Panta's authenticated, read-only market catalogue and market-detail endpoints. The application cannot build its market brief without those responses or a clearly labelled recording of them. The detail response supplies information needed to interpret the shorter catalogue entry, including resolution wording and source identifiers when present.

The first saved production capture contains five catalogue records and five matching details. It exposes concrete integration cases: absent catalogue titles recovered from detail, raw secondary-price fields on a different scale, and a resolved market with a valid zero YES value. Sourcebrief handles those cases explicitly instead of silently supplying defaults or undocumented conversions. This is a bounded observation of those captured records, not a claim about every Panta market.

## Difference from the reference playground

Panta lists its API Playground as a resource for developers understanding API functionality and flows. Sourcebrief's product goal is a different task: producing a reviewable evidence packet for a reader and preserving the basis of a later comparison.

The contribution to demonstrate is the complete sequence **provider response → provenance-aware brief → persistent checkpoint → field-level comparison → export**. Its distinguishing decisions are source/gap preservation, exact decimal handling, outcome-value labelling and a portable before/after record. The interface is designed around reading a market rather than selecting API operations.

The saved research is not an exhaustive feature audit of every playground version or competing analytics product. Do not claim that Sourcebrief is the first or only product with these capabilities, or that the playground lacks a specific feature without additional evidence. The application code was independently implemented; the playground code was not copied.

## Architecture

Local live mode: browser HTML/CSS/JavaScript → same-origin local Node server → fixed Panta production API host.

Static evaluator demo: browser HTML/CSS/JavaScript → allowlisted normalized JSON captures hosted alongside the app. No private key, live backend or Panta request is involved in that path.

- The browser calls bounded catalogue and market-detail routes. Provider strings are rendered as text. Checkpoints remain in local browser storage and are schema-validated before use.
- The server keeps the API key outside browser assets and exports. It exposes allowlisted GET operations, does not follow upstream redirects, and bounds response size, timeout, concurrency, cache and request budget.
- Normalization preserves supported fields and attaches explicit checks. It does not infer a source URL, silently convert undocumented raw price scales, or merge distinct volume measures.
- The optional recorded mode replays saved production responses with their original capture times and a recorded label. It does not contact Panta. Only captured resources are available.
- The static build uses the same normalizer and frozen schema. It verifies a manifest and the data-file hashes, keeps assets inside the demo's relative path and rejects uncaptured pages rather than inventing them. The minimized public fixture omits unused creator profile/wallet/image fields; normalized outputs were verified byte-identical against the archived full capture.
- Node's built-in test runner passed 50 offline tests covering the adapter, transport controls, HTTP boundary, recording behaviour, frontend evidence functions, static build and fixture projection. There are no runtime dependencies to install. File hashes check integrity; they do not independently authenticate provider assertions.

See the project README, frozen contract, provenance note and test files for the exact operating limits. Browser QA and any later live checks must be recorded separately from the offline suite.

## Current limits and next validation

The implementation is a research prototype with a published source repository, browser-verified static evaluator demo and a local live mode. Hosted checks confirmed loading, checkpoint persistence, unchanged replay, a validated JSON export, an explicit uncaptured-page error, mobile layout in normal/Larger text modes and video playback controls. The static demo contains one page and five recorded details, never a current feed. A local checkpoint is editable browser data, not server history or a tamper-evident audit log. Source identifiers, resolution claims and on-chain fields are reported by Panta; Sourcebrief has not independently authenticated them. Search covers loaded catalogue rows, not the complete market universe. There is no background monitoring, multi-user collaboration or trading function.

No interviews, external users, usage retention, revenue, accuracy gains or time savings have been measured. The proposed next validation is to have intended readers produce one evidence brief and review one controlled revision, then record completion, interpretation errors and feedback. That is a future evaluation plan, not traction.

Panta availability, account access, quota and commercial terms still apply to live mode. An unlimited free service has not been established. The evaluator site serves only recorded static assets; the live server defaults to loopback and is not an authenticated public service.

## AI and prior work disclosure

Sourcebrief was developed with substantial assistance from OpenAI Codex, including implementation, test design, documentation and this candidate text. Do not describe it as unaided human coding or imply that AI assistance has already been approved by the organizers. The saved Panta listing and subsequently reviewed official CWF PDF contain no explicit AI clause. This does not constitute organizer approval; check any additional final-form declaration and disclose the assistance honestly.

The completed presentation uses actual browser captures of selected states, with English narration from the authorized free local Microsoft Zira Desktop voice and captions. It is approximately 2 minutes 34 seconds at 1920×1080 and 30 fps. It does not claim continuous screen recording, a human narrator or a newly changing live market.

The local provenance record dates this candidate to 2 October 2026. Original code and documentation are MIT licensed. The Panta API, documentation and captured market data remain third-party materials; the repository's NOTICE excludes them from that license grant. The playground was consulted as a reference, not copied. Declare any prior code or components truthfully in the official form after checking the final repository history. No claim of exclusive ownership over Panta data is made.

## Form preparation — not filled or sent

| Entry | Prepared value / actual state |
|---|---|
| Name | Sourcebrief |
| Description | Short description above, adjusted only to the actual form limit |
| Source repository | Published https://github.com/EazyHood/sourcebrief ; first commit `cb36790`, verified release `1616f17` |
| Website | Verified https://eazyhood.github.io/sourcebrief/ ; static recorded demo |
| Project social profile | Optional in the saved Earn form; no project profile verified |
| Presentation | Verified https://eazyhood.github.io/sourcebrief/presentation.html ; 2:34 English 1080p video, public playback/seek/pause checked |
| Official Colosseum submission | Not submitted; do not answer Yes without its receipt |
| Panta Earn submission | Not submitted; publishing the project is not an entry receipt |
| Colosseum project/profile links | Pending verified official entry, subject to the one-product/team gate |

Colosseum acceptance and the existing product/team slot remain gates. Do not create a competing entry to make this draft appear complete. A Panta Earn entry cannot substitute for the official Colosseum submission.

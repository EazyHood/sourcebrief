# Sourcebrief — requirements and evidence map

Prepared 2 October 2026. Root subsequently checked and saved the official CWF rules and Colosseum terms. No registration, publication or submission was performed. This is an internal readiness map, not a predicted score or chance of winning.

## Source register and precedence

| Ref | Saved evidence | Official source / scope |
|---|---|---|
| P1 | `outputs/superteam-roundup-2026-10-02/listing-evidence.json`, record `panta-api-side-track`, captured `2026-10-02T13:30:42.9771117Z` | [Panta sidetrack listing](https://superteam.fun/earn/listing/panta-api-side-track/) and its saved official listing response; eligibility, criteria, rewards and form fields |
| P2 | `outputs/panta-preflight-2026-10-02/guides-terms-of-use.md`; effective date 7 September 2026 | [Panta API terms](https://docs.panta.market/guides/terms-of-use.md); attribution, access, display and operational obligations |
| P3 | `outputs/panta-preflight-2026-10-02/quickstart.md`, market list/detail documents and `sources.json` | [Quickstart](https://docs.panta.market/quickstart.md), [catalogue endpoint](https://docs.panta.market/api-reference/markets/list.md), [detail endpoint](https://docs.panta.market/api-reference/markets/get.md) |
| C1 | `outputs/panta-preflight-2026-10-02/PREFLIGHT.md` | Saved research summary pointing to [Colosseum FAQ](https://colosseum.com/hackathon#faqs): one product/team per participant and declaration of prior code. Full official PDFs subsequently saved under `outputs/panta-preflight-2026-10-02/rules/`, with URLs and hashes in `sources.json`. |
| S1 | `outputs/superteam-roundup-2026-10-02/execution-state.json`; timestamp `2026-10-02T13:35:33.1824147Z` | Historical execution status, not competition rules. Its earlier lack-of-key/live-access entries were superseded by actual later captures. Its official registration/product-slot gates remain pending in the current brief. |
| E1 | Project `docs/PROVENANCE.md`, `fixtures/panta-recording-2026-10-02.json`, and preflight `live-results/` | Actual later authorized production GET captures; not a competition-rule source |

The old preflight statements that authenticated live access was unproved, or that resolution fields were unavailable, must not be used as current findings. The actual captures and current provenance note supersede them. They do not, by themselves, prove entry eligibility or submission.

## Prize and deadline record

P1 records **5,000 USDG**, allocated as 2,000 / 1,000 / 1,000 / 1,000. This is a token-denominated competitive prize pool, not API credits or a payment already earned. The saved deadline is **13 October 2026 at 06:59 UTC**, equivalent to **13 October at 01:59 in Colombia**. Do not assume that this timestamp replaces any earlier global Colosseum cutoff; confirm the global deadline and final portal state before release.

No trustworthy personal probability follows from slots divided by submissions. The source set supplies neither competitor-quality scores nor a calibrated selection model.

## Mandatory gates

Status terms: **Evidence ready** = local supporting artefact exists; **Partial** = implementation or documentation exists but a required access/QA step is pending; **Pending** = prerequisite unconfirmed. These labels are not an organizer's eligibility judgment.

| Requirement / source | Evidence in this candidate | Status and next step |
|---|---|---|
| Official CWF registration and eligibility; P1 delegates to global rules | Current brief and C1 record the gate | **Pending:** organizer terms/registration acceptance and current complete global eligibility check. Global listing status alone is insufficient. |
| One official product/team for the participant; C1 | No second product created by this preparation | **Pending:** inspect the participant's existing official slot. Do not submit Sourcebrief as a competing product without resolving that slot. |
| Prior-work disclosure; C1 | DRAFT AI/prior-work section and local provenance | **Partial:** verify repository history, incorporated materials and final form wording; no blanket claim that all prior work is permitted. |
| Meaningful Panta integration; P1 | Catalogue/detail adapter, five captured market details, provenance-aware brief and exported data | **Evidence ready:** current local implementation depends on Panta data. Add the final evaluator-accessible demonstration. |
| Functional demonstration or strong prototype; P1 | Implemented local journey, offline recording, test files and README | **Partial:** live/browser QA is complete; see `docs/QA-2026-10-02.md`. Public access and final demo recording remain pending. |
| Explanation of product problem and integration; P1 | DRAFT short description, user scenario and architecture | **Evidence ready:** reconcile wording with final build. |
| English entry; P1 | DRAFT, this matrix and demo narration are English | **Evidence ready:** final fields and video also need English. |
| Both official CWF and Panta Earn submissions; P1 | No receipt claimed | **Pending:** official submission first/verified, then accurate Earn form and separate confirmation. Neither registration nor a public repo is a submission receipt. |
| Required Earn information: name, description, source link, presentation link, official-submission answer; P1 | Text prepared; script prepared | **Partial:** repository and finished presentation URLs are missing; official answer cannot yet be Yes. |
| Optional website, social and Colosseum links; P1 | No invented destinations | **Pending where useful:** omit optional unverified URLs rather than fabricating them. |
| Accurate Panta attribution and display; P2 §§5–8 | UI links “Powered by Panta”; mode, capture time and source/status visible | **Evidence ready locally:** inspect attribution/readability in the published version; no sponsorship claim. |
| Credential protection and usage constraints; P2 §§3–4 | Server-only key, fixed host/GET allowlist, budgets, limits and no polling | **Evidence ready locally:** hosting review and account terms remain operator responsibilities. No claim of security certification. |
| AI/originality policy and licensing | AI assistance disclosed; independent application code; provider data acknowledged | Official CWF rules were read and saved; no explicit AI clause was found there. This is not organizer approval of this candidate. Disclose assistance and check any additional final-form declarations. |

## Judging criteria — official categories, no weights published in P1

The six categories below are paraphrased from P1. The listing gives no numerical weights; equal weights would also be an invention. External adoption is a judging factor even though P1 does not make existing users an explicit registration requirement.

| Criterion | Specific claim to demonstrate | Best local evidence / planned demo moment | Limit or remaining work |
|---|---|---|---|
| Meaningfulness of Panta integration | The market brief is built from Panta's catalogue and detail; the source affects every output | `src/panta.mjs`, `src/normalize.mjs`, real recording and provenance; demo 0:15–1:22 | Need final live/evaluator route. Recorded replay alone must never be narrated as a fresh API call. |
| Engineering and functionality | Supported fields retain their meaning through capture, comparison and export | Adapter/transport/HTTP tests; `public/evidence.mjs`; tests for null vs zero, scale isolation, decimal equivalence, timestamp-only changes and safe export; demo 1:22–2:35 | Automated coverage does not prove production readiness or universal correctness. Record final version and complete test result. |
| Usability and product clarity | A reader can inspect the available evidence and hand off a dated brief | `public/index.html`, `styles.css`, `app.mjs`; implemented read/save/refresh/export sequence | Visual and responsive checks recorded in `docs/QA-2026-10-02.md`; comprehensive assistive-technology audit and measured usability study not performed. |
| Distinctive use case | A provenance-aware before/after evidence packet serves a review task rather than merely exposing API operations | DRAFT comparison framing; saved checkpoint and export of both captures | No exhaustive competitor audit; avoid “first”, “only” or unsupported claims about features the Panta playground lacks. |
| Potential utility beyond the event | A repeatable editorial/research review can retain what underlay an interpretation | Defined initial user and concrete Markdown/JSON output | Utility hypothesis only. No validated demand, business model or time savings; public hosting and further user research remain. |
| Actual adoption or early usage | Report genuine external use if any occurs | No such evidence in this preparation | **Gap:** no users, interviews, retention, revenue or external endorsements measured. Tests and our own demo do not count as traction. |

## Demonstration and validation evidence plan

| Assertion | Discriminating check | Where to retain proof |
|---|---|---|
| Provider wording is preserved | Compare actual detail to brief; inspect visible truncation warning where bounded | Capture + JSON export for same market ID/version |
| Capture time is not refresh time | Replay recorded data, refresh and show unchanged original timestamp/mode | Recorded demo with visible original capture time |
| A checkpoint survives reload | Save, reload same origin and market, read checkpoint date | Browser QA result and short uninterrupted demo sequence |
| Metadata is not a market-data change | Two test records differ only in capture metadata; diff is empty | Existing frontend test, recorded command/result with commit |
| Exact numbers remain meaningful | Zero remains zero; `0.50` equals `0.5`; nearby high-precision decimals differ | Existing frontend/normalizer tests |
| Real field changes show both sides | Controlled synthetic resolution-text change yields separate before/after values | Existing frontend test; label any displayed scenario **synthetic test** |
| Provider outcome is not a trading quote | Actual captured resolved record has `resolved_outcome`, complete status and zero/one values | UI/export of that saved record with correct labels |
| Failure does not create fresh evidence | Failed refresh leaves previous capture date and clear error | Final browser QA; do not manufacture a live outage claim |

Root ran the complete final suite: **43 passed, 0 failed**. The browser QA note records actual live reads, file exports, persistence and controlled local connection failure. No subset totals are added together.

## Release checklist

- [ ] Resolve global rules/terms, AI disclosure, prior-work rules, global cutoff and existing product/team slot without creating a second competing entry.
- [x] Finish browser/live validation and reconcile all claims with the final build; see QA note.
- [ ] Recheck material organizer updates and the final form before any send.
- [ ] Verify public source/demo access as an evaluator; make key/fixture licence/hosting decisions explicit.
- [ ] Record the English video and verify sharp source captures, actual duration and both mode/capture labels.
- [ ] Fill only real URLs and verified official-submission answers.
- [ ] Preserve the exact commit, artefacts, text, timestamps and independent receipts for both portals.

Until those gates are met, the correct state is **prepared local candidate**, not submitted, accepted, awarded or paid.

## Official global-rule update

CWF sections 5–8 specify the October 12, 2026 23:59 Pacific cutoff (October 13, 01:59 Colombia), registration for each member, one team per entrant and one project per team. Section 12 requires English content. The six global criteria cover functionality, potential impact, novelty, UX, open source and business plan. No explicit AI clause was found in the PDF. See the saved official document; check additional final-form declarations.

Colosseum Terms, Acceptable Use §10, restrict automated service access. The owner has therefore been asked to perform the account/registration check manually and report the existing CWF project/team. Terms acceptance and the slot remain unconfirmed. This limits portal operation, not local software preparation.

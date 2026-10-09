# Sourcebrief — requirements and evidence map

Updated 2 October 2026. The official CWF rules and Colosseum terms were read and saved. The repository, recorded demo and presentation are published and browser-verified. The user confirms that he has no project currently entered in CWF. Official login/registration and submission receipts remain pending. This is an internal readiness map, not a predicted score or chance of winning.

Verified links: [source repository](https://github.com/EazyHood/sourcebrief), [recorded demo](https://eazyhood.github.io/sourcebrief/), [2:34 presentation](https://eazyhood.github.io/sourcebrief/presentation.html). Public release checked: `1616f17`; initial repository commit: `cb36790`; successful Pages deployment: `37015736379`.

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
| One official product/team for the participant; C1 | User confirms no project currently entered in CWF | **Confirmed by user:** no known competing project. Complete the official registration as one participant/team with one project; the declaration is not a portal receipt. |
| Prior-work disclosure; C1 | DRAFT AI/prior-work section and local provenance | **Partial:** verify repository history, incorporated materials and final form wording; no blanket claim that all prior work is permitted. |
| Meaningful Panta integration; P1 | Catalogue/detail adapter, five captured market details, provenance-aware brief and exported data | **Evidence ready:** Panta-dependent local live integration and verified public recorded demonstration. Keep the indirect Solana/Panta relationship and replay mode explicit. |
| Functional demonstration or strong prototype; P1 | Implemented journey, recorded public demo, local live mode, test files and README | **Evidence ready:** local live/browser QA and public evaluator checks are complete; see `docs/QA-2026-10-02.md`. The hosted video plays and responds to tested controls; no listening audit is claimed. |
| Explanation of product problem and integration; P1 | DRAFT short description, user scenario and architecture | **Evidence ready:** reconcile wording with final build. |
| English entry; P1 | DRAFT, this matrix and demo narration are English | **Evidence ready:** final fields and video also need English. |
| Both official CWF and Panta Earn submissions; P1 | No receipt claimed | **Pending:** official submission first/verified, then accurate Earn form and separate confirmation. Neither registration nor a public repo is a submission receipt. |
| Required Earn information: name, description, source link, presentation link, official-submission answer; P1 | Text prepared; repository and presentation URLs verified | **Partial:** assets ready; official submission answer remains No until CWF submission is completed and confirmed. |
| Optional website, social and Colosseum links; P1 | Website verified; no invented destinations | **Website ready:** omit unverified social/profile URLs; add Colosseum link only after the official entry exists. |
| Accurate Panta attribution and display; P2 §§5–8 | UI links “Powered by Panta”; mode, capture time and source/status visible | **Evidence ready:** public recorded labels/readability checked; no sponsorship or independent-verification claim. |
| Credential protection and usage constraints; P2 §§3–4 | Server-only key, fixed host/GET allowlist, budgets, limits and no polling | **Evidence ready locally:** hosting review and account terms remain operator responsibilities. No claim of security certification. |
| AI/originality policy and licensing | AI assistance disclosed; independent application code; provider data acknowledged | Official CWF rules were read and saved; no explicit AI clause was found there. This is not organizer approval of this candidate. Disclose assistance and check any additional final-form declarations. |

## Judging criteria — official categories, no weights published in P1

The six categories below are paraphrased from P1. The listing gives no numerical weights; equal weights would also be an invention. External adoption is a judging factor even though P1 does not make existing users an explicit registration requirement.

| Criterion | Specific claim to demonstrate | Best local evidence / planned demo moment | Limit or remaining work |
|---|---|---|---|
| Meaningfulness of Panta integration | The market brief is built from Panta's catalogue and detail; the source affects every output | `src/panta.mjs`, `src/normalize.mjs`, real recording and provenance; public demo and hosted video | Local live route and public evaluator route verified. Recorded replay must never be narrated as a fresh API call or direct independent on-chain validation. |
| Engineering and functionality | Supported fields retain their meaning through capture, comparison and export | Adapter/transport/HTTP tests; `public/evidence.mjs`; tests for null vs zero, scale isolation, decimal equivalence, timestamp-only changes and safe export; demo 1:22–2:35 | Automated coverage does not prove production readiness or universal correctness. Record final version and complete test result. |
| Usability and product clarity | A reader can inspect the available evidence and hand off a dated brief | `public/index.html`, `styles.css`, `app.mjs`; implemented read/save/refresh/export sequence | Visual and responsive checks recorded in `docs/QA-2026-10-02.md`; comprehensive assistive-technology audit and measured usability study not performed. |
| Distinctive use case | A provenance-aware before/after evidence packet serves a review task rather than merely exposing API operations | DRAFT comparison framing; saved checkpoint and export of both captures | No exhaustive competitor audit; avoid “first”, “only” or unsupported claims about features the Panta playground lacks. |
| Potential utility beyond the event | A repeatable editorial/research review can retain what underlay an interpretation | Defined initial user and concrete Markdown/JSON output | Utility hypothesis only. Public demo exists; validated demand, business model, time savings and further user research remain absent. |
| Actual adoption or early usage | Report genuine external use if any occurs | No such evidence in this preparation | **Gap:** no users, interviews, retention, revenue or external endorsements measured. Tests and our own demo do not count as traction. |

## Demonstration and validation evidence plan

| Assertion | Discriminating check | Where to retain proof |
|---|---|---|
| Provider wording is preserved | Compare actual detail to brief; inspect visible truncation warning where bounded | Capture + JSON export for same market ID/version |
| Capture time is not refresh time | Replay recorded data, refresh and show unchanged original timestamp/mode | Recorded demo with visible original capture time |
| A checkpoint survives reload | Save, reload same origin and market, read checkpoint date | Local/public browser QA and actual exported JSON; the video uses selected browser captures, not an uninterrupted recording |
| Metadata is not a market-data change | Two test records differ only in capture metadata; diff is empty | Existing frontend test, recorded command/result with commit |
| Exact numbers remain meaningful | Zero remains zero; `0.50` equals `0.5`; nearby high-precision decimals differ | Existing frontend/normalizer tests |
| Real field changes show both sides | Controlled synthetic resolution-text change yields separate before/after values | Existing frontend test; label any displayed scenario **synthetic test** |
| Provider outcome is not a trading quote | Actual captured resolved record has `resolved_outcome`, complete status and zero/one values | UI/export of that saved record with correct labels |
| Failure does not create fresh evidence | Failed refresh leaves previous capture date and clear error | Final browser QA; do not manufacture a live outage claim |

The complete suite passed **50 tests, 0 failed**. The browser QA note records actual local live reads, file exports, persistence, controlled local connection failure and public-site checks. The public downloaded JSON's brief and checkpoint separately passed the shared validator; both retain the same original recorded timestamp and compare with zero tracked changes. No subset totals are added together.

## Release checklist

- [ ] Complete official login/registration and consent, reconciling final declarations on AI, prior work and eligibility. The user confirms no existing CWF project; do not create a second competing entry.
- [x] Finish browser/live validation and reconcile all claims with the final build; see QA note.
- [ ] Recheck material organizer updates and the final form before any send.
- [x] Verify public source/demo access as an evaluator; preserve private keys outside the repository and distinguish MIT code from provider data.
- [x] Prepare the English video with original recorded-mode captures; verify actual 154.067-second duration, 1920×1080 output and hosted playback/seek/pause. No listening audit or optional VTT-selection check is claimed.
- [ ] Fill only real URLs and verified official-submission answers.
- [ ] Preserve the exact commit, artefacts, text, timestamps and independent receipts for both portals.

The correct state is **published and browser-verified candidate, not officially submitted**, accepted, awarded or paid.

## Official global-rule update

CWF sections 5–8 specify the October 12, 2026 23:59 Pacific cutoff (October 13, 01:59 Colombia), registration for each member, one team per entrant and one project per team. Section 12 requires English content. The six global criteria cover functionality, potential impact, novelty, UX, open source and business plan. No explicit AI clause was found in the PDF. See the saved official document; check additional final-form declarations.

Colosseum Terms, Acceptable Use §10, restrict automated service access. The user confirms no project currently entered in CWF; this resolves the previously unknown competing-project declaration. Official login/registration/consent and receipts remain pending and are separate from that confirmation. This portal constraint does not prevent local preparation.

The saved CWF PDF does not specify video length, number of video links, required video hosting platform, interview format or a prior-code ban. Those requirements must be checked in the actual official form or other applicable official instructions; the internal checklist's pitch/demo targets are not clauses of this PDF. CWF §14(e) describes the Solana award as for products integrating with Solana. Sourcebrief consumes Panta's Solana-market data via its API; it does not deploy a Solana program, sign transactions or independently query/verify chain state. Describe that integration accurately, without claiming the jury has already accepted it for a track.

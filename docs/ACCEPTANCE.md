# Acceptance before submission

## Core behavior

- Catalogue fetched from Panta; empty titles clearly labeled and replaced only after real detail is obtained. Search/filter explicitly apply to loaded records.
- Exact provider resolution wording (or clearly marked truncation), source identifiers, UTC dates, normalized prices, separate volume fields and response provenance appear in the brief.
- Checkpoint persists across reload, and corrupt storage causes a recoverable notice, not a crash.
- Compare only compatible snapshots of the same market. Timestamp-only changes and decimal formatting changes are unchanged; a real controlled field difference has explicit before/after. A synthetic test is clearly identified as such.
- JSON and Markdown exports retain original capture time, source mode, provenance and checkpoint differences. Provider content cannot inject HTML or executable Markdown links.
- Network failure leaves the earlier evidence and its original timestamp visible alongside the failure. Recording refresh never becomes live.

## Safety and quality

- Backend only calls allowlisted GET routes on the Panta production API; it does not follow redirects or forward secrets to browser assets/errors.
- Bounded response sizes, timeouts, cache, concurrency and request budget are covered by tests. No automatic polling.
- Verify keyboard navigation, visible focus, reduced motion, loading, empty/error states and 375/768/1280px layouts. Inspect actual screenshots; do not present untested polish claims.

## Competition gates

- [x] Panta live read access demonstrated.
- [ ] Colosseum terms/registration approval answered.
- [ ] Existing Colosseum product/team slot inspected; exactly one product/team.
- [ ] Local implementation and tests complete.
- [ ] Accessible deployed demonstration and public source repository reviewed.
- [ ] English pitch (2–3min) and product demonstration (<=3min), with sharp captures.
- [ ] Official Colosseum submission confirmed and version recorded.
- [ ] Separate Panta Earn submission confirmed and version recorded.

No prize, eligibility adjudication or payment is claimed. Mermail must independently pass its live attachment-download gate before production work or submission.

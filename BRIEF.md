# Sourcebrief — Panta market evidence, before interpretation

Status: local candidate in development, not submitted. Panta API access was proved on 2026-10-02. Colosseum acceptance and the user's single-project slot are still pending; do not register, publish or claim eligibility from this folder alone.

For researchers and community editors examining a prediction-market claim, turn a Panta market into a readable, timestamped evidence brief: exact resolution wording, source identifiers, event dates, normalized price fields, and explicit missing information. Save a local checkpoint, refresh, and see which facts changed. Export the evidence for review. This is a reading/research tool, with no trading, wallet, advice, prediction, automated monitoring, or authenticity certification.

Observed live evidence is in ../../outputs/panta-preflight-2026-10-02/live-results/. It shows that list records can omit titles recovered by detail, that detail exposes resolutionRule/sources/oracle, and that raw secondary prices use a different scale from normalized yesPrice/noPrice. Do not repeat the older documentation's claim that those fields never exist. Preserve exact provider wording. Source identifiers are NOT verified source URLs. Volume fields are distinct; don't equate them to liquidity or sum them.

Core journey: load catalogue → choose one market → inspect evidence and gaps → save local checkpoint → refresh → compare fields → export a dated JSON/Markdown brief. All information comes from the Panta API, or from an explicitly marked recording of that API. No invented market data, user traction, latency figures, guarantees, or winner claims.

Constraints: Node built-ins and ordinary browser JS/CSS, no large dependencies; English deliverable; warm editorial visual style in brand.md. Source data always rendered as text. Credentials live outside this repository and must never appear in browser assets, exports, logs or Git. GET-only allowlisted backend, bounded requests, conservative cache and shared request budget. No automatic paid plan activation. API host is https://live-api.panta.market only. Never forward credentials through redirects. Attribution Powered by Panta links to https://panta.market.

Competition evidence: working integration, useful distinction from raw API/playground, tested edge cases, accurate source labels, reproducibility, refined responsive design. Current prototype has no demonstrated users or revenue. Mermail is a separate candidate blocked on its login; don't claim Mermail integration here.

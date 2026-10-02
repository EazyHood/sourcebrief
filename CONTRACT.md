# Frozen frontend/backend contract v1

Backend serves public/ on localhost; `node server.mjs`, default port 5186. `npm test` runs node:test. No npm dependencies required. PANTA_API_KEY or PANTA_KEY_FILE configures secret on server only; default no key means 503 and an actionable setup error. PANTA_RECORDING_FILE can optionally provide a saved probe report; all returned provenance then mode `recorded`, never `live`. Default is live when key is supplied. PORT and HOST accepted, default 127.0.0.1. API routes only GET; unsupported methods 405.

GET /api/catalog?limit=20&cursor=... → {items:[{id,title,category,phase,endAt}],nextCursor:string|null,provenance}. `title` can be empty; frontend uses a clearly generic fallback. Categories in UI derived from loaded items, no invented choices. `limit` integer 1..20. `cursor` opaque but bounded 512 characters. Search/filter apply to loaded records only and say so. No automatic fetch-all.

GET /api/brief/:id → Brief as below. Force refresh via ?refresh=1 may bypass response cache but NEVER budget or rate limits. IDs are valid Solana base58 32-byte public keys.

Brief = {
 version:1,
 id:string,title:string,description:string,category:string,phase:string,
 rule:{text:string,sources:string[]},
 timeline:{startAt:string|null,endAt:string|null,resolutionAt:string|null},
 prices:{yes:string|null,no:string|null,source:string,valuationStatus:string},
 volume:{reported:string|null,total:string|null,currency:'USDC'},
 checks:[{code:string,status:'present'|'missing'|'attention',label:string,detail:string,field:string}],
 provenance:{provider:'Panta',mode:'live'|'recorded',fetchedAt:ISO,requestId:string|null,endpoint:string,cached:boolean},
 providerFields:{oracle:string|null,resolved:boolean|null}
 }

Normalization accepts only explicit fields, never creates provider claims. Dates finite seconds or timezone-qualified ISO only. Prices valid decimal strings in [0,1], no floating-point display rounding or scientific notation. Zero is valid. Sources are identifier strings, not inferred links. Prefer top-level resolutionRule and sources, fallback onChain when absent. Document any conflict. Provider text bounded safely. Model reports missing title/rule/sources/date/price, inconsistent chronology, absent price provenance, or raw secondary scale difference without asserting fraud/safety. No arbitrary quality score.

API errors: non-2xx JSON {error:{code,message,retryAfterSeconds?}}. No secret, upstream raw body, stack, account details or request header in errors. A 429 includes Retry-After. Fetch timeout <=12 sec. Don't follow redirects. Response size bounded. Initial budget conservative (60 upstream requests/hour per server instance), at most 2 concurrent requests; one-minute cache. Zero background polling. Browser must never choose upstream URL.

Local checkpoint in browser: persist a validated complete Brief under sourcebrief:v1:<id>; tolerate storage failure and corrupted JSON. Never silently import arbitrary source shapes. Comparing uses exact tracked rule/sources, normalized price values, dates, phase, and separate volume fields; ignores timestamps/requestIds. Compare only same id/version; show before/after and saved capture time. Export JSON includes source and capture date; export Markdown escapes markup for provider strings. Data must be rendered with textContent or equivalent safe nodes, never interpolated into innerHTML.

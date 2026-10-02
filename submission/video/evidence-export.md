# Sourcebrief

## Manchester United will win against Spurs with 2 or more goals

Market ID: 4J6WxFGuCw9deMJ6pQ7gwpVXCvLorMrz28icSnCYWeGB

Provider: Panta · Mode: recorded · Cached: no

Captured at: 2026\-10\-02T13:39:16\.536Z

Exported at: 2026\-10\-02T13:47:45\.949Z

Endpoint: https://live\-api\.panta\.market/api/v1/markets/4J6WxFGuCw9deMJ6pQ7gwpVXCvLorMrz28icSnCYWeGB/

## 01 · Resolution evidence

Manchester United are will win against Spurs with 2 or more goals

### Source identifiers supplied by Panta

- https://www\.espn\.com
- https://www\.bbc\.com/sport
- https://www\.premierleague\.com

These are identifiers, not independently verified source URLs.

## 02 · Recorded fields

Normalized 0–1 scale\. A quoted price is not a forecast, a recommendation or an executable trade\.

**Description:** Not supplied

**Category:** sports

**Phase:** secondary

**Start date:** 2026\-10\-02T03:30:00\.000Z

**End date:** 2026\-10\-10T20:00:00\.000Z

**Resolution date:** 2026\-10\-10T20:00:00\.000Z

**YES indicative unit price:** 0\.518009008

**NO indicative unit price:** 0\.481990992

**Price source:** secondary\_last\_trade

**Price valuation status:** indicative

**Reported volume (USDC):** 11

**Total volume (USDC):** 16

**Oracle identifier:** https://www\.espn\.com,https://www\.bbc\.com/sport,https://www\.premierleague\.com

**Resolved flag:** false

## 03 · Information checks

- **present · Title:** Supplied by the provider; not independently verified\. (title)
- **present · Resolution wording:** Supplied by the provider; not independently verified\. (rule\.text)
- **present · Source identifiers:** Provider\-supplied identifiers; source URLs and authority are not verified\. (rule\.sources)
- **present · Start date:** Provider date, normalized to UTC\. (timeline\.startAt)
- **present · End date:** Provider date, normalized to UTC\. (timeline\.endAt)
- **present · Resolution date:** Provider date, normalized to UTC\. (timeline\.resolutionAt)
- **present · YES indicative unit price:** Explicit provider last\-trade value, labeled indicative; not an executable quote or a forecast\. Provider valuation status: indicative\. (prices\.yes)
- **present · NO indicative unit price:** Explicit provider last\-trade value, labeled indicative; not an executable quote or a forecast\. Provider valuation status: indicative\. (prices\.no)
- **present · Price provenance:** Provider\-supplied price source\. (prices\.source)
- **attention · Raw secondary price uses a different scale:** secondaryYesPrice is outside 0 to 1 and was not used as a unit price\. No scale conversion was assumed\. (prices\.yes)
- **attention · Raw secondary price uses a different scale:** secondaryNoPrice is outside 0 to 1 and was not used as a unit price\. No scale conversion was assumed\. (prices\.no)

## 04 · Local checkpoint comparison

Checkpoint captured at: 2026\-10\-02T13:39:16\.536Z · Mode: recorded

No tracked data differences between these captures. Timestamps, request IDs and derived checks are excluded.

---

Panta-supplied market data. Source identifiers are not verified URLs. Values must be read with their provider source and valuation status, not as advice or predictions.

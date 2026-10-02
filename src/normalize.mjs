import { badUpstream } from './errors.mjs';

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const own = (object, key) => Object.hasOwn(object, key);
export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function isSolanaId(value) {
  if (typeof value !== 'string' || value.length < 32 || value.length > 44) return false;
  let number = 0n;
  for (const char of value) {
    const digit = BASE58.indexOf(char);
    if (digit < 0) return false;
    number = number * 58n + BigInt(digit);
  }
  let size = 0;
  while (number > 0n) { size++; number >>= 8n; }
  return size + (value.match(/^1*/)?.[0].length ?? 0) === 32;
}

export function normalizeDate(value) {
  let milliseconds;
  if (typeof value === 'number' && Number.isFinite(value)) {
    milliseconds = value * 1000;
  } else if (typeof value === 'string' && value.length <= 40) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!match) return null;
    const [, y, m, d, h, min, sec, , zone] = match;
    const year = Number(y), month = Number(m), day = Number(d);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month < 1 || month > 12 || day < 1 || day > days[month - 1]
      || Number(h) > 23 || Number(min) > 59 || Number(sec) > 59) return null;
    if (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59)) return null;
    milliseconds = Date.parse(value);
  } else return null;
  // Four-digit-year dates keep browser validation and export formats consistent.
  if (!Number.isFinite(milliseconds) || milliseconds < -62167219200000
      || milliseconds > 253402300799999) return null;
  return new Date(milliseconds).toISOString();
}

export function decimal(value, unit = false) {
  if (typeof value !== 'string' || value.length > 100 || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  let [integer, fraction = ''] = value.split('.');
  integer = integer.replace(/^0+(?=\d)/, '');
  fraction = fraction.replace(/0+$/, '');
  if (unit && (integer.length > 1 || integer > '1' || (integer === '1' && fraction))) return null;
  return integer + (fraction ? '.' + fraction : '');
}

export function isProviderTestMode(value) {
  const text = isObject(value) ? value.disclaimer : null;
  return typeof text === 'string' && text.replace(/\s+/g, ' ').trim().toLowerCase()
    === 'test mode: this response uses sandbox fixtures and does not access solana mainnet.';
}

export function normalizeProvenance(input) {
  if (!isObject(input) || !['live', 'recorded'].includes(input.mode)
      || !normalizeDate(input.fetchedAt) || typeof input.endpoint !== 'string'
      || !input.endpoint.startsWith('https://live-api.panta.market/api/v1/')) throw badUpstream();
  return { provider: 'Panta', mode: input.mode, fetchedAt: normalizeDate(input.fetchedAt),
    requestId: typeof input.requestId === 'string' ? input.requestId.slice(0, 200) : null,
    endpoint: input.endpoint, cached: input.cached === true };
}

export function normalizeCatalog(payload, provenance, limit = 20) {
  if (!isObject(payload) || !Array.isArray(payload.items) || payload.items.length > limit
      || payload.items.some(item => !isObject(item) || !isSolanaId(item.marketId))) throw badUpstream();
  if (payload.nextCursor != null && (typeof payload.nextCursor !== 'string'
      || payload.nextCursor.length > 512 || /[\u0000-\u001f\u007f]/.test(payload.nextCursor))) throw badUpstream();
  const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
  return { items: payload.items.map(item => ({ id: item.marketId,
    title: text(item.title, 500), category: text(item.category, 80), phase: text(item.phase, 80),
    endAt: normalizeDate(item.endTime) })), nextCursor: payload.nextCursor ?? null,
    provenance: normalizeProvenance(provenance) };
}

export function normalizeBrief(payload, expectedId, provenance) {
  if (!isObject(payload) || !isSolanaId(expectedId) || payload.marketId !== expectedId) throw badUpstream();
  const checks = [];
  const check = (code, status, label, detail, field) => checks.push({ code, status, label, detail, field });
  const text = (value, max, field) => {
    if (typeof value !== 'string') return '';
    if (value.length > max) check('TEXT_TRUNCATED', 'attention', 'Provider text is truncated',
      `Only the first ${max} characters are shown; the full wording is not represented.`, field);
    return value.slice(0, max);
  };
  const chain = isObject(payload.onChain) ? payload.onChain : {};
  const fallback = name => payload[name] == null ? chain[name] : payload[name];
  const title = text(payload.title, 500, 'title');
  const description = text(payload.description, 12000, 'description');
  const ruleText = text(fallback('resolutionRule'), 16000, 'rule.text');
  const rawSources = fallback('sources');
  const sources = Array.isArray(rawSources) ? rawSources.filter(x => typeof x === 'string')
    .slice(0, 32).map(x => text(x, 512, 'rule.sources')) : [];
  if (Array.isArray(rawSources) && (rawSources.length > 32 || rawSources.some(x => typeof x !== 'string')))
    check('SOURCES_PARTIAL', 'attention', 'Source list is incomplete',
      'Unsupported entries or entries beyond the 32-item limit are omitted.', 'rule.sources');
  for (const [name, field] of [['resolutionRule', 'rule.text'], ['sources', 'rule.sources']]) {
    if (own(payload, name) && payload[name] != null && own(chain, name) && chain[name] != null
      && JSON.stringify(payload[name]) !== JSON.stringify(chain[name]))
      check('PROVIDER_FIELD_CONFLICT', 'attention', 'Provider fields disagree',
        `Top-level ${name} differs from onChain.${name}; the top-level value is displayed.`, field);
  }
  for (const [present, label, field, code] of [[title.trim(), 'Title', 'title', 'TITLE'],
    [ruleText.trim(), 'Resolution wording', 'rule.text', 'RULE'],
    [sources.some(x => x.trim()), 'Source identifiers', 'rule.sources', 'SOURCES']])
    check(code, present ? 'present' : 'missing', label,
      present ? (code === 'SOURCES' ? 'Provider-supplied identifiers; source URLs and authority are not verified.'
        : 'Supplied by the provider; not independently verified.') : 'Not supplied in a supported field.', field);
  const timeline = {};
  for (const [source, target] of [['startTime', 'startAt'], ['endTime', 'endAt'], ['resolutionTime', 'resolutionAt']]) {
    const normalized = normalizeDate(payload[source]);
    timeline[target] = normalized;
    check(source.toUpperCase(), normalized ? 'present' : payload[source] == null ? 'missing' : 'attention',
      target === 'resolutionAt' ? 'Resolution date' : target === 'endAt' ? 'End date' : 'Start date',
      normalized ? 'Provider date, normalized to UTC.' : 'Missing or invalid timezone-qualified date/Unix seconds.', `timeline.${target}`);
    if (normalized && normalizeDate(chain[source]) && normalized !== normalizeDate(chain[source]))
      check('PROVIDER_FIELD_CONFLICT', 'attention', 'Provider dates disagree',
        `Top-level ${source} differs from onChain.${source}; the top-level value is displayed.`, `timeline.${target}`);
  }
  if ((timeline.startAt && timeline.endAt && timeline.startAt > timeline.endAt)
      || (timeline.endAt && timeline.resolutionAt && timeline.endAt > timeline.resolutionAt)
      || (timeline.startAt && timeline.resolutionAt && timeline.startAt > timeline.resolutionAt))
    check('CHRONOLOGY_CONFLICT', 'attention', 'Dates are inconsistent',
      'Start, end and resolution dates are not in chronological order.', 'timeline');
  const prices = { yes: decimal(payload.yesPrice, true), no: decimal(payload.noPrice, true),
    source: text(payload.priceSource, 128, 'prices.source'),
    valuationStatus: text(payload.valuationStatus, 128, 'prices.valuationStatus') };
  const isOutcome = prices.source === 'resolved_outcome';
  const isIndicative = prices.source === 'secondary_last_trade' && prices.valuationStatus === 'indicative';
  const valueLabel = isOutcome ? 'provider outcome value' : isIndicative ? 'indicative unit price' : 'normalized provider value';
  const valueContext = isOutcome
    ? 'Provider labels this as a resolved-outcome value, not a current trading quote or a forecast.'
    : isIndicative ? 'Explicit provider last-trade value, labeled indicative; not an executable quote or a forecast.'
      : 'Explicit normalized provider field; no trading-quote or outcome interpretation is inferred.';
  for (const [side, rawName] of [['yes', 'yesPrice'], ['no', 'noPrice']])
    check(`PRICE_${side.toUpperCase()}`, prices[side] !== null ? 'present' : payload[rawName] == null ? 'missing' : 'attention',
      `${side === 'yes' ? 'YES' : 'NO'} ${valueLabel}`, `${prices[side] !== null
        ? valueContext : 'Missing or unsupported decimal string in the range 0 to 1.'} Provider valuation status: ${prices.valuationStatus || 'not supplied'}.`, `prices.${side}`);
  check('PRICE_SOURCE', prices.source.trim() ? 'present' : 'missing', 'Price provenance',
    prices.source.trim() ? 'Provider-supplied price source.' : 'The provider did not supply a priceSource.', 'prices.source');
  for (const field of ['secondaryYesPrice', 'secondaryNoPrice']) {
    if (decimal(payload[field]) !== null && decimal(payload[field], true) === null)
      check('RAW_PRICE_SCALE', 'attention', 'Raw secondary price uses a different scale',
        `${field} is outside 0 to 1 and was not used as a unit price. No scale conversion was assumed.`, `prices.${field.includes('Yes') ? 'yes' : 'no'}`);
  }
  const resolved = typeof payload.resolved === 'boolean' ? payload.resolved : null;
  if (resolved !== null && typeof chain.isResolved === 'boolean' && resolved !== chain.isResolved)
    check('RESOLUTION_FLAG_CONFLICT', 'attention', 'Resolution flags disagree',
      'Top-level resolved differs from onChain.isResolved; no result was inferred.', 'providerFields.resolved');
  const volume = { reported: decimal(payload.volumeUsdc), total: decimal(payload.totalVolumeUsdc), currency: 'USDC' };
  for (const [raw, field] of [['volumeUsdc', 'reported'], ['totalVolumeUsdc', 'total']]) {
    if (payload[raw] != null && volume[field] === null) check('INVALID_VOLUME', 'attention',
      'Volume could not be normalized', `${raw} is not a supported non-negative decimal string.`, `volume.${field}`);
  }
  return { version: 1, id: expectedId, title, description,
    category: text(payload.category, 80, 'category'), phase: text(payload.phase, 80, 'phase'),
    rule: { text: ruleText, sources }, timeline, prices, volume, checks,
    provenance: normalizeProvenance(provenance),
    providerFields: { oracle: typeof payload.oracle === 'string' ? text(payload.oracle, 256, 'providerFields.oracle') : null,
      resolved } };
}

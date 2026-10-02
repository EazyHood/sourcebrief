const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const OWN = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, names) => record(value) && Object.keys(value).length === names.length && names.every((key) => OWN(value, key));
const text = (value, limit = 60000) => typeof value === 'string' && value.length <= limit;
const nullableText = (value, limit) => value === null || text(value, limit);
export const CHECKPOINT_PREFIX = 'sourcebrief:v1:';
export const MAX_CHECKPOINT_BYTES = 512000;
const withinStorageBudget = (value) => value.length <= MAX_CHECKPOINT_BYTES && new TextEncoder().encode(value).byteLength <= MAX_CHECKPOINT_BYTES;

export function isMarketId(value) {
  if (typeof value !== 'string' || value.length < 32 || value.length > 44) return false;
  let n = 0n;
  for (const letter of value) {
    const digit = ALPHABET.indexOf(letter);
    if (digit < 0) return false;
    n = n * 58n + BigInt(digit);
  }
  let bytes = 0;
  while (n > 0n) { bytes++; n >>= 8n; }
  const zeros = value.match(/^1*/)[0].length;
  return zeros + bytes === 32;
}

export function isTimestamp(value) {
  if (typeof value !== 'string') return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts || !Number.isFinite(Date.parse(value))) return false;
  const [year, month, day, hour, minute, second] = parts.slice(1).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] && hour < 24 && minute < 60 && second < 60;
}

function decimal(value) { return typeof value === 'string' && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) && value.length <= 120; }
export function isUnitPrice(value) { return value === null || (decimal(value) && /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(value)); }

function isProvenance(value) {
  return keys(value, ['provider', 'mode', 'fetchedAt', 'requestId', 'endpoint', 'cached']) && value.provider === 'Panta' &&
    ['live', 'recorded'].includes(value.mode) && isTimestamp(value.fetchedAt) && nullableText(value.requestId, 1024) &&
    text(value.endpoint, 2048) && typeof value.cached === 'boolean';
}

export function validateBrief(value) {
  if (!keys(value, ['version', 'id', 'title', 'description', 'category', 'phase', 'rule', 'timeline', 'prices', 'volume', 'checks', 'provenance', 'providerFields'])) return false;
  if (value.version !== 1 || !isMarketId(value.id) || !['title', 'description', 'category', 'phase'].every((k) => text(value[k]))) return false;
  if (!keys(value.rule, ['text', 'sources']) || !text(value.rule.text) || !Array.isArray(value.rule.sources) || value.rule.sources.length > 100 || !value.rule.sources.every((s) => text(s, 4096))) return false;
  if (!keys(value.timeline, ['startAt', 'endAt', 'resolutionAt']) || !Object.values(value.timeline).every((v) => v === null || isTimestamp(v))) return false;
  if (!keys(value.prices, ['yes', 'no', 'source', 'valuationStatus']) || !isUnitPrice(value.prices.yes) || !isUnitPrice(value.prices.no) || !text(value.prices.source, 4096) || !text(value.prices.valuationStatus, 4096)) return false;
  if (!keys(value.volume, ['reported', 'total', 'currency']) || ![value.volume.reported, value.volume.total].every((v) => v === null || decimal(v)) || value.volume.currency !== 'USDC') return false;
  if (!Array.isArray(value.checks) || value.checks.length > 100 || !value.checks.every((c) => keys(c, ['code', 'status', 'label', 'detail', 'field']) && ['present', 'missing', 'attention'].includes(c.status) && ['code', 'label', 'detail', 'field'].every((k) => text(c[k], 10000)))) return false;
  if (!isProvenance(value.provenance) || !keys(value.providerFields, ['oracle', 'resolved']) || !nullableText(value.providerFields.oracle, 4096) || ![null, true, false].includes(value.providerFields.resolved)) return false;
  return withinStorageBudget(JSON.stringify(value));
}

export function validateCatalog(value) {
  return keys(value, ['items', 'nextCursor', 'provenance']) && Array.isArray(value.items) && value.items.length <= 20 &&
    (value.nextCursor === null || text(value.nextCursor, 512)) && isProvenance(value.provenance) &&
    value.items.every((item) => keys(item, ['id', 'title', 'category', 'phase', 'endAt']) && isMarketId(item.id) &&
      ['title', 'category', 'phase'].every((key) => text(item[key])) && (item.endAt === null || isTimestamp(item.endAt)));
}

export function readCheckpoint(storage, id) {
  if (!isMarketId(id)) return { kind: 'invalid', brief: null };
  try {
    const raw = storage.getItem(CHECKPOINT_PREFIX + id);
    if (raw === null) return { kind: 'absent', brief: null };
    if (typeof raw !== 'string' || !withinStorageBudget(raw)) return { kind: 'invalid', brief: null };
    const value = JSON.parse(raw);
    if (!validateBrief(value) || value.id !== id) return { kind: 'invalid', brief: null };
    return { kind: 'saved', brief: value };
  } catch (error) {
    return { kind: error instanceof SyntaxError ? 'invalid' : 'unavailable', brief: null };
  }
}

export function saveCheckpoint(storage, brief) {
  if (!validateBrief(brief)) return { kind: 'invalid' };
  try { storage.setItem(CHECKPOINT_PREFIX + brief.id, JSON.stringify(brief)); return { kind: 'saved' }; }
  catch { return { kind: 'unavailable' }; }
}

const TRACKED = [
  ['title', 'Title'], ['description', 'Description'], ['category', 'Category'], ['phase', 'Phase'],
  ['rule.text', 'Resolution wording'], ['rule.sources', 'Source identifiers'],
  ['timeline.startAt', 'Start date'], ['timeline.endAt', 'End date'], ['timeline.resolutionAt', 'Resolution date'],
  ['prices.yes', 'YES indicative unit price'], ['prices.no', 'NO indicative unit price'], ['prices.source', 'Price source'], ['prices.valuationStatus', 'Price valuation status'],
  ['volume.reported', 'Reported volume (USDC)'], ['volume.total', 'Total volume (USDC)'],
  ['providerFields.oracle', 'Oracle identifier'], ['providerFields.resolved', 'Resolved flag'],
];
const at = (value, path) => path.split('.').reduce((node, key) => node[key], value);
const numericText = (value) => value === null ? null : value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
export function pricePresentation(brief) {
  const outcome = brief.prices.source === 'resolved_outcome';
  return {
    outcome,
    heading: outcome ? 'Provider outcome values' : 'Indicative unit prices',
    valueLabel: outcome ? 'provider outcome value' : 'indicative unit price',
    explanation: outcome
      ? `Panta labels these as resolved-outcome values (valuation status: ${brief.prices.valuationStatus || 'not supplied'}). They are not current trading quotes or a prediction.`
      : 'Normalized 0–1 scale. A quoted price is not a forecast, a recommendation or an executable trade.',
  };
}
function trackedLabel(field, label, brief) {
  return ['prices.yes', 'prices.no'].includes(field) ? `${field.endsWith('yes') ? 'YES' : 'NO'} ${pricePresentation(brief).valueLabel}` : label;
}
export function compareBriefs(before, after) {
  if (!validateBrief(before) || !validateBrief(after)) throw new TypeError('Only complete version 1 briefs can be compared.');
  if (before.id !== after.id || before.version !== after.version) throw new TypeError('The checkpoint belongs to a different market or version.');
  return TRACKED.flatMap(([field, label]) => {
    const oldValue = at(before, field), newValue = at(after, field);
    const numeric = ['prices.yes', 'prices.no', 'volume.reported', 'volume.total'].includes(field);
    const a = numeric ? numericText(oldValue) : oldValue, b = numeric ? numericText(newValue) : newValue;
    const comparedLabel = ['prices.yes', 'prices.no'].includes(field) && pricePresentation(before).outcome !== pricePresentation(after).outcome
      ? `${field.endsWith('yes') ? 'YES' : 'NO'} normalized value` : trackedLabel(field, label, after);
    return JSON.stringify(a) === JSON.stringify(b) ? [] : [{ field, label: comparedLabel, before: oldValue, after: newValue }];
  });
}

export function displayValue(value) {
  if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) return 'Not supplied';
  if (Array.isArray(value)) return value.join('\n');
  return String(value);
}

export function escapeMarkdown(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/([\\`*_{}\[\]()#+.!|~\-])/g, '\\$1').replace(/\r\n?/g, '\n');
}

export function exportEvidence(brief, checkpoint = null, exportedAt = new Date().toISOString()) {
  if (!validateBrief(brief) || !isTimestamp(exportedAt)) throw new TypeError('Cannot export an invalid brief or date.');
  const changes = checkpoint ? compareBriefs(checkpoint, brief) : null;
  return { document: 'Sourcebrief evidence record', version: 1, exportedAt,
    scope: 'Panta-supplied market data. Source identifiers are not verified URLs. Values must be read with their provider source and valuation status, not as advice or predictions.',
    priceInterpretation: pricePresentation(brief), brief: JSON.parse(JSON.stringify(brief)), checkpoint: checkpoint ? JSON.parse(JSON.stringify(checkpoint)) : null, changes };
}

export function exportMarkdown(brief, checkpoint = null, exportedAt = new Date().toISOString()) {
  const data = exportEvidence(brief, checkpoint, exportedAt), e = (v) => escapeMarkdown(displayValue(v));
  const lines = ['# Sourcebrief', '', `## ${e(brief.title || 'Untitled market')}`, '', `Market ID: ${e(brief.id)}`, '',
    `Provider: Panta · Mode: ${e(brief.provenance.mode)} · Cached: ${brief.provenance.cached ? 'yes' : 'no'}`, '',
    `Captured at: ${e(brief.provenance.fetchedAt)}`, '', `Exported at: ${e(exportedAt)}`, '', `Endpoint: ${e(brief.provenance.endpoint)}`, '',
    '## 01 · Resolution evidence', '', e(brief.rule.text), '', '### Source identifiers supplied by Panta', '',
    ...(!brief.rule.sources.length ? ['Not supplied'] : brief.rule.sources.map((s) => `- ${e(s)}`)), '',
    'These are identifiers, not independently verified source URLs.', '', '## 02 · Recorded fields', ''];
  lines.push(e(pricePresentation(brief).explanation), '');
  for (const [field, label] of TRACKED.filter(([field]) => !['title', 'rule.text', 'rule.sources'].includes(field))) lines.push(`**${trackedLabel(field, label, brief)}:** ${e(at(brief, field))}`, '');
  lines.push('## 03 · Information checks', '');
  for (const check of brief.checks) lines.push(`- **${e(check.status)} · ${e(check.label)}:** ${e(check.detail)} (${e(check.field)})`);
  if (!brief.checks.length) lines.push('No checks supplied. This is not evidence of completeness.');
  lines.push('', '## 04 · Local checkpoint comparison', '');
  if (!checkpoint) lines.push('No local checkpoint supplied.');
  else {
    lines.push(`Checkpoint captured at: ${e(checkpoint.provenance.fetchedAt)} · Mode: ${e(checkpoint.provenance.mode)}`, '');
    if (!data.changes.length) lines.push('No tracked data differences between these captures. Timestamps, request IDs and derived checks are excluded.');
    for (const change of data.changes) lines.push(`### ${change.label}`, '', `Before: ${e(change.before)}`, '', `After: ${e(change.after)}`, '');
  }
  lines.push('', '---', '', data.scope, '');
  return lines.join('\n');
}

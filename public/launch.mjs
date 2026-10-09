const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finiteDecimal = (value) => typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value) && value.length <= 160;
const nonnegativeDecimal = (value) => finiteDecimal(value) && !value.startsWith('-');

export function isPoolAddress(value) {
  if (typeof value !== 'string' || value.length < 32 || value.length > 44) return false;
  let decoded = 0n;
  for (const character of value) {
    const digit = BASE58.indexOf(character);
    if (digit < 0) return false;
    decoded = decoded * 58n + BigInt(digit);
  }
  let bytes = 0;
  while (decoded > 0n) { bytes++; decoded >>= 8n; }
  let leadingZeroes = 0;
  while (value[leadingZeroes] === '1') leadingZeroes++;
  return bytes + leadingZeroes === 32;
}

export function validateLaunch(value) {
  if (!plain(value) || value.version !== 1 || value.type !== 'dbc-launch' || !plain(value.pool) || !isPoolAddress(value.pool.id)) return false;
  if (!isPoolAddress(value.pool.baseMint) || !isPoolAddress(value.pool.quoteMint) || !isPoolAddress(value.pool.config)) return false;
  if (!plain(value.provenance) || !['live', 'recorded'].includes(value.provenance.mode) || value.provenance.network !== 'mainnet-beta') return false;
  if (typeof value.provenance.fetchedAt !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value.provenance.fetchedAt) || !Number.isFinite(Date.parse(value.provenance.fetchedAt))) return false;
  if (value.provenance.slot !== null && value.provenance.slot !== undefined && !(Number.isSafeInteger(value.provenance.slot) && value.provenance.slot >= 0)) return false;
  if (!plain(value.tokens) || !plain(value.tokens.base) || !plain(value.tokens.quote) || !plain(value.reserves) || !plain(value.migration) || !plain(value.fees) || !plain(value.curve)) return false;
  for (const token of [value.tokens.base, value.tokens.quote]) if (!Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 18) return false;
  if (!nonnegativeDecimal(value.reserves.base) || !nonnegativeDecimal(value.reserves.quote) || !nonnegativeDecimal(value.curve.currentPrice) || !nonnegativeDecimal(value.curve.startPrice)) return false;
  if (typeof value.migration.status !== 'string' || typeof value.migration.target !== 'string' || typeof value.migration.graduated !== 'boolean') return false;
  if (!Array.isArray(value.findings) || value.findings.length > 60 || !value.findings.every((f) => plain(f) && typeof f.title === 'string' && f.title.length <= 400 && typeof f.detail === 'string' && f.detail.length <= 2500)) return false;
  if (!Array.isArray(value.curve.segments) || value.curve.segments.length > 200 || !value.curve.segments.every((segment) => plain(segment) && nonnegativeDecimal(segment.price) && typeof segment.liquidityRaw === 'string' && /^\d+$/.test(segment.liquidityRaw))) return false;
  if (value.quote !== undefined && value.quote !== null) {
    if (!plain(value.quote) || !['available', 'unavailable'].includes(value.quote.status) || value.quote.simulation !== true || !nonnegativeDecimal(value.quote.inputAmount)) return false;
    if (value.quote.status === 'available' && (!nonnegativeDecimal(value.quote.outputAmount) || !nonnegativeDecimal(value.quote.minimumOutputAmount))) return false;
  }
  return true;
}

export function amount(value) {
  if (!finiteDecimal(value)) return value === 0 ? '0' : 'Not supplied';
  const [integer, fraction] = value.split('.');
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction === undefined ? '' : `.${fraction}`);
}

export function display(value) {
  if (value === undefined || value === null || value === '') return 'Not supplied';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

const TRACKED = [
  ['Pool stage', 'migration.status'], ['Migration target', 'migration.target'], ['Graduated', 'migration.graduated'],
  ['Quote reserve', 'reserves.quote'], ['Base reserve', 'reserves.base'], ['Migration threshold', 'migration.threshold'],
  ['Remaining to threshold', 'migration.remaining'], ['Current curve price', 'curve.currentPrice'], ['Curve starting price', 'curve.startPrice'],
  ['Configured curve segments', 'curve.segments'], ['Fee mode', 'fees.mode'], ['Base fee (bps)', 'fees.baseBps'],
  ['Dynamic fee enabled', 'fees.dynamicEnabled'], ['Creator fee share (%)', 'fees.creatorSharePercent'],
  ['Fee collection token', 'fees.collectedIn'], ['Destination fee (bps)', 'fees.destinationBps'], ['Configured liquidity allocation', 'migration.configuredLiquidity'],
  ['Configuration account', 'pool.config'], ['Creator account', 'pool.creator'], ['Base mint', 'pool.baseMint'], ['Quote mint', 'pool.quoteMint']
];
function at(object, path) { return path.split('.').reduce((value, key) => value?.[key], object); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value ?? null;
}
export function compareLaunches(before, after) {
  if (!validateLaunch(before) || !validateLaunch(after) || before.pool.id !== after.pool.id) throw new Error('Checkpoints must use the same pool and format.');
  return TRACKED.flatMap(([label, path]) => {
    const oldValue = at(before, path); const newValue = at(after, path);
    return JSON.stringify(canonical(oldValue)) === JSON.stringify(canonical(newValue)) ? [] : [{ label, path, before: oldValue ?? null, after: newValue ?? null }];
  });
}
const escapeMd = (value) => display(value).replace(/([\\`*_{}\[\]()#+.!|<>])/g, '\\$1').replace(/\r?\n/g, ' ');
export function exportLaunchMarkdown(brief, checkpoint = null) {
  if (!validateLaunch(brief)) throw new Error('A complete launch brief is required.');
  const p = brief.provenance;
  const rows = TRACKED.filter(([, path]) => at(brief, path) !== undefined && path !== 'curve.segments');
  const lines = [
    '# Sourcebrief — launch evidence', '',
    `Pool: ${escapeMd(brief.pool.id)}`, `Capture: ${escapeMd(p.fetchedAt)}`, `Network: ${escapeMd(p.network)}`,
    `Provider: ${escapeMd(p.provider)}`, `Mode: ${escapeMd(p.mode)}`, `Context slot: ${escapeMd(p.slot)}`, '',
    'A source capture, not a token endorsement, forecast or execution receipt. Live means the source was read at the stated time; this document does not update.', '',
    '## Captured facts', '', '| Field | Value |', '| --- | --- |',
    ...rows.map(([label, path]) => `| ${escapeMd(label)} | ${escapeMd(at(brief, path))} |`), '',
    '## Findings and limits', '', ...brief.findings.map((finding) => `- **${escapeMd(finding.title)}:** ${escapeMd(finding.detail)}`), '',
    '## Curve configuration', '', 'Boundary prices are configuration values, not historical prices or a prediction.', '',
    '| Segment | Price in quote per base | Liquidity, raw |', '| --- | --- | --- |',
    ...(brief.curve.segments || []).map((segment, index) => `| ${index + 1} | ${escapeMd(segment.price)} | ${escapeMd(segment.liquidityRaw)} |`), ''
  ];
  if (brief.quote) lines.push('## Read-only SDK estimate', '', 'No transaction was created, signed or sent. The result depends on the captured state and SDK assumptions.', '', '```json', JSON.stringify(brief.quote, null, 2).replace(/```/g, '` ` `'), '```', '');
  if (checkpoint && validateLaunch(checkpoint) && checkpoint.pool.id === brief.pool.id) {
    const differences = compareLaunches(checkpoint, brief);
    lines.push('## Local checkpoint comparison', '', `Earlier capture: ${escapeMd(checkpoint.provenance.fetchedAt)}`, '',
      differences.length ? `${differences.length} tracked fields differ. Capture time, cache state and quote scenarios are excluded from this count.` : 'No tracked facts differ. That does not imply no on-chain activity.', '',
      ...differences.map((item) => `- **${escapeMd(item.label)}:** ${escapeMd(item.before)} → ${escapeMd(item.after)}`), '');
  }
  lines.push('## Provenance', '', '```json', JSON.stringify(p, null, 2).replace(/```/g, '` ` `'), '```', '', 'Generated by Sourcebrief. Preserve this capture time when reusing the evidence.', '');
  return lines.join('\n');
}

export function readLaunchCheckpoint(storage, pool) {
  let raw;
  try {
    raw = storage.getItem(`sourcebrief:launch:v1:${pool}`);
  } catch { return { kind: 'unavailable', brief: null }; }
  if (raw === null) return { kind: 'absent', brief: null };
  if (raw.length > 1000000) return { kind: 'invalid', brief: null };
  try {
    const value = JSON.parse(raw);
    return validateLaunch(value) && value.pool.id === pool ? { kind: 'saved', brief: value } : { kind: 'invalid', brief: null };
  } catch { return { kind: 'invalid', brief: null }; }
}

if (typeof document !== 'undefined') boot();

function boot() {
  const $ = (id) => document.getElementById(id);
  const recordedMode = document.querySelector('meta[name="sourcebrief-launch-mode"]')?.content === 'recorded';
  const apiBase = document.querySelector('meta[name="sourcebrief-api-base"]')?.content || './';
  const state = { brief: null, checkpoint: null, checkpointKind: 'absent', busy: false, request: 0, controller: null, quoteAmount: '0.1' };
  const node = (tag, className = '', text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = String(text); return element; };
  const action = (label, handler, className = 'button secondary') => { const element = node('button', className, label); element.type = 'button'; element.addEventListener('click', handler); return element; };
  const time = (value) => { try { return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' }).format(new Date(value)) + ' UTC'; } catch { return 'Capture time unavailable'; } };
  const announce = (text) => { $('announcement').textContent = text; };
  const short = (id) => typeof id === 'string' ? `${id.slice(0, 6)}…${id.slice(-5)}` : 'Not supplied';
  const localStorageSafe = () => { try { return window.localStorage; } catch { return { getItem() { throw Error('Unavailable'); }, setItem() { throw Error('Unavailable'); } }; } };
  function externalAccount(address, text) {
    if (!isPoolAddress(address)) return node('span', '', 'Not supplied');
    const element = node('a', 'mono', text || address); element.href = `https://solscan.io/account/${address}`; element.target = '_blank'; element.rel = 'noopener noreferrer'; return element;
  }
  function setBusy(busy) {
    state.busy = busy; $('brief').setAttribute('aria-busy', String(busy)); $('open-pool').disabled = busy;
    $('open-pool').textContent = busy ? 'Reading the source…' : 'Open launch brief ↗';
    for (const id of ['refresh', 'save-checkpoint', 'export-md', 'export-json']) $(id).disabled = busy || !state.brief;
    $('compare').disabled = busy || !state.brief || !state.checkpoint;
  }
  async function request(route, signal) {
    let target;
    if (recordedMode) {
      const pool = route.split('?')[0].split('/').at(-1);
      target = new URL(pool === 'examples' ? './data/launch/examples.json' : `./data/launch/${encodeURIComponent(pool)}.json`, location.href);
    } else target = new URL(route, new URL(apiBase, location.href));
    const response = await fetch(target, { method: 'GET', headers: { Accept: 'application/json' }, credentials: 'same-origin', redirect: 'error', signal });
    const raw = await response.text();
    if (raw.length > 1000000) throw new Error('The response exceeded the supported capture size.');
    let data;
    try { data = JSON.parse(raw); } catch { throw new Error(recordedMode ? 'This pool is not part of the published recording.' : 'The source returned an unreadable response. No fresh evidence was kept.'); }
    if (!response.ok) {
      const error = new Error(typeof data?.error?.message === 'string' ? data.error.message.slice(0, 600) : 'The capture could not be completed.');
      error.code = data?.error?.code; error.retryAfter = Number(data?.error?.retryAfterSeconds || response.headers.get('Retry-After')) || null; throw error;
    }
    return data;
  }
  function errorMessage(error) {
    if (!navigator.onLine) return 'The connection is offline. Reconnect to request a fresh capture.';
    if (error.name === 'AbortError' || error.name === 'TimeoutError') return 'The source did not respond within the time limit. You can retry.';
    if (error.code === 'SOLAMI_SETUP_REQUIRED') return 'Live Solami access is not configured on this server. A server operator must add the API key; never enter a key in this page.';
    if (error.code === 'SOLAMI_NETWORK_MISMATCH') return 'The provider did not identify the expected mainnet network. Sourcebrief stopped the capture.';
    if (error.code === 'SOLAMI_AUTH') return 'The data provider did not accept the server credentials. No new evidence was created.';
    const text = error.message || 'The source could not be reached.';
    return error.retryAfter ? `${text} Retry after ${Math.ceil(error.retryAfter)} seconds.` : text;
  }
  function showError(error, pool) {
    const box = node('div', 'notice error'); box.setAttribute('role', 'alert');
    box.append(node('strong', '', 'No fresh capture'), node('p', '', errorMessage(error)));
    if (state.brief) box.append(node('p', '', `The brief below is still the earlier capture of ${short(state.brief.pool.id)} from ${time(state.brief.provenance.fetchedAt)}. It has not been updated.`));
    if (pool) box.append(action('Retry capture', () => openPool(pool, { refresh: true })));
    $('request-status').replaceChildren(box); announce('Capture failed. Existing evidence is unchanged.');
  }
  function readCheckpoint() {
    const saved = readLaunchCheckpoint(localStorageSafe(), state.brief.pool.id); state.checkpoint = saved.brief; state.checkpointKind = saved.kind;
  }
  async function openPool(pool, { refresh = false, focus = false, quoteAmount = state.quoteAmount } = {}) {
    if (!isPoolAddress(pool)) {
      $('address-error').textContent = 'Enter a valid 32-byte Solana pool address. Token symbols and token mint names are not pool addresses.';
      $('address-error').hidden = false; $('pool-address').setAttribute('aria-invalid', 'true'); return;
    }
    $('address-error').hidden = true; $('pool-address').removeAttribute('aria-invalid'); $('pool-address').value = pool;
    state.controller?.abort(); const controller = new AbortController(); state.controller = controller; const requestId = ++state.request;
    const timeout = setTimeout(() => controller.abort(), 25000); setBusy(true);
    $('request-status').replaceChildren(node('p', 'loading-copy', recordedMode ? 'Opening the preserved capture…' : 'Reading pool, configuration and mint evidence…'));
    try {
      const data = await request(`api/launch/${encodeURIComponent(pool)}?quoteAmount=${encodeURIComponent(quoteAmount)}${refresh ? '&refresh=1' : ''}`, controller.signal);
      if (requestId !== state.request) return;
      if (!validateLaunch(data) || data.pool.id !== pool) throw new Error('The capture did not match this pool or the supported evidence format.');
      if (recordedMode && data.provenance.mode !== 'recorded') throw new Error('This published recording was not labeled as recorded evidence.');
      state.brief = data; state.quoteAmount = quoteAmount; readCheckpoint(); $('local-status').textContent = '';
      const url = new URL(location.href); url.hash = pool; history.replaceState(null, '', url);
      $('request-status').replaceChildren(); $('comparison').hidden = true; renderBrief(); renderRail();
      if (focus) {
        $('brief').focus({ preventScroll: true });
        $('brief').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
      }
      announce(`${data.provenance.mode === 'recorded' ? 'Recorded' : 'Mainnet'} capture opened. ${data.findings.length} findings and limitations are available.`);
    } catch (error) { if (requestId === state.request) showError(error, pool); }
    finally { clearTimeout(timeout); if (requestId === state.request) setBusy(false); }
  }
  function section(title, aside = '') {
    const element = node('section', 'section'); const heading = node('div', 'section-heading'); heading.append(node('h3', '', title)); if (aside) heading.append(node('span', '', aside)); element.append(heading); return element;
  }
  function facts(entries) {
    const list = node('dl', 'facts-grid');
    for (const [label, value, options = {}] of entries) {
      const row = node('div', options.wide ? 'wide' : ''); row.append(node('dt', '', label));
      const dd = node('dd', options.mono ? 'mono' : ''); dd.append(value instanceof Node ? value : document.createTextNode(display(value))); row.append(dd); list.append(row);
    }
    return list;
  }
  function quoteSymbol(brief) { return typeof brief.tokens.quote?.symbol === 'string' && brief.tokens.quote.symbol.length <= 16 ? brief.tokens.quote.symbol : 'quote token'; }
  function baseSymbol(brief) { return typeof brief.tokens.base?.symbol === 'string' && brief.tokens.base.symbol.length <= 16 ? brief.tokens.base.symbol : 'base token'; }
  function renderBrief() {
    const brief = state.brief; const p = brief.provenance; const quoteUnit = quoteSymbol(brief); const baseUnit = baseSymbol(brief);
    const container = $('brief-content'); container.replaceChildren();
    const header = node('header', 'brief-header'); const top = node('div', 'brief-topline');
    top.append(node('span', '', 'Meteora Dynamic Bonding Curve'), node('span', 'network', 'Solana mainnet')); header.append(top);
    const title = node('h2', 'brief-title', `${baseUnit === 'base token' ? 'Launch pool' : baseUnit} / ${quoteUnit}`); title.id = 'brief-title'; header.append(title);
    const id = node('div', 'pool-identifier'); id.append(node('span', '', 'Pool'), externalAccount(brief.pool.id), action('Copy', () => copyAddress(brief.pool.id), 'copy-button')); header.append(id);
    const summary = node('dl', 'summary-facts');
    for (const [label, value, unit] of [['Pool stage', display(brief.migration.status), 'Captured state'], ['Curve price', amount(brief.curve.currentPrice), `${quoteUnit} per ${baseUnit}`], ['Quote reserve', amount(brief.reserves.quote), quoteUnit]]) {
      const row = node('div'); row.append(node('dt', '', label)); const dd = node('dd', '', value); dd.append(node('span', 'unit', unit)); row.append(dd); summary.append(row);
    }
    header.append(summary); container.append(header);
    if (p.mode === 'recorded') { const notice = node('div', 'notice warning'); notice.style.margin = '0'; notice.append(node('strong', '', 'Recorded evidence'), node('p', '', `This is a preserved mainnet response from ${time(p.fetchedAt)}. Reopening it does not fetch the current chain state.`)); container.append(notice); }

    const findings = section('Before drawing a conclusion', `${brief.findings.length} observations`);
    const findingsList = node('ul', 'finding-list');
    if (!brief.findings.length) { const item = node('li', 'finding'); const text = node('div'); text.append(node('h4', '', 'No supplied findings'), node('p', '', 'This is not a safety assessment. The account state alone does not establish a token’s quality or ownership history.')); item.append(text); findingsList.append(item); }
    for (const finding of brief.findings) { const item = node('li', `finding ${['attention', 'warning', 'error'].includes(finding.severity) ? finding.severity : ''}`); const content = node('div'); content.append(node('h4', '', finding.title), node('p', '', finding.detail)); item.append(content); findingsList.append(item); }
    findings.append(findingsList); container.append(findings);

    const migration = section('The route out of the curve', 'Migration');
    migration.append(node('p', 'section-intro', 'Migration conditions come from the pool configuration. Meeting a threshold and completing migration are different states.'));
    const stages = node('div', 'stage-path'); const completed = brief.migration.graduated === true;
    stages.append(node('span', `stage ${completed ? '' : 'active'}`, 'Bonding curve'), node('span', 'stage-connection'), node('span', `stage ${completed ? 'active' : ''}`, display(brief.migration.target || 'Configured pool'))); migration.append(stages);
    const progress = Number(brief.migration.progressPercent);
    if (!completed && Number.isFinite(progress) && brief.migration.progressPercent !== null && brief.migration.progressPercent !== undefined) {
      const track = node('div', 'progress-track'); track.setAttribute('role', 'progressbar'); track.setAttribute('aria-label', 'Quote reserve relative to migration threshold'); track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100'); track.setAttribute('aria-valuenow', String(Math.min(100, Math.max(0, progress))));
      const fill = node('div', 'progress-fill'); fill.style.width = `${Math.min(100, Math.max(0, progress))}%`; track.append(fill);
      const caption = node('div', 'progress-caption'); caption.append(node('span', '', 'Quote reserve / threshold'), node('strong', '', `${display(brief.migration.progressPercent)}%`)); migration.append(track, caption);
    }
    migration.append(facts([['Target', brief.migration.target], ['Migration complete', brief.migration.graduated], ['Threshold', `${amount(brief.migration.threshold)} ${quoteUnit}`], ['Remaining to threshold', brief.migration.remaining === null || brief.migration.remaining === undefined ? 'Not supplied' : `${amount(brief.migration.remaining)} ${quoteUnit}`]]));
    if (brief.migration.targetPool) {
      const destination = node('p', 'source-notes'); destination.append(document.createTextNode('Derived destination account: '), externalAccount(brief.migration.targetPool, short(brief.migration.targetPool)), document.createTextNode('. This derivation does not confirm that the destination exists or verify its balances.')); migration.append(destination);
    }
    if (plain(brief.migration.configuredLiquidity)) {
      const allocation = brief.migration.configuredLiquidity; const table = node('table', 'allocation-table'); table.append(node('caption', '', 'Configured destination liquidity shares. Configuration is not a verification of ownership or destination balances.'));
      const head = node('thead'); const tr = node('tr'); ['Recipient', 'Permanent', 'Vested', 'Unlocked'].forEach((label) => { const th = node('th', '', label); th.scope = 'col'; tr.append(th); }); head.append(tr); table.append(head);
      const body = node('tbody');
      for (const recipient of ['partner', 'creator']) { const row = node('tr'); row.append(node('td', '', recipient === 'partner' ? 'Partner' : 'Creator')); for (const category of ['Permanent', 'Vested', 'Unlocked']) { const value = allocation[`${recipient}${category}Percent`]; row.append(node('td', 'mono', value === undefined || value === null ? 'Not supplied' : `${display(value)}%`)); } body.append(row); }
      table.append(body); const scroll = node('div', 'table-scroll allocation'); scroll.append(table); migration.append(scroll);
    }
    container.append(migration);

    const curve = section('Curve & reserves', 'Configuration, not history');
    curve.append(facts([['Base reserve', `${amount(brief.reserves.base)} ${baseUnit}`], ['Quote reserve', `${amount(brief.reserves.quote)} ${quoteUnit}`], ['Starting curve price', `${amount(brief.curve.startPrice)} ${quoteUnit} / ${baseUnit}`], ['Current curve price', `${amount(brief.curve.currentPrice)} ${quoteUnit} / ${baseUnit}`]]));
    if (brief.curve.displayRounding) curve.append(node('p', 'source-notes', `Price display: ${brief.curve.displayRounding}. The exact numerator and denominator are retained in the data export.`));
    if (brief.curve.segments?.length) {
      const scroll = node('div', 'table-scroll'); scroll.style.marginTop = '23px'; const table = node('table'); const caption = node('caption', '', 'Configured curve boundaries. Prices describe the curve; they are not a price history or a forecast.'); table.append(caption);
      const head = node('thead'); const row = node('tr'); ['Segment', `${quoteUnit} per ${baseUnit}`, 'Liquidity · raw units'].forEach((label) => { const cell = node('th', '', label); cell.scope = 'col'; row.append(cell); }); head.append(row); table.append(head);
      const body = node('tbody'); brief.curve.segments.forEach((segment, index) => { const row = node('tr', segment.active ? 'active-segment' : ''); const first = node('td', '', segment.index || index + 1); if (segment.active) first.append(node('span', 'segment-current', 'Current')); row.append(first, node('td', 'mono', amount(segment.price)), node('td', 'mono', display(segment.liquidityRaw))); body.append(row); }); table.append(body); scroll.append(table); curve.append(scroll);
    }
    container.append(curve);

    const fees = section('Where the fees go', 'Configured terms');
    fees.append(facts([['Fee schedule', brief.fees.mode], [brief.fees.baseLabel || 'Base fee', brief.fees.baseBps === undefined || brief.fees.baseBps === null ? 'Not supplied' : `${display(brief.fees.baseBps)} bps`], ['Dynamic fees enabled', brief.fees.dynamicEnabled], ['Creator fee share', brief.fees.creatorSharePercent === undefined || brief.fees.creatorSharePercent === null ? 'Not supplied' : `${display(brief.fees.creatorSharePercent)}%`], ['Fees collected in', brief.fees.collectedIn], ['Configured destination fee', brief.fees.destinationBps === undefined || brief.fees.destinationBps === null ? 'Not supplied' : `${display(brief.fees.destinationBps)} bps`]]));
    fees.append(node('p', 'source-notes', 'A basis point is 0.01%. These are pool configuration fields; an estimate can also depend on dynamic fees, token behavior and execution timing.')); container.append(fees);
    container.append(renderQuote(brief));

    const sources = section('Trace this capture'); const details = node('details', 'disclosure'); details.append(node('summary', '', 'Accounts, source timing & capture details'));
    details.append(facts([['Base mint', externalAccount(brief.pool.baseMint), { wide: true }], ['Quote mint', externalAccount(brief.pool.quoteMint), { wide: true }], ['Configuration', externalAccount(brief.pool.config), { wide: true }], ['Creator account', externalAccount(brief.pool.creator), { wide: true }]]));
    const sourceList = node('dl', 'source-list'); sourceList.style.marginTop = '24px';
    for (const [key, value] of Object.entries(p)) {
      if (key === 'hashes' && Array.isArray(value)) continue;
      const label = key.replace(/([a-z])([A-Z])/g, '$1 $2'); sourceList.append(node('dt', '', label), node('dd', key.toLowerCase().includes('hash') ? 'mono' : '', display(value)));
    }
    if (Array.isArray(p.hashes)) for (const hash of p.hashes) { sourceList.append(node('dt', '', `${display(hash.role)} SHA-256`), node('dd', 'mono', display(hash.sha256))); }
    details.append(sourceList, node('p', 'source-notes', 'Explorer links are independent ways to inspect an account. Provider origin, a matching program owner and a readable configuration do not establish a token’s safety.')); sources.append(details); container.append(sources);
  }
  function renderQuote(brief) {
    const area = section('Try an amount against this state', 'Read-only estimate'); area.classList.add('quote-section');
    area.append(node('p', 'section-intro', 'The Meteora SDK estimates quote-token input against the captured pool. No wallet, signature or transaction is involved.'));
    const form = node('form', 'quote-form'); form.noValidate = true;
    const field = node('div', 'quote-field'); const label = node('label', '', 'Scenario input'); label.htmlFor = 'quote-amount'; field.append(label);
    const inputWrap = node('div', 'quote-input-wrap'); const input = node('input'); input.id = 'quote-amount'; input.type = 'text'; input.inputMode = 'decimal'; input.value = brief.quote?.inputAmount || state.quoteAmount; input.autocomplete = 'off'; input.disabled = recordedMode; input.setAttribute('aria-describedby', 'quote-help'); inputWrap.append(input, node('span', '', quoteSymbol(brief))); field.append(inputWrap); form.append(field);
    const submit = node('button', 'button secondary', 'Estimate from source →'); submit.type = 'submit'; submit.disabled = recordedMode; form.append(submit);
    const help = node('p', 'quote-detail', recordedMode ? 'This recording preserves only the scenario shown below. Run the live server to request another scenario.' : 'Requests a source capture and computes a scenario. It does not place an order.'); help.id = 'quote-help';
    form.addEventListener('submit', (event) => {
      event.preventDefault(); const value = input.value.trim();
      if (!/^\d+(?:\.\d{1,18})?$/.test(value) || value.length > 40 || !Number.isFinite(Number(value)) || Number(value) <= 0) { help.textContent = 'Enter a positive decimal amount, using a dot and no more than 18 decimal places.'; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
      input.removeAttribute('aria-invalid'); openPool(brief.pool.id, { quoteAmount: value });
    });
    area.append(form, help);
    const q = brief.quote;
    if (!q || q.status !== 'available' || !nonnegativeDecimal(q.outputAmount)) {
      const warning = node('div', 'notice warning'); warning.style.margin = '18px 0 0'; warning.append(node('strong', '', 'Estimate unavailable'), node('p', '', q?.reason || q?.message || 'The SDK did not return an eligible estimate for this captured state. No substitute estimate was invented.')); area.append(warning); return area;
    }
    const result = node('div', 'quote-result'); result.style.marginTop = '18px'; result.append(node('span', 'simulation-label', 'SDK calculation · not an executed trade'), node('p', 'quote-result-label', 'Estimated base-token output'));
    const value = node('p', 'quote-result-value', amount(q.outputAmount)); value.append(node('span', 'unit', baseSymbol(brief))); result.append(value);
    const detail = node('div', 'quote-detail');
    for (const [label, value] of [['Input before fees', `${display(q.inputAmount)} ${quoteSymbol(brief)}`], ['Input used by the curve', q.actualInputAmount === undefined ? null : `${display(q.actualInputAmount)} ${quoteSymbol(brief)}`], ['Minimum output', q.minimumOutputAmount === undefined ? null : `${display(q.minimumOutputAmount)} ${baseSymbol(brief)}`], ['SDK trading fees', q.feeAmount === undefined ? null : `${display(q.feeAmount)} ${q.feeToken === 'base' ? baseSymbol(brief) : quoteSymbol(brief)}`], ['Slippage assumption', q.slippageBps === undefined ? null : `${display(q.slippageBps)} bps`], ['Curve price after this scenario', q.nextPrice === undefined ? null : `${display(q.nextPrice)} ${quoteSymbol(brief)} / ${baseSymbol(brief)}`]]) if (value !== null && value !== undefined) detail.append(node('p', '', `${label}: ${display(value)}`));
    detail.append(node('p', '', 'Network and priority fees are not estimated.'), node('p', '', `Computed for the state captured ${time(brief.provenance.fetchedAt)}. Actual later execution can differ.`)); if (q.note) detail.append(node('p', '', q.note)); result.append(detail); area.append(result); return area;
  }
  function renderRail() {
    const brief = state.brief; const p = brief.provenance; const capture = $('capture-summary'); capture.replaceChildren();
    capture.append(node('span', `capture-state ${p.mode}`, p.mode === 'recorded' ? 'Recorded mainnet capture' : p.cached ? `Cached ${p.provider} capture` : `${p.provider} mainnet capture`));
    const details = node('dl'); for (const [label, value] of [['Captured', time(p.fetchedAt)], ['Slot', display(p.slot)], ['Source', p.provider]]) details.append(node('dt', '', label), node('dd', label === 'Slot' ? 'mono' : '', value)); capture.append(details);
    capture.append(node('p', '', p.mode === 'recorded' ? 'A preserved response. This page is not reading the chain now.' : p.cached ? 'The provider capture is reused from cache. Its original time is preserved.' : 'A point-in-time read. Values do not refresh in the background.'));
    $('refresh').textContent = recordedMode ? 'Reload this capture ↻' : 'Fetch a fresh capture ↻';
    const checkpoint = $('checkpoint-summary'); checkpoint.classList.remove('saved'); checkpoint.replaceChildren(node('h3', '', 'Checkpoint'));
    if (state.checkpoint) checkpoint.append(node('p', 'checkpoint-time', time(state.checkpoint.provenance.fetchedAt)), node('p', 'small', `Slot ${display(state.checkpoint.provenance.slot)} · kept in this browser`));
    else checkpoint.append(node('p', '', state.checkpointKind === 'invalid' ? 'The saved record is unreadable or from another format. Keeping this capture will replace it.' : state.checkpointKind === 'unavailable' ? 'Browser storage is unavailable. You can still export this capture.' : 'No checkpoint for this pool. Keep this capture to compare the next one.'));
    $('save-checkpoint').textContent = state.checkpoint ? 'Replace this checkpoint ＋' : 'Keep this checkpoint ＋';
    $('compare').disabled = state.busy || !state.checkpoint;
  }
  function saveCheckpoint() {
    if (!state.brief) return;
    try { localStorageSafe().setItem(`sourcebrief:launch:v1:${state.brief.pool.id}`, JSON.stringify(state.brief)); state.checkpoint = state.brief; state.checkpointKind = 'saved'; renderRail(); $('checkpoint-summary').classList.add('saved'); $('local-status').className = 'local-status'; $('local-status').textContent = 'Checkpoint kept in this browser. Other pools are unchanged.'; announce('Checkpoint saved.'); }
    catch { $('local-status').className = 'local-status error'; $('local-status').textContent = 'The browser could not save this checkpoint. Export a copy instead; existing records were not removed.'; }
  }
  function compare() {
    if (!state.brief || !state.checkpoint) return;
    const changes = compareLaunches(state.checkpoint, state.brief); const section = $('comparison'); section.replaceChildren(); section.hidden = false;
    const top = node('div', 'comparison-top'); const text = node('div'); const heading = node('h2', '', 'What changed in the evidence?'); heading.id = 'comparison-title'; text.append(heading, node('p', '', `${time(state.checkpoint.provenance.fetchedAt)} → ${time(state.brief.provenance.fetchedAt)}`)); top.append(text, action('Close', () => { section.hidden = true; $('compare').focus(); })); section.append(top);
    if (!changes.length) section.append(node('p', 'comparison-empty', 'No tracked facts changed between these two captures. This does not mean there was no on-chain activity.'));
    else { const list = node('ul', 'diff-list'); for (const change of changes) { const item = node('li', 'diff'); item.append(node('h3', '', change.label)); const values = node('div', 'diff-values'); for (const [label, value] of [['Checkpoint', change.before], ['Current capture', change.after]]) { const cell = node('div'); cell.append(node('span', '', label), node('p', '', display(value))); values.append(cell); } item.append(values); list.append(item); } section.append(list); }
    section.append(node('p', 'comparison-caveat', 'Compares configured terms, reserves and stage for the same pool. Capture metadata and quote scenarios are excluded. A change is an observation, not a cause or safety verdict.'));
    section.focus({ preventScroll: true }); section.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }
  function download(kind) {
    if (!state.brief) return;
    const brief = state.brief; const data = kind === 'md' ? exportLaunchMarkdown(brief, state.checkpoint) : JSON.stringify({ format: 'sourcebrief-launch-export-v1', exportedAt: new Date().toISOString(), notice: 'A dated evidence capture. Not a token endorsement, forecast or transaction receipt.', brief, checkpoint: state.checkpoint ? { fetchedAt: state.checkpoint.provenance.fetchedAt, slot: state.checkpoint.provenance.slot, differences: compareLaunches(state.checkpoint, brief) } : null }, null, 2);
    const blob = new Blob([data], { type: kind === 'md' ? 'text/markdown;charset=utf-8' : 'application/json;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = node('a'); link.href = url; link.download = `sourcebrief-launch-${brief.pool.id.slice(0, 8)}-${brief.provenance.fetchedAt.slice(0, 10)}.${kind}`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('local-status').className = 'local-status'; $('local-status').textContent = `Exported ${kind === 'md' ? 'a readable brief' : 'structured evidence'} with source timing and limitations.`;
  }
  async function copyAddress(address) {
    try { await navigator.clipboard.writeText(address); $('local-status').textContent = 'Pool address copied.'; }
    catch { $('local-status').textContent = 'Copy was unavailable. The full pool address remains selectable in the brief.'; }
  }
  $('pool-form').addEventListener('submit', (event) => { event.preventDefault(); openPool($('pool-address').value.trim(), { focus: true }); });
  $('refresh').addEventListener('click', () => state.brief && openPool(state.brief.pool.id, { refresh: true }));
  $('save-checkpoint').addEventListener('click', saveCheckpoint); $('compare').addEventListener('click', compare);
  $('export-md').addEventListener('click', () => download('md')); $('export-json').addEventListener('click', () => download('json'));
  const offline = () => { $('offline-notice').hidden = navigator.onLine; }; addEventListener('online', offline); addEventListener('offline', offline); offline();
  addEventListener('storage', (event) => { if (state.brief && (event.key === null || event.key === `sourcebrief:launch:v1:${state.brief.pool.id}`)) { readCheckpoint(); renderRail(); $('local-status').textContent = 'The checkpoint changed in another tab. Its latest version is shown.'; } });
  request('api/launch/examples', AbortSignal.timeout(10000)).then((data) => {
    const items = Array.isArray(data) ? data : data.items || data.examples;
    if (!Array.isArray(items)) return;
    const valid = items.filter((item) => plain(item) && isPoolAddress(item.pool || item.id)).slice(0, 6);
    if (!valid.length) return;
    $('example-tools').firstElementChild.textContent = recordedMode ? 'Preserved mainnet cases' : 'Explore a mainnet pool';
    for (const item of valid) {
      const button = action('', () => openPool(item.pool || item.id, { focus: true }), 'text-button example-button');
      button.append(node('span', 'example-name', item.label || item.title || item.name || short(item.pool || item.id)));
      if (item.detail) button.append(node('span', 'example-hint', item.detail));
      $('examples').append(button);
    }
    $('example-tools').hidden = false;
  }).catch(() => { /* An unavailable example directory does not prevent a direct pool lookup. */ });
  const hash = location.hash.slice(1); if (isPoolAddress(hash)) openPool(hash);
}

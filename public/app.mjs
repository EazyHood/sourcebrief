import { isMarketId, validateBrief, validateCatalog, readCheckpoint, saveCheckpoint, compareBriefs, displayValue, exportEvidence, exportMarkdown, pricePresentation } from './evidence.mjs';

const $ = (id) => document.getElementById(id);
const readingSize = $('reading-size');
try { readingSize.checked = localStorage.getItem('sourcebrief:reading-size') === 'large'; } catch { /* Optional reading preference. */ }
readingSize.addEventListener('change', () => {
  try { localStorage.setItem('sourcebrief:reading-size', readingSize.checked ? 'large' : 'default'); } catch { /* Still works in this tab. */ }
});
function node(tag, className = '', content) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (content !== undefined) el.textContent = String(content);
  return el;
}
function button(label, action, className = 'button secondary') {
  const el = node('button', className, label); el.type = 'button'; el.addEventListener('click', action); return el;
}
function announce(message) { $('announcement').textContent = message; }
function shortId(id) { return `${id.slice(0, 7)}…${id.slice(-5)}`; }
function time(value) {
  if (!value) return 'Not supplied';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' }).format(new Date(value)) + ' UTC';
}
function storage() {
  try { return window.localStorage; }
  catch { return { getItem() { throw Error('Storage unavailable'); }, setItem() { throw Error('Storage unavailable'); } }; }
}

const params = new URLSearchParams(location.search);
const state = { items: [], cursor: null, seenCursors: new Set(), catalogueBusy: false, catalogueLoaded: false,
  selected: '', brief: null, briefBusy: false, viewingCheckpoint: false, checkpoint: null, checkpointKind: 'absent', detailRequest: 0, detailAbort: null,
  search: (params.get('q') || '').slice(0, 200), category: (params.get('category') || '').slice(0, 80) };
$('search').value = state.search;

function reflectURL() {
  const next = new URL(location.href);
  state.search ? next.searchParams.set('q', state.search) : next.searchParams.delete('q');
  state.category ? next.searchParams.set('category', state.category) : next.searchParams.delete('category');
  next.hash = state.selected || '';
  history.replaceState(null, '', next);
}

class RequestError extends Error {
  constructor(message, code, retryAfter) { super(message); this.code = code; this.retryAfter = retryAfter; }
}
async function request(path, signal) {
  const response = await fetch(path, { method: 'GET', headers: { Accept: 'application/json' }, signal, credentials: 'same-origin', redirect: 'error' });
  const text = await response.text();
  if (text.length > 1000000) throw new RequestError('The response was too large to display safely.', 'INVALID_RESPONSE');
  let data;
  try { data = JSON.parse(text); } catch { throw new RequestError('The server did not return a readable response.', 'INVALID_RESPONSE'); }
  if (!response.ok) {
    const raw = data?.error;
    throw new RequestError(typeof raw?.message === 'string' ? raw.message.slice(0, 500) : 'This request could not be completed.',
      typeof raw?.code === 'string' ? raw.code : String(response.status),
      Number(raw?.retryAfterSeconds || response.headers.get('Retry-After')) || null);
  }
  return data;
}
function messageFor(error) {
  if (!navigator.onLine) return 'You appear to be offline. Reconnect, then retry. Your saved checkpoint is unchanged.';
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'The request took too long. Retry when the connection is ready.';
  let message = error instanceof RequestError ? error.message : 'The server could not be reached. Check the connection and retry.';
  if (Number.isFinite(error?.retryAfter) && error.retryAfter > 0) message += ` Try again in ${Math.ceil(error.retryAfter)} seconds.`;
  return message;
}
function errorBox(title, error, retry) {
  const box = node('div', 'notice error'); box.setAttribute('role', 'alert');
  box.append(node('strong', '', title), node('p', '', messageFor(error)));
  if (retry) box.append(button('Retry', retry));
  return box;
}

function renderCatalogue() {
  const list = $('market-list'); list.replaceChildren(); list.setAttribute('aria-busy', String(state.catalogueBusy));
  $('loaded-count').textContent = String(state.items.length).padStart(2, '0');
  const term = state.search.trim().toLocaleLowerCase();
  const visible = state.items.filter((item) => (!state.category || item.category === state.category) && (!term || `${item.title} ${item.id}`.toLocaleLowerCase().includes(term)));
  for (const item of visible) {
    const position = state.items.indexOf(item) + 1;
    const row = node('li');
    const select = button('', () => selectMarket(item.id, { focus: true }), 'market');
    select.setAttribute('aria-current', item.id === state.selected ? 'true' : 'false');
    select.setAttribute('aria-label', `${item.title.trim() ? item.title : 'Untitled market'} — ${shortId(item.id)}. ${item.id === state.selected ? 'Selected.' : 'Load evidence.'}`);
    const meta = node('span', 'market-meta'); meta.append(node('span', '', String(position).padStart(2, '0')), node('span', '', item.category || 'Uncategorized'));
    const title = node('span', 'market-title', item.title.trim() ? item.title : 'Untitled market');
    const bottom = node('span', 'market-id', shortId(item.id));
    bottom.append(node('span', 'market-end', '↗'));
    select.append(meta, title, bottom);
    if (!item.title.trim()) select.append(node('span', 'small muted', 'Load evidence for the full record'));
    row.append(select); list.append(row);
  }
  if (state.catalogueBusy && !state.items.length) {
    for (let i = 0; i < 3; i++) { const li = node('li', 'skeleton-box'); li.setAttribute('aria-hidden', 'true'); li.append(node('div', 'skeleton short'), node('div', 'skeleton wide'), node('div', 'skeleton short')); list.append(li); }
  } else if (!visible.length && state.catalogueLoaded) {
    const empty = node('li', 'skeleton-box'); empty.append(node('strong', '', state.items.length ? 'No loaded matches' : 'No markets returned'), node('p', 'small muted', state.items.length ? 'Clear the filters or load another page. Search does not query the whole catalogue.' : 'The provider returned an empty page. You can retry the catalogue.'));
    if (state.items.length) empty.append(button('Clear filters', () => { state.search = ''; state.category = ''; $('search').value = ''; $('category').value = ''; reflectURL(); renderCatalogue(); }, 'button quiet'));
    else empty.append(button('Reload catalogue', () => loadCatalogue(true), 'button quiet'));
    list.append(empty);
  }
  $('filter-note').textContent = `${visible.length} of ${state.items.length} loaded markets shown. Search and category apply only to these records.`;
  const more = $('load-more');
  more.disabled = state.catalogueBusy || (state.catalogueLoaded && state.cursor === null);
  more.textContent = state.catalogueBusy ? 'Loading records…' : state.catalogueLoaded && !state.cursor ? 'All returned pages loaded' : state.catalogueLoaded ? 'Load next page ↓' : 'Retry catalogue';
}

function updateCategories() {
  const select = $('category'); select.replaceChildren();
  const all = node('option', '', 'All loaded categories'); all.value = ''; select.append(all);
  const categories = [...new Set(state.items.map((i) => i.category).filter(Boolean))].sort();
  for (const value of categories) { const option = node('option', '', value); option.value = value; select.append(option); }
  if (state.category && !categories.includes(state.category)) state.category = '';
  select.value = state.category;
}

async function loadCatalogue(reset = false) {
  if (state.catalogueBusy) return;
  const cursor = reset ? null : state.cursor;
  state.catalogueBusy = true; $('catalogue-status').replaceChildren(node('span', '', state.items.length ? 'Loading another page…' : 'Loading the first page…')); renderCatalogue();
  try {
    const data = await request('/api/catalog?limit=20' + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''), AbortSignal.timeout(14000));
    if (!validateCatalog(data)) throw new RequestError('The catalogue response did not match the expected format.', 'INVALID_RESPONSE');
    if (reset) { state.items = []; state.seenCursors.clear(); }
    const entries = new Map(state.items.map((item) => [item.id, item]));
    for (const item of data.items) entries.set(item.id, { ...item, title: entries.get(item.id)?.title || item.title });
    state.items = [...entries.values()];
    if (cursor) state.seenCursors.add(cursor);
    const repeatedCursor = data.nextCursor && (data.nextCursor === cursor || state.seenCursors.has(data.nextCursor));
    state.cursor = repeatedCursor ? null : (data.nextCursor || null);
    state.catalogueLoaded = true;
    $('catalogue-status').textContent = repeatedCursor ? 'The provider repeated a page cursor. Loading stopped to avoid duplicate requests.' : `${data.items.length} records returned${data.provenance.cached ? ' from the server cache' : ''}.`;
    $('catalogue-source').textContent = `${data.provenance.mode === 'recorded' ? 'Recorded Panta response' : 'Panta API response'} · captured ${time(data.provenance.fetchedAt)}`;
    updateCategories();
    if (!state.selected) {
      let hash = '';
      try { hash = decodeURIComponent(location.hash.slice(1)); } catch { /* Ignore malformed bookmark. */ }
      const initial = isMarketId(hash) ? hash : state.items[0]?.id;
      if (initial) selectMarket(initial);
    }
  } catch (error) {
    $('catalogue-status').replaceChildren(errorBox('Catalogue unavailable', error, () => loadCatalogue(reset)));
  } finally { state.catalogueBusy = false; renderCatalogue(); }
}

function loadCheckpoint(id) {
  const saved = readCheckpoint(storage(), id); state.checkpoint = saved.brief; state.checkpointKind = saved.kind;
}

async function selectMarket(id, { refresh = false, focus = false } = {}) {
  if (!isMarketId(id)) return;
  if (!refresh && state.selected === id && (state.briefBusy || state.brief)) return;
  state.detailAbort?.abort();
  const controller = new AbortController(); state.detailAbort = controller;
  const token = ++state.detailRequest, switched = state.selected !== id;
  state.selected = id; state.briefBusy = true;
  if (switched) { state.brief = null; loadCheckpoint(id); }
  reflectURL(); renderCatalogue(); $('detail-status').replaceChildren();
  $('evidence').setAttribute('aria-busy', 'true');
  if (state.brief) renderSheet();
  else {
    const skeleton = node('div', 'skeleton-paper'); skeleton.setAttribute('aria-hidden', 'true');
    skeleton.append(node('div', 'skeleton short'), node('div', 'skeleton title'), node('div', 'skeleton wide'), node('div', 'skeleton wide'), node('div', 'skeleton short'));
    $('sheet').replaceChildren(skeleton); $('detail-status').append(node('p', 'notice', 'Loading the evidence record…'));
  }
  const timer = setTimeout(() => controller.abort(), 14000);
  try {
    const brief = await request(`/api/brief/${encodeURIComponent(id)}${refresh ? '?refresh=1' : ''}`, controller.signal);
    if (token !== state.detailRequest) return;
    if (!validateBrief(brief) || brief.id !== id) throw new RequestError('The evidence response did not match this market or the expected format.', 'INVALID_RESPONSE');
    state.brief = brief; state.viewingCheckpoint = false;
    const item = state.items.find((value) => value.id === id);
    if (item && brief.title) item.title = brief.title;
    $('detail-status').replaceChildren();
    announce(`Evidence loaded. ${brief.title || 'Untitled market'}. Captured ${time(brief.provenance.fetchedAt)}.`);
  } catch (error) {
    if (token !== state.detailRequest) return;
    $('detail-status').replaceChildren(errorBox(state.brief ? 'Refresh did not complete — previous capture retained' : 'Evidence unavailable', error, () => selectMarket(id, { refresh: true, focus })));
    if (!state.brief) {
      const empty = node('div', 'empty-sheet'); empty.append(node('p', 'eyebrow', `MARKET / ${shortId(id)}`), node('h2', '', 'The source is not ready.'), node('p', '', 'Retry this record or choose another market. Your local checkpoint has not been changed.'));
      if (state.checkpoint) empty.append(button('Read saved checkpoint', () => { state.brief = state.checkpoint; state.viewingCheckpoint = true; renderSheet(); announce('Showing the saved checkpoint, not a new API response.'); }, 'button secondary'));
      $('sheet').replaceChildren(empty);
    }
  } finally {
    clearTimeout(timer);
    if (token === state.detailRequest) {
      state.briefBusy = false; $('evidence').setAttribute('aria-busy', 'false'); renderCatalogue();
      if (state.brief) renderSheet();
      if (focus && $('brief-title')) {
        $('brief-title').focus({ preventScroll: true });
        if (matchMedia('(max-width:800px)').matches) $('evidence').scrollIntoView({ behavior: 'instant', block: 'start' });
      }
    }
  }
}

function section(number, title, extraClass = '') {
  const el = node('section', `section ${extraClass}`.trim()), heading = node('div', 'section-head');
  heading.append(node('span', 'section-number', number), node('h3', '', title)); el.append(heading); return el;
}
function labelled(label, value, className = '') {
  const el = node('div', className); el.append(node('span', 'fact-label', label), node('span', 'fact-value', value)); return el;
}
function actionStatus(message, isError = false) {
  const target = $('action-status'); if (target) { target.textContent = message; target.className = `inline-status${isError ? ' error' : ''}`; }
  announce(message);
}
function checkpointAction() {
  if (!state.brief || state.briefBusy) return;
  const result = saveCheckpoint(storage(), state.brief);
  if (result.kind !== 'saved') { actionStatus('This browser could not save the checkpoint. Export JSON to keep this capture.', true); return; }
  loadCheckpoint(state.brief.id); renderSheet(); actionStatus(`Saved locally. Checkpoint capture: ${time(state.checkpoint.provenance.fetchedAt)}.`);
}
function download(format) {
  if (!state.brief) return;
  try {
    const content = format === 'json' ? JSON.stringify(exportEvidence(state.brief, state.checkpoint), null, 2) + '\n' : exportMarkdown(state.brief, state.checkpoint);
    const blob = new Blob([content], { type: format === 'json' ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = node('a');
    link.href = url; link.download = `sourcebrief-${state.brief.id}-${state.brief.provenance.fetchedAt.slice(0, 10)}.${format === 'json' ? 'json' : 'md'}`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    actionStatus(`${format === 'json' ? 'JSON' : 'Markdown'} export prepared with the original capture date${state.checkpoint ? ' and checkpoint comparison' : ''}.`);
  } catch { actionStatus('The export could not be prepared. The displayed record and saved checkpoint are unchanged.', true); }
}

function renderSheet() {
  const brief = state.brief; if (!brief) return;
  const sheet = $('sheet'); sheet.replaceChildren();
  const header = node('header', 'sheet-top'), kicker = node('div', 'sheet-kicker');
  const index = state.items.findIndex((i) => i.id === brief.id);
  kicker.append(node('p', 'eyebrow', `EVIDENCE SHEET / ${index >= 0 ? String(index + 1).padStart(2, '0') : 'SELECTED'}`),
    node('span', `mode ${brief.provenance.mode === 'recorded' || state.viewingCheckpoint ? 'recorded' : ''}`, state.viewingCheckpoint ? 'Saved local checkpoint' : brief.provenance.mode === 'recorded' ? 'Recorded API response' : brief.provenance.cached ? 'API capture · cached' : 'API capture'));
  const title = node('h2', 'sheet-title', brief.title.trim() ? brief.title : 'Untitled market'); title.id = 'brief-title'; title.tabIndex = -1;
  const identity = node('div', 'identifier'), identityText = node('p');
  identityText.append(node('span', 'fact-label', 'Panta market identifier'), node('span', 'mono', brief.id));
  identity.append(identityText, button('Copy ID', async () => {
    try { await navigator.clipboard.writeText(brief.id); actionStatus('Market identifier copied.'); }
    catch { actionStatus('Clipboard is unavailable. Select the identifier text to copy it.', true); }
  }, 'button quiet'));
  const facts = node('div', 'facts-strip'); facts.append(labelled('Captured at', time(brief.provenance.fetchedAt)), labelled('Category / phase', `${brief.category || 'Not supplied'} / ${brief.phase || 'Not supplied'}`));
  const actions = node('div', 'sheet-actions');
  const save = button(state.checkpoint ? 'Replace checkpoint' : 'Save checkpoint', checkpointAction); save.className = 'button'; save.disabled = state.briefBusy;
  const refresh = button(state.briefBusy ? 'Refreshing…' : 'Refresh evidence', () => selectMarket(brief.id, { refresh: true })); refresh.disabled = state.briefBusy;
  const json = button('Export JSON', () => download('json'), 'button secondary push'), md = button('Export Markdown', () => download('md'));
  actions.append(save, refresh, json, md);
  const status = node('p', 'inline-status'); status.id = 'action-status'; status.setAttribute('role', 'status');
  header.append(kicker, title, identity, facts, actions, status); sheet.append(header);

  const resolution = section('01', 'Resolution evidence');
  if (brief.rule.text.trim()) resolution.append(node('blockquote', 'rule-text', brief.rule.text));
  else resolution.append(node('p', 'missing', 'No resolution wording was supplied. The conditions for settlement cannot be established from this record.'));
  resolution.append(node('h4', 'source-heading', 'Source identifiers supplied'));
  if (brief.rule.sources.length) {
    const sources = node('ol', 'sources'); for (const source of brief.rule.sources) sources.append(node('li', '', source.trim() ? source : 'Blank identifier supplied')); resolution.append(sources);
  } else resolution.append(node('p', 'small muted', 'No source identifiers were supplied.'));
  resolution.append(node('p', 'small muted', 'These are provider-supplied identifiers, not verified source links.'));
  if (brief.description) { const detail = node('details'); detail.append(node('summary', '', 'Read the provider description'), node('p', 'description', brief.description)); resolution.append(detail); }
  sheet.append(resolution);

  const dates = section('02', 'Dates in the record'), dateList = node('dl', 'field-grid');
  for (const [label, value] of [['Starts', brief.timeline.startAt], ['Ends', brief.timeline.endAt], ['Resolves', brief.timeline.resolutionAt]]) { const entry = node('div'); entry.append(node('dt', '', label), node('dd', '', time(value))); dateList.append(entry); }
  dates.append(dateList, node('p', 'small muted date-note', 'All dates shown in UTC. Missing dates stay missing; no schedule is inferred.')); sheet.append(dates);

  const interpretation = pricePresentation(brief);
  const valuation = section('03', interpretation.heading), prices = node('div', 'prices');
  for (const [label, value] of [['YES', brief.prices.yes], ['NO', brief.prices.no]]) { const price = node('div', 'price-box'); price.append(node('span', 'price-label', label), node('span', `price-value${value === null ? ' no-price' : ''}`, value === null ? 'Not supplied' : value)); prices.append(price); }
  valuation.append(prices, node('p', 'small muted', interpretation.explanation));
  valuation.append(node('p', 'source-heading', `Price source: ${brief.prices.source || 'Not supplied'}`), node('p', 'small mono muted', `Valuation status: ${brief.prices.valuationStatus || 'Not supplied'}`));
  const volumes = node('dl', 'volume-row');
  for (const [label, value] of [['Reported volume', brief.volume.reported], ['Total volume', brief.volume.total]]) { const entry = node('div'); entry.append(node('dt', '', label), node('dd', '', value === null ? 'Not supplied' : `${value} USDC`)); volumes.append(entry); }
  valuation.append(volumes, node('p', 'small muted', 'Separate provider fields. Neither is labelled liquidity, and they are not added together.')); sheet.append(valuation);

  const checks = section('04', 'Information checks'), list = node('ul', 'checks');
  for (const check of brief.checks) {
    const li = node('li', 'check'), info = node('div');
    li.append(node('span', `check-state${check.status === 'attention' ? ' attention' : check.status === 'missing' ? ' missing-state' : ''}`, check.status));
    info.append(node('h4', '', check.label), node('p', '', check.detail), node('span', 'check-field', check.field)); li.append(info); list.append(li);
  }
  if (!brief.checks.length) checks.append(node('p', 'small muted', 'No checks were supplied. This does not establish that the record is complete.'));
  else checks.append(list);
  sheet.append(checks);

  const comparison = section('05', 'Your local checkpoint', 'checkpoint-section');
  if (state.checkpoint) {
    comparison.append(node('p', 'checkpoint-intro', 'Compare this capture with the checkpoint kept in this browser.'), node('span', 'checkpoint-meta', `CHECKPOINT · ${time(state.checkpoint.provenance.fetchedAt)} · ${state.checkpoint.provenance.mode}`));
    const changes = compareBriefs(state.checkpoint, brief);
    comparison.append(node('p', 'comparison-summary', changes.length ? `${changes.length} tracked field${changes.length === 1 ? '' : 's'} changed` : 'No tracked data differences'));
    if (state.checkpoint.provenance.mode !== brief.provenance.mode) comparison.append(node('p', 'small muted', 'The capture modes differ. This comparison includes a recorded response; it is not a continuous live history.'));
    if (Date.parse(brief.provenance.fetchedAt) < Date.parse(state.checkpoint.provenance.fetchedAt)) comparison.append(node('p', 'small muted', 'The current capture is older than your checkpoint. Before/after labels describe the comparison, not chronological order.'));
    if (changes.length) {
      const diffs = node('ol', 'diff-list');
      for (const change of changes) {
        const li = node('li', 'diff'); li.append(node('h4', '', change.label));
        const values = node('div', 'diff-values');
        for (const [label, value] of [['Before · checkpoint', change.before], ['After · current capture', change.after]]) { const column = node('p', 'diff-value'); column.append(node('span', '', label), document.createTextNode(displayValue(value))); values.append(column); }
        li.append(values); diffs.append(li);
      }
      comparison.append(diffs);
    }
    comparison.append(node('p', 'small muted date-note', 'Capture timestamps, request identifiers and derived checks do not count as data changes. Export includes both captures. Replacing the checkpoint sets the current capture as your new baseline.'));
  } else {
    const message = state.checkpointKind === 'invalid' ? 'The stored checkpoint could not be validated and was not loaded. Save this capture to replace it.' : state.checkpointKind === 'unavailable' ? 'Local storage is unavailable in this browser. Export JSON to preserve this capture.' : 'Save a checkpoint, then refresh to compare the same market. Changes appear here with the original and current values.';
    comparison.append(node('p', 'checkpoint-intro', message), node('p', 'small muted date-note', 'Stored only in this browser. Nothing is monitored in the background. Clearing browser data removes local checkpoints.'));
  }
  sheet.append(comparison);

  const origin = node('section', 'provenance-section'), details = node('details');
  details.append(node('summary', '', 'Capture provenance & provider fields'));
  const originList = node('dl', 'origin-grid');
  for (const [label, value] of [['Provider', 'Panta'], ['Mode', brief.provenance.mode], ['Capture time', brief.provenance.fetchedAt], ['From cache', brief.provenance.cached ? 'Yes' : 'No'], ['Endpoint', brief.provenance.endpoint], ['Request ID', brief.provenance.requestId], ['Oracle', brief.providerFields.oracle], ['Resolved flag', brief.providerFields.resolved]]) originList.append(node('dt', '', label), node('dd', 'mono', displayValue(value)));
  details.append(originList); origin.append(details); sheet.append(origin);
}

$('search').addEventListener('input', (event) => { state.search = event.target.value.slice(0, 200); reflectURL(); renderCatalogue(); });
$('category').addEventListener('change', (event) => { state.category = event.target.value; reflectURL(); renderCatalogue(); });
$('load-more').addEventListener('click', () => loadCatalogue());
window.addEventListener('hashchange', () => { let id = ''; try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; } if (isMarketId(id)) selectMarket(id, { focus: true }); });
function offlineState() { $('offline').hidden = navigator.onLine; }
window.addEventListener('online', offlineState); window.addEventListener('offline', offlineState); offlineState();
window.addEventListener('storage', (event) => { if (state.selected && (event.key === null || event.key === `sourcebrief:v1:${state.selected}`)) { loadCheckpoint(state.selected); renderSheet(); announce('The local checkpoint changed in another tab.'); } });
loadCatalogue();

import {normalize, filterRecords, searchURL, citation, csv, compareRecord, histogram} from './model.mjs';
const $ = id => document.getElementById(id);
const state = {ledger: null, mode: 'saved', capture: 0, topic: '', records: [], visible: [], selected: '', liveAt: '', liveURL: '', busy: false};
const cache = new Map(); // Tab memory only; no persistent queries or visitor identifiers.
let nextRequestAt = 0;
let viewGeneration = 0;
let activeRequest = null;
const el = (tag, content, className) => { const node = document.createElement(tag); if (content !== undefined) node.textContent = content; if (className) node.className = className; return node; };
const prettyDate = value => value ? new Intl.DateTimeFormat('en-CA', {year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(value)) : 'Not supplied';
const datetime = value => value ? `${prettyDate(value)} · ${String(value).slice(11,16)} UTC` : 'Not supplied';
function link(label, href) { const a = el('a', label); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function capture() { return state.ledger?.captures[state.capture]; }
function previousRecords() { const previous = state.ledger?.captures[state.capture + 1]; return state.mode === 'saved' && previous ? previous.records.map(r => normalize(r.work, r.topics)) : null; }
function setSaved() {
  const current = capture(); if (!current) { state.records = []; render(); status('Saved collection unavailable. Search Crossref can retrieve live records.',true); return; }
  state.records = current.records.map(r => normalize(r.work, r.topics));
  $('history-note').textContent = state.ledger.captures[state.capture + 1] ? `Compared with ${datetime(state.ledger.captures[state.capture + 1].capturedAt)}. Search sample membership can change.` : 'This is the earliest retained capture. It establishes a baseline; no earlier comparison is available.';
  render();
}
function setMode(mode) {
  viewGeneration++; if (activeRequest) activeRequest.abort();
  state.mode = mode;
  $('saved-controls').hidden = mode !== 'saved'; $('search-form').hidden = mode !== 'live';
  for (const option of ['saved', 'live']) { $(option + '-mode').classList.toggle('active', option === mode); $(option + '-mode').setAttribute('aria-pressed', String(option === mode)); }
  $('filter').value = ''; state.selected = '';
  if (mode === 'saved') setSaved();
  else { state.records = []; render(); status('Enter a search to retrieve up to 40 live matches from Crossref.'); $('search-query').focus(); }
}
function render() {
  state.visible = filterRecords(state.records, {query:$('filter').value, topic:state.mode === 'saved' ? state.topic : '', sort:$('sort').value});
  $('record-count').textContent = state.visible.length;
  $('funding-count').textContent = state.visible.filter(r => r.funders.length).length;
  $('view-label').textContent = state.mode === 'saved' ? 'CURATED SEARCH SAMPLE' : 'LIVE CROSSREF RESULTS';
  $('view-title').textContent = state.mode === 'saved' ? ({wildfire:'Wildfire & health',water:'Water & climate',open:'Open government'}[state.topic] || 'A Canadian reading room') : 'Follow your question';
  if (state.mode === 'saved' && capture()) status(`${state.visible.length} of ${state.records.length} records · captured ${datetime(capture().capturedAt)} · search sample, not complete coverage.`);
  $('export-csv').disabled = !state.visible.length;
  renderTimeline();
  const results = $('results'); results.replaceChildren();
  if (!state.visible.some(r => r.id === state.selected)) state.selected = state.visible[0]?.id || '';
  for (const record of state.visible) {
    const button = el('button', undefined, 'record' + (record.id === state.selected ? ' active' : ''));
    button.type = 'button'; button.dataset.doi = record.id; button.setAttribute('aria-pressed', String(record.id === state.selected));
    const top = el('div', undefined, 'record-top'); top.append(el('span', record.published || 'Undated'), el('span', record.type));
    const authors = record.authors.length ? record.authors.slice(0, 2).join('; ') + (record.authors.length > 2 ? ` + ${record.authors.length - 2} more` : '') : 'Authors not supplied';
    const bottom = el('div', undefined, 'record-bottom'); bottom.append(el('span', record.citations === null ? 'Count not supplied' : `${record.citations.toLocaleString()} Crossref citations`));
    if (record.funders.length) bottom.append(el('span', 'Funding recorded'));
    if (record.updates.length) bottom.append(el('span', 'Update links recorded'));
    button.append(top, el('h3', record.title), el('p', authors), bottom);
    button.addEventListener('click', () => { state.selected = record.id; document.querySelectorAll('.record').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed',String(b === button)); }); renderDetail(record); });
    results.append(button);
  }
  if (!state.visible.length) results.append(el('p', state.records.length ? 'No records match this filter. Try a shorter term or choose another topic.' : state.mode === 'live' ? 'Your next research trail starts here. Search by topic, title, author or DOI.' : 'The saved sample is unavailable. Try Search Crossref for live records.', 'empty'));
  renderDetail(state.visible.find(r => r.id === state.selected));
}
function renderTimeline() {
  const container = $('timeline'); container.replaceChildren();
  const bars = histogram(state.visible), maximum = Math.max(1, ...bars.map(b => b[1]));
  if (!bars.length) { container.append(el('p', 'Publication years appear after records are loaded.', 'help')); return; }
  for (const [year, count] of bars) { const column = el('div', undefined, 'bar-column'); column.title = `${year}: ${count} records in this view`; column.setAttribute('aria-label', column.title); const bar = el('div', undefined, 'bar'); bar.style.height = `${Math.max(5, count / maximum * 62)}px`; column.append(bar, el('small', year)); container.append(column); }
}
function section(title, contents) { const block = el('section', undefined, 'detail-block'); block.append(el('h3', title)); for (const content of contents) block.append(content); return block; }
function renderDetail(record) {
  const detail = $('detail'); detail.replaceChildren();
  if (!record) { detail.append(el('p', 'Select a research record to inspect authors, funding, updates and source dates.', 'help')); return; }
  detail.append(el('p', 'THE RECORD / ' + record.type.toUpperCase(), 'section-label'), el('h2', record.title), el('p', record.authors.join('; ') || 'Author metadata not supplied.', 'detail-authors'));
  const doiLink = link(record.id + ' ↗', 'https://doi.org/' + record.id); doiLink.className = 'doi-link'; detail.append(doiLink);
  const actions = el('div', undefined, 'detail-actions');
  const copy = el('button', 'Copy citation'); copy.id = 'copy-citation'; copy.addEventListener('click', async () => { const value = citation(record); try { await navigator.clipboard.writeText(value); status('Bibliographic citation copied. Check formatting against your required style.'); } catch { const pre = el('pre', value); detail.append(pre); status('Copy the citation displayed below the record.'); } });
  const save = el('button', 'Save receipt JSON ↓'); save.id = 'save-receipt'; save.addEventListener('click', () => download('research-receipt.json', JSON.stringify({tool:'Research Ledger',provider:'Crossref',capturedAt:state.mode === 'saved' ? capture().capturedAt : state.liveAt,source:state.mode === 'live' ? state.liveURL : capture().sources,record:record.raw,limitations:'Metadata, not full text. Missing fields are not evidence of absence.'},null,2),'application/json'));
  actions.append(copy, save); detail.append(actions);
  const metadata = el('dl', undefined, 'metadata');
  for (const [name, value] of [['Published',record.published || 'Not supplied'],['Cited-by in Crossref',record.citations === null ? 'Not supplied' : record.citations.toLocaleString()],['Journal / series',record.journal || 'Not supplied'],['Publisher',record.publisher || 'Not supplied']]) { const entry = el('div'); entry.append(el('dt',name),el('dd',value)); metadata.append(entry); }
  detail.append(metadata);
  const funders = el('ul'); for (const f of record.funders) funders.append(el('li', f.name + (f.awards.length ? ` · Award ${f.awards.join(', ')}` : '')));
  detail.append(section('Funding in this record', record.funders.length ? [funders] : [el('p','No funding metadata was supplied in this record. This does not establish that the work was unfunded.')]));
  const updates = [...record.updates, ...record.relations];
  if (updates.length) { const list = el('ul'); for (const u of updates) { const item = el('li'); item.append(document.createTextNode(u.kind.replaceAll('-', ' ') + (u.date ? ` (${u.date})` : '') + ': ')); if (u.idType === 'doi' && /^10\.\d{4,9}\/\S+$/.test(u.id)) item.append(link(u.id,'https://doi.org/' + u.id)); else item.append(document.createTextNode(u.id)); list.append(item); } detail.append(section('Recorded updates & relationships', [list,el('p','These are directional links supplied in metadata. They may point from an update notice to the affected work; they are not a complete correction or retraction check.')])); }
  else detail.append(section('Recorded updates & relationships',[el('p','No update or relationship links were supplied in this record. Check the publisher for current status; this is not confirmation that there have been no corrections or retractions.')]));
  const comparison = compareRecord(record, previousRecords());
  const comparisonText = state.mode === 'live' ? 'Live lookup. This result is not added to the public snapshot history.' : comparison.status === 'baseline' ? 'Baseline capture. A second weekly capture is needed to compare this record over time.' : comparison.status === 'new-to-sample' ? 'New to this retained search sample. This does not mean newly published.' : `${comparison.citationChange === null ? 'Citation count not comparable' : `Crossref cited-by change: ${comparison.citationChange > 0 ? '+' : ''}${comparison.citationChange}`} · ${comparison.changedFields.length ? 'Changed metadata: ' + comparison.changedFields.join(', ') : 'No changes in the compared bibliographic fields'}. Counts may also fall when provider records are revised.`;
  detail.append(section('Capture comparison',[el('p',comparisonText)]));
  const timing = el('p', `Metadata deposited: ${record.deposited ? prettyDate(record.deposited) : 'not supplied'}. Indexed by Crossref: ${record.indexed ? prettyDate(record.indexed) : 'not supplied'}. Captured here: ${datetime(state.mode === 'saved' ? capture().capturedAt : state.liveAt)}.`);
  detail.append(section('Dates & provenance',[timing,link('Inspect the Crossref source JSON ↗', 'https://api.crossref.org/works/' + encodeURIComponent(record.id))]));
}
function download(filename, contents, type) { const url = URL.createObjectURL(new Blob([contents],{type})); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url),1000); status('Download prepared. The receipt includes the original capture time and source.'); }
async function liveSearch(event) {
  event.preventDefault(); if (state.busy) return;
  let url; try { url = searchURL({query:$('search-query').value,mode:$('search-mode').value,from:$('from').value,until:$('until').value}); } catch (error) { status(error.message,true); return; }
  const previous = cache.get(url);
  if (previous && Date.now() - previous.time < 15 * 60 * 1000) { applyLive(previous.payload, url, previous.at); status(`${state.records.length} results · reused this tab's 15-minute cache · captured ${datetime(previous.at)}.`); return; }
  if (Date.now() < nextRequestAt) { status(`Please wait ${Math.ceil((nextRequestAt-Date.now())/1000)} seconds before another provider request.`,true); return; }
  state.busy = true; $('search-submit').disabled = true; status('Searching Crossref…');
  const generation = viewGeneration;
  const controller = new AbortController(); activeRequest = controller; const timer = setTimeout(() => controller.abort(),30000);
  try {
    const response = await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'},referrerPolicy:'no-referrer'});
    nextRequestAt = Date.now() + 1500;
    if (response.status === 429 || response.status === 503) {
      const retry = response.headers.get('Retry-After'); const seconds = /^\d+$/.test(retry || '') ? Number(retry) : Math.max(30, (Date.parse(retry) - Date.now())/1000 || 30);
      nextRequestAt = Date.now() + Math.max(30,seconds) * 1000;
      throw new Error(`Crossref is busy or limiting requests. Wait ${Math.ceil(Math.max(30,seconds))} seconds, then try again. Your existing results remain available.`);
    }
    if (response.status === 404) throw new Error('Crossref could not find that DOI. Check the identifier; some DOIs are registered with other agencies.');
    if (!response.ok) throw new Error(`Crossref returned HTTP ${response.status}. Try again later or explore the saved collection.`);
    const payload = await response.json();
    if (generation !== viewGeneration) return;
    const at = new Date().toISOString(); applyLive(payload,url,at); cache.set(url,{payload,at,time:Date.now()});
    if (cache.size > 20) cache.delete(cache.keys().next().value);
    status(`${state.records.length} ${state.records.length === 1 ? 'record' : 'ranked results'} · live capture ${datetime(at)}${payload.message?.['total-results'] ? ' · a limited page, not every matching record' : ''}.`);
  } catch (error) { if (generation !== viewGeneration) return; status(error.name === 'AbortError' ? 'Crossref did not respond within 30 seconds. Please retry or use the saved sample.' : error instanceof TypeError ? 'Could not reach Crossref. Check your connection or use the saved sample; existing results are preserved.' : error.message,true); }
  finally { clearTimeout(timer); activeRequest = null; state.busy = false; $('search-submit').disabled = false; }
}
function applyLive(payload,url,at) {
  if (payload.status !== 'ok' || !payload.message) throw new Error('Crossref returned an unexpected response. Existing results were preserved.');
  const raw = payload.message.items || (payload.message.DOI ? [payload.message] : null);
  if (!Array.isArray(raw)) throw new Error('Crossref returned an unexpected result format.');
  const records = raw.map(r => normalize(r));
  state.records = records; state.liveURL = url; state.liveAt = at; state.selected = ''; $('filter').value = ''; render();
}
$('saved-mode').addEventListener('click', () => setMode('saved'));
$('live-mode').addEventListener('click', () => setMode('live'));
$('capture').addEventListener('change', () => { state.capture = Number($('capture').value); setSaved(); });
$('topic-buttons').addEventListener('click', event => { const button = event.target.closest('button[data-topic]'); if (!button) return; state.topic = button.dataset.topic; $('filter').value = ''; document.querySelectorAll('[data-topic]').forEach(b => b.classList.toggle('selected',b===button)); render(); });
$('filter').addEventListener('input',render); $('sort').addEventListener('change',render);
$('search-form').addEventListener('submit',liveSearch);
$('search-mode').addEventListener('change',() => { const disabled = $('search-mode').value === 'doi'; $('from').disabled = disabled; $('until').disabled = disabled; });
$('export-csv').addEventListener('click',() => download('research-ledger.csv',csv(state.visible),'text/csv;charset=utf-8'));
try {
  const response = await fetch('./data/ledger.json'); if (!response.ok) throw new Error('Saved collection unavailable');
  state.ledger = await response.json(); if (!state.ledger.captures?.length) throw new Error('No captures');
  $('capture-count').textContent = state.ledger.captures.length;
  $('latest-date').textContent = prettyDate(state.ledger.captures[0].capturedAt);
  state.ledger.captures.forEach((c,i) => { const option=el('option',datetime(c.capturedAt)); option.value=i; $('capture').append(option); });
  setSaved();
} catch { $('latest-date').textContent = 'Saved sample unavailable'; $('capture-count').textContent='0'; state.records=[]; render(); status('The saved collection could not load. Search Crossref remains available for live lookups.',true); }

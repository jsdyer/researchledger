export const CONTACT = 'jeffdyer@gmail.com';
export function text(value) { return String(value ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,v)=>{const n=v[0].toLowerCase()==='x'?parseInt(v.slice(1),16):Number(v);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}).trim(); }
export function doi(value) {
  const cleaned = String(value ?? '').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').toLowerCase();
  return /^10\.\d{4,9}\/\S+$/.test(cleaned) ? cleaned : '';
}
export function dateParts(field) {
  const parts = field?.['date-parts']?.[0];
  return Array.isArray(parts) && Number.isInteger(parts[0]) ? parts.slice(0, 3).map((v, i) => i ? String(v).padStart(2, '0') : String(v)).join('-') : '';
}
export function normalize(raw, topics = []) {
  const id = doi(raw?.DOI);
  if (!id) throw new Error('The provider returned a record without a valid DOI.');
  const relations = Object.entries(raw.relation || {}).flatMap(([kind, values]) => Array.isArray(values) ? values.map(v => ({kind, id: text(v.id), idType: text(v['id-type'])})) : []);
  const updates = (raw['update-to'] || []).map(v => ({kind: text(v.type || 'update'), id: doi(v.DOI), date: dateParts(v.updated), idType: 'doi'}));
  return {
    id, title: text(raw.title?.[0] || 'Untitled record'), authors: (raw.author || []).map(a => text(a.name || [a.given, a.family].filter(Boolean).join(' '))).filter(Boolean),
    publisher: text(raw.publisher), journal: text(raw['container-title']?.[0]), type: text(raw.type).replaceAll('-', ' '),
    published: dateParts(raw.published) || dateParts(raw['published-online']) || dateParts(raw['published-print']),
    citations: Number.isInteger(raw['is-referenced-by-count']) ? raw['is-referenced-by-count'] : null,
    funders: (raw.funder || []).map(f => ({name: text(f.name), awards: (f.award || []).map(text), doi: doi(f.DOI)})),
    deposited: raw.deposited?.['date-time'] || dateParts(raw.deposited), indexed: raw.indexed?.['date-time'] || dateParts(raw.indexed),
    affiliations: [...new Set((raw.author||[]).flatMap(a=>(a.affiliation||[]).map(x=>text([x.name,...(x.place||[])].filter(Boolean).join(' ')))).filter(Boolean))],
    relations, updates, topics, raw
  };
}
export function filterRecords(records, {query = '', topic = '', type = '', from = '', until = '', sort = 'newest', institution = null} = {}) {
  const q = query.toLocaleLowerCase();
  const matching = records.filter(r => (!q || [r.title, r.id, r.publisher, r.journal, ...r.authors, ...r.funders.map(f => f.name)].join(' ').toLocaleLowerCase().includes(q)) &&
    (!institution || institutionMatch(r,institution)) && (!topic || r.topics.includes(topic)) && (!type || r.type === type) && (!from || (r.published && r.published >= from)) && (!until || (r.published && r.published <= until + '-99')));
  return matching.sort((a, b) => sort === 'citations' ? (b.citations ?? -1) - (a.citations ?? -1) || a.title.localeCompare(b.title) : sort === 'title' ? a.title.localeCompare(b.title) : b.published.localeCompare(a.published) || a.title.localeCompare(b.title));
}
export function searchURL({query, mode = 'topic', from = '', until = '', affiliation = ''}) {
  if (!query.trim()) throw new Error('Enter a topic, author, title or DOI.');
  if (query.length > 300) throw new Error('Keep your search below 300 characters.');
  if (mode !== 'doi' && from && until && from > until) throw new Error('The start date must be before the end date.');
  const url = new URL('https://api.crossref.org/works');
  if (mode === 'doi') {
    const id = doi(query); if (!id) throw new Error('Enter a DOI such as 10.3386/w33912.');
    url.pathname += '/' + encodeURIComponent(id);
  } else {
    url.searchParams.set(mode === 'author' ? 'query.author' : mode === 'title' ? 'query.title' : 'query', query.trim());
    url.searchParams.set('rows', '40');
    if (affiliation) url.searchParams.set('query.affiliation',affiliation);
    const filters = [from && `from-pub-date:${from}`, until && `until-pub-date:${until}`].filter(Boolean);
    if (filters.length) url.searchParams.set('filter', filters.join(','));
  }
  url.searchParams.set('mailto', CONTACT);
  return url.href;
}
export function citation(record) {
  return `${record.authors.join('; ') || 'Author not supplied'}. (${record.published || 'Date not supplied'}). ${record.title}. ${record.journal || record.publisher || 'Publication not supplied'}. https://doi.org/${record.id}`;
}
export function csv(records) {
  const cell = value => '"' + String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"';
  const header = ['DOI', 'Title', 'Authors', 'Published', 'Publisher', 'Journal', 'Crossref cited-by', 'Funders', 'Recorded update links'];
  return [header, ...records.map(r => [r.id, r.title, r.authors.join('; '), r.published, r.publisher, r.journal, r.citations ?? '', r.funders.map(f => f.name).join('; '), r.updates.map(u => `${u.kind}: ${u.id}`).join('; ')])].map(row => row.map(cell).join(',')).join('\r\n');
}
export function compareRecord(record, previousRecords) {
  if (!previousRecords) return {status: 'baseline'};
  const before = previousRecords.find(r => r.id === record.id);
  if (!before) return {status: 'new-to-sample'};
  return {status: 'matched', citationChange: record.citations !== null && before.citations !== null ? record.citations - before.citations : null,
    changedFields: ['title', 'publisher', 'authors', 'funders', 'updates', 'relations', 'published'].filter(key => JSON.stringify(before[key]) !== JSON.stringify(record[key]))};
}
export function histogram(records) {
  const counts = new Map();
  for (const r of records) if (r.published) { const year = r.published.slice(0, 4); counts.set(year, (counts.get(year) || 0) + 1); }
  return [...counts].sort(([a], [b]) => a.localeCompare(b));
}

export function institutionMatch(record,institution){return (record.affiliations||[]).some(value=>{const text=value.toLocaleLowerCase().replaceAll('’',"'");return institution.aliases.some(alias=>text.includes(alias))&&(!institution.context||institution.context.some(word=>text.includes(word)));});}
export function validateSavedSearches(raw){if(!Array.isArray(raw))return [];return raw.slice(0,40).filter(x=>x&&typeof x.query==='string'&&x.query.trim()&&x.query.length<=300&&['topic','title','author','doi'].includes(x.mode)&&typeof x.from==='string'&&typeof x.until==='string').map(x=>({query:x.query,mode:x.mode,from:x.from.slice(0,10),until:x.until.slice(0,10),institution:typeof x.institution==='string'?x.institution.slice(0,30):''}));}

# Research Ledger

A public browser application at **https://coolcode.ca/researchledger/** for finding the research behind a claim. It searches Crossref and retains dated, Canadian-topic metadata samples. No API key or visitor account is required.

<!-- coolcode:guide -->
Start with the saved wildfire, water or open-government collection, then inspect a paper's authors, funding and recorded update links. Search Crossref by topic, title, author or DOI for other work; export a CSV or save a timestamped receipt. Missing funding or correction metadata means unknown, and citation counts are incomplete—not a measure of quality.
<!-- /coolcode:guide -->

## What works

- Three real saved searches: `Canada wildfire smoke health`, `Canada freshwater climate change`, and `Canada open government data` (25 ranked journal-article results each, deduplicated by DOI).
- Live Crossref searches by topic, title, author and exact DOI. Publication-date filters apply to searches, not DOI lookups. Up to 40 results are fetched per explicit submission.
- Local filter over title, authors, funders, journal, publisher and DOI; date/title/cited-by sorting; publication-year bars for the current view.
- Evidence detail: authors, publisher, publication date, journal, cited-by count, funding organizations and awards, directional update/relation links, deposit/index/capture dates.
- Citation copy, CSV export and JSON evidence receipts that retain the capture time, source query and original selected metadata.
- Weekly retained snapshots with citation-count and bibliographic-field comparison against the immediately preceding capture. The first real capture is explicitly a baseline, never invented historical evidence.

## Sources and interpretation

[Crossref's REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/) provides bibliographic metadata deposited by publishers and other trusted sources. [Crossref's API guidance](https://www.crossref.org/documentation/retrieve-metadata/rest-api/tips-for-using-the-crossref-rest-api/) explains query filters, caching and date semantics. The implementation was checked against the live API on 2026-11-23; the API returned `Access-Control-Allow-Origin: *` for browser reads.

The fixed queries use the `type:journal-article` filter; live searches also find reports, books and other registered content. The fixed queries are discovery samples, **not all Canadian research**. They can include tangential matches or records from elsewhere. Their ranking and membership can change. The publication timeline counts only displayed results, not total research production. “New to sample” does not mean newly published. An earlier publication date is not evidence this tool archived the record on that date.

Crossref cited-by counts are partial and may rise or fall when metadata changes. Funding and corrections are recorded only where metadata supplies them. `update-to` is directional and often appears on a correction notice pointing at an affected paper; an empty field does not mean a work is uncorrected, unretracted or unfunded. Always follow the DOI to the publisher and check current status. Deposit/index dates describe registry changes, not necessarily changes to the article.

No abstracts or full text are mirrored. Publisher content and images are not fetched. A DOI link may lead to content requiring access. Citations are simple bibliographic strings, not guaranteed APA/MLA formatting.

## Collection and retention

`python3 scripts/collect.py` fetches the three fixed searches sequentially with an identifying User-Agent and `mailto=jeffdyer@gmail.com`. It validates every record, waits between requests, and retries 429/503 responses with backoff. Partial failures leave the previous data untouched.

The Pages workflow refreshes at **05:43 UTC on Mondays** or when manually dispatched with **Refresh saved research sample** enabled. GitHub schedules are best effort. Tests and build/browser checks must succeed before changed data is committed and deployed. The app retains the latest **16 actual captures** in `web/data/ledger.json`; older committed data remains in Git history. New captures do not manufacture a pre-launch history. The build itself is offline and works from the last committed collection.

### Privacy and API behavior

Saved sample browsing requests only static site files. Live search sends the submitted query/DOI and date filters directly to `api.crossref.org`, together with the public project contact address. The provider sees normal connection metadata. No secret key is embedded. Repeated identical queries use a 15-minute cache **in tab memory**, limited to 20 entries. Requests are explicit, serialized and spaced; rate-limit responses set a cooldown, with no polling. Queries, results and clipboard text are not written to persistent browser storage or published. Exported files are saved only at the visitor's request.

The standard CoolCode shared visit counter is included by the site template. Research text is rendered as text, not executable HTML. CSV cells are quoted and formula prefixes escaped.

## Development

Python 3.12+ and Node 24+. No npm installation needed.

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -v
python3 scripts/build.py
```

CI also installs `tests/browser-requirements.txt` and runs `tests/browser_smoke.py` against the built project subpath. It checks saved-data browsing, filtering, exports, a mocked live search, safe rendering and mobile overflow. Builds output `dist/` (not committed). Keep all asset paths relative for GitHub Pages project hosting.

`tool.json` is the CoolCode catalogue record. No CNAME is used; the parent catalogue owns `coolcode.ca`.

<!-- schedule-reliability -->
## Schedule reliability

Public GitHub repositories can have scheduled workflows disabled after 60 days of inactivity. A separate weekly [schedule guard](.github/workflows/schedule-guard.yml) calls GitHub's enable-workflow API for an explicit list of refresh workflows and itself. It can restore workflows disabled for inactivity, preserves manually disabled workflows, and runs independently of collection failures.

This is an interim mitigation, not a scheduling guarantee: GitHub does not document active-workflow renewal as a permanent exemption, and scheduled runs can be delayed or dropped. A scheduler on our own Linux server is the planned independent trigger. The guard does not collect data, create dummy commits, or change source/check timestamps; successful collection and published data freshness still need monitoring.
<!-- /schedule-reliability -->

#!/usr/bin/env python3
"""Capture a small, reproducible Crossref sample. Never change files on partial failure."""
from datetime import datetime, timezone
from html import unescape
import json
from pathlib import Path
import re
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
TOPICS = [
    {"id": "wildfire", "label": "Wildfire & health", "query": "Canada wildfire smoke health"},
    {"id": "water", "label": "Water & climate", "query": "Canada freshwater climate change"},
    {"id": "open", "label": "Open government", "query": "Canada open government data"},
]
CONTACT = "jeffdyer@gmail.com"
FIELDS = {"DOI", "title", "author", "publisher", "container-title", "type", "published", "published-online", "published-print", "created", "deposited", "indexed", "is-referenced-by-count", "funder", "update-to", "relation", "URL", "license"}


def clean(value):
    return unescape(re.sub(r"<[^>]*>", "", str(value or ""))).strip()


def normalize(item):
    doi = str(item.get("DOI", "")).strip().lower()
    if not re.fullmatch(r"10\.\d{4,9}/\S+", doi):
        raise ValueError("Crossref returned an invalid DOI")
    if not item.get("title"):
        raise ValueError(f"Crossref record lacks title: {doi}")
    # Keep only the metadata used in the application; never mirror abstracts or full text.
    result = {key: item[key] for key in FIELDS if key in item}
    result["DOI"] = doi
    result["title"] = [clean(title) for title in result["title"]]
    return result


def fetch(url):
    for attempt in range(3):
        try:
            request = Request(url, headers={"User-Agent": f"CoolCode ResearchLedger/1.0 (https://coolcode.ca/researchledger/; mailto:{CONTACT})", "Accept": "application/json"})
            with urlopen(request, timeout=45) as response:
                data = json.load(response)
            if data.get("status") != "ok" or not isinstance(data.get("message", {}).get("items"), list):
                raise ValueError("Unexpected Crossref response")
            return data["message"]
        except HTTPError as exc:
            if exc.code not in (429, 503) or attempt == 2:
                raise
            delay = max(2 ** (attempt + 1), int(exc.headers.get("Retry-After", "5")))
            if delay > 60:
                raise RuntimeError("Crossref asked for a longer pause; retry in a later workflow") from exc
            time.sleep(delay)
    raise RuntimeError("Crossref unavailable")


def affiliations(item):
    return [clean(' '.join([str(a.get('name','')),*a.get('place',[])])).lower().replace('’',"'") for author in item.get('author',[]) for a in author.get('affiliation',[]) if isinstance(a,dict)]


def matches_institution(item,institution):
    return any(any(alias in value for alias in institution['aliases']) and (not institution.get('context') or any(context in value for context in institution['context'])) for value in affiliations(item))


def collect(fetcher=fetch, existing=None):
    records, sources = {}, []
    for topic in TOPICS:
        url = "https://api.crossref.org/works?" + urlencode({"query": topic["query"], "filter": "type:journal-article", "rows": 25, "mailto": CONTACT})
        message = fetcher(url)
        if len(message["items"]) < 5:
            raise ValueError("Incomplete sample: fewer than five results")
        sources.append({**topic, "url": url, "totalResults": message.get("total-results"), "returned": len(message["items"])})
        for item in message["items"]:
            normalized = normalize(item)
            entry = records.setdefault(normalized["DOI"], {"work": normalized, "topics": []})
            entry["topics"].append(topic["id"])
        if fetcher is fetch:
            time.sleep(1)
    config=json.loads((ROOT/'web/config.json').read_text())
    for institution in config['institutions']:
        url='https://api.crossref.org/works?'+urlencode({'query.affiliation':institution['query'],'filter':f'type:journal-article,from-pub-date:{datetime.now(timezone.utc).year-4}-01-01,until-pub-date:{datetime.now(timezone.utc).date().isoformat()}','sort':'relevance','rows':config['institutionRows'],'mailto':CONTACT})
        message=fetcher(url)
        accepted=[item for item in message['items'] if matches_institution(item,institution)]
        sources.append({'id':'institution-'+institution['id'],'label':institution['label'],'query':institution['query'],'url':url,'totalResults':message.get('total-results'),'returned':len(message['items']),'affiliationMatches':len(accepted),'limitation':'Relevance-ranked sample from the current and previous four calendar years. Requires a supplied author affiliation; not a complete or exhaustive latest-publication list.'})
        for item in accepted:
            normalized=normalize(item)
            entry=records.setdefault(normalized['DOI'],{'work':normalized,'topics':[]})
            if 'institution-'+institution['id'] not in entry['topics']:entry['topics'].append('institution-'+institution['id'])
        if fetcher is fetch:time.sleep(1.5)
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    capture = {"id": now.replace(":", "-"), "capturedAt": now, "sources": sources, "records": list(records.values())}
    old = (existing or {}).get("captures", [])
    # Every capture is a real observation; no invented pre-launch history.
    return {"schemaVersion": 1, "provider": "Crossref", "retention": "Latest 16 captures in the app; older versions remain in Git history.", "captures": [capture, *old][:16]}


def main():
    target = ROOT / "web/data/ledger.json"
    existing = json.loads(target.read_text()) if target.exists() else None
    result = collect(existing=existing)
    target.parent.mkdir(exist_ok=True)
    staging = target.with_suffix(".tmp")
    staging.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    staging.replace(target)
    (ROOT/"web/data/institution-coverage.json").write_text(json.dumps({"schemaVersion":1,"checkedAt":result["captures"][0]["capturedAt"],"institutions":json.loads((ROOT/"web/config.json").read_text())["institutions"]})+"\n")
    print(f"Captured {len(result['captures'][0]['records'])} real Crossref records at {result['captures'][0]['capturedAt']}")


if __name__ == "__main__":
    main()

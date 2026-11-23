"""CI browser check: saved metadata, real UI interactions, and a deterministic API fixture."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import shutil
import tempfile
import threading
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass

def main():
    screenshots=ROOT/'browser-checks'; screenshots.mkdir(exist_ok=True)
    records=json.loads((ROOT/'web/data/ledger.json').read_text())['captures'][0]['records']
    topic_count=sum('wildfire' in r['topics'] for r in records)
    with tempfile.TemporaryDirectory() as temporary:
        shutil.copytree(ROOT/'dist',Path(temporary)/'researchledger')
        server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=temporary))
        threading.Thread(target=server.serve_forever,daemon=True).start()
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch()
                page=browser.new_page(viewport={'width':1440,'height':1100})
                errors=[]; page.on('pageerror',lambda error:errors.append(str(error)))
                page.goto(f'http://127.0.0.1:{server.server_port}/researchledger/')
                expect(page.locator('#record-count')).to_have_text(str(len(records)))
                expect(page.locator('#detail')).to_contain_text('Capture comparison')
                page.locator('[data-topic="wildfire"]').click()
                expect(page.locator('#record-count')).to_have_text(str(topic_count))
                page.locator('#filter').fill('no-record-could-match-this')
                expect(page.locator('#record-count')).to_have_text('0')
                page.locator('#filter').fill('')
                page.locator('.record').first.click()
                with page.expect_download() as download:
                    page.locator('#save-receipt').click()
                receipt=json.loads(Path(download.value.path()).read_text())
                assert receipt['provider']=='Crossref' and receipt['capturedAt'].endswith('Z')
                assert receipt['record']['DOI'].startswith('10.')
                with page.expect_download() as csv_download: page.locator('#export-csv').click()
                assert 'Crossref cited-by' in Path(csv_download.value.path()).read_text()
                page.screenshot(path=str(screenshots/'desktop.png'),full_page=True)
                fixture={'status':'ok','message':{'items':[{'DOI':'10.1234/test','title':['<img src=x onerror="alert(1)"> Fixture record'],'author':[{'given':'Test','family':'Researcher'}],'published':{'date-parts':[[2024,3]]},'is-referenced-by-count':0}],'total-results':1}}
                page.route('https://api.crossref.org/**',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps(fixture)))
                page.locator('#live-mode').click(); page.locator('#search-query').fill('fixture research'); page.locator('#search-submit').click()
                expect(page.locator('#results')).to_contain_text('Fixture record')
                assert page.locator('#results img').count()==0
                expect(page.locator('#detail')).to_contain_text('No funding metadata')
                page.locator('#saved-mode').click()
                page.set_viewport_size({'width':390,'height':844})
                assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
                page.screenshot(path=str(screenshots/'mobile.png'),full_page=True)
                assert not errors,errors
                browser.close()
            print('Browser checks passed: saved collection, filtering, receipt/CSV, live query, safe text and mobile layout')
        finally: server.shutdown()
if __name__=='__main__': main()

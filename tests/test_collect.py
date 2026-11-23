import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from collect import normalize, collect, TOPICS


def item(i):
    return {'DOI': f'10.1234/test{i}', 'title': [f'Canadian research {i}'], 'abstract': 'Not mirrored', 'is-referenced-by-count': i}

class CollectionTests(unittest.TestCase):
    def test_omits_abstract_and_normalizes_identifiers(self):
        value = normalize({**item(0), 'DOI': '10.1234/TEST', 'title':['<i>Title</i> &amp; metadata']})
        self.assertNotIn('abstract', value)
        self.assertEqual(value['DOI'], '10.1234/test')
        self.assertEqual(value['title'], ['Title & metadata'])
    def test_deduplicates_topics_and_keeps_actual_captures(self):
        old={'captures':[{'id':'old','records':[]}]}
        result=collect(lambda url:{'items':[item(i) for i in range(5)],'total-results':500},existing=old)
        self.assertEqual(len(result['captures']),2)
        current=result['captures'][0]
        self.assertEqual(len(current['records']),5)
        self.assertEqual(len(current['records'][0]['topics']),len(TOPICS))
        self.assertEqual(current['sources'][0]['totalResults'],500)
        self.assertEqual(old['captures'][0]['id'],'old')
    def test_partial_failure_does_not_modify_prior_capture(self):
        old={'captures':[{'id':'old','records':[]}]}
        original=json.dumps(old)
        with self.assertRaises(ValueError): collect(lambda url:{'items':[]},existing=old)
        self.assertEqual(json.dumps(old),original)
    def test_committed_snapshot_has_real_provenance_and_no_fake_history(self):
        root=Path(__file__).resolve().parents[1]
        data=json.loads((root/'web/data/ledger.json').read_text())
        self.assertEqual(data['provider'],'Crossref')
        for capture in data['captures']:
            self.assertTrue(capture['capturedAt'].endswith('Z'))
            self.assertGreaterEqual(len(capture['records']),5)
            self.assertTrue(all(s['url'].startswith('https://api.crossref.org/works?') for s in capture['sources']))
            self.assertTrue(all(normalize(r['work']) for r in capture['records']))

if __name__=='__main__': unittest.main()

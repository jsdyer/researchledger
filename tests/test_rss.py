import json,sys,tempfile,unittest,xml.etree.ElementTree as ET
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from collect import matches_institution
from rss import generate
class InstitutionTests(unittest.TestCase):
 def test_context_and_missing_affiliation(self):
  i={'aliases':['saint mary'],'context':['halifax','canada']}
  self.assertTrue(matches_institution({'author':[{'affiliation':[{'name':"Saint Mary's University, Halifax"}]}]},i))
  self.assertFalse(matches_institution({'author':[{'affiliation':[{'name':"Saint Mary's University, Texas"}]}]},i))
  self.assertFalse(matches_institution({'title':["Saint Mary's research"]},i))
 def test_feed_escapes_titles_and_only_includes_matched_institution(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t);(p/'web/data').mkdir(parents=True);(p/'stage').mkdir();(p/'web/config.json').write_text(json.dumps({'institutions':[{'id':'new','label':'New & local'}]}));(p/'web/data/ledger.json').write_text(json.dumps({'captures':[{'capturedAt':'2026-11-25T00:00:00Z','records':[{'topics':['institution-new'],'work':{'DOI':'10.1234/x','title':['<script> & paper']}},{'topics':[],'work':{'DOI':'10.1234/y','title':['Other']}}]}]}));generate(p,p/'stage');r=ET.parse(p/'stage/feeds/new.xml');self.assertEqual(len(r.findall('.//item')),1);self.assertEqual(r.findtext('.//item/title'),'<script> & paper');self.assertIsNone(r.find('.//item/pubDate'))
if __name__=='__main__':unittest.main()

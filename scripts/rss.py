"""Produce bounded institution RSS feeds from the latest captured metadata."""
import json,xml.etree.ElementTree as ET
from email.utils import format_datetime
from datetime import datetime

def generate(root,stage):
 config=json.loads((root/'web/config.json').read_text());ledger=json.loads((root/'web/data/ledger.json').read_text());capture=ledger['captures'][0]
 for institution in config['institutions']:
  feed=ET.Element('rss',version='2.0');channel=ET.SubElement(feed,'channel')
  for k,v in [('title',institution['label']+' · Research Ledger'),('link','https://coolcode.ca/researchledger/'),('description','Weekly Crossref discovery sample requiring recorded author affiliation. Metadata coverage is incomplete; not every university publication.'),('lastBuildDate',format_datetime(datetime.fromisoformat(capture['capturedAt'].replace('Z','+00:00'))))]:ET.SubElement(channel,k).text=v
  for entry in capture['records']:
   if 'institution-'+institution['id'] not in entry['topics']:continue
   work=entry['work'];item=ET.SubElement(channel,'item');ET.SubElement(item,'title').text=work['title'][0];ET.SubElement(item,'link').text='https://doi.org/'+work['DOI'];ET.SubElement(item,'guid',isPermaLink='true').text='https://doi.org/'+work['DOI'];ET.SubElement(item,'description').text='Crossref metadata captured '+capture['capturedAt']+'. Follow the DOI for publication date, full text and current status.'
  dest=stage/'feeds'/f'{institution["id"]}.xml';dest.parent.mkdir(exist_ok=True);ET.ElementTree(feed).write(dest,encoding='utf-8',xml_declaration=True)

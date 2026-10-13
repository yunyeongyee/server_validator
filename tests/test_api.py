import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image
from app import ai
from app.analysis import item
from app.server import app


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_application_and_optional_ai_status(self):
        with patch.dict(os.environ, {}, clear=True):
            status = self.client.get('/api/health').json()
        self.assertEqual(status['app'], 'server-validator')
        self.assertFalse(status['ai_connected'])
        self.assertIn('FastAPI', status['stack'])

    def test_no_key_and_explicit_openai_still_yields_provisional_results(self):
        with patch.dict(os.environ, {}, clear=True):
            response = self.client.post('/api/analyze', json={'requirement':'SSD : 960GB SATA * 2EA(RAID1)', 'quote':'SSD : 960GB SATA * 2EA', 'engine':'openai'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['quote']['method'], 'rules')
        self.assertEqual(response.json()['comparison']['status'], 'unknown')
        self.assertIn('설정이 없어', response.json()['quote']['warnings'][0])

    def test_blank_document_and_invalid_engine_are_rejected(self):
        self.assertEqual(self.client.post('/api/analyze',json={'requirement':' ','quote':'CPU'}).status_code,422)
        self.assertEqual(self.client.post('/api/analyze',json={'requirement':'CPU','quote':'CPU','engine':'guess'}).status_code,422)

    def test_cross_site_write_is_rejected(self):
        response=self.client.post('/api/analyze',json={'requirement':'CPU','quote':'CPU'},headers={'Origin':'https://other.example'})
        self.assertEqual(response.status_code,403)

    def test_no_key_research_never_invents_sources(self):
        with patch.dict(os.environ, {}, clear=True):
            result=self.client.post('/api/research',json={'question':'R760 카드 슬롯 지원 확인'}).json()
        self.assertEqual(result['status'],'pending')
        self.assertEqual(result['citations'],[])

    def test_pillow_png_contains_real_stencil(self):
        asset=next(a for a in self.client.get('/api/catalog').json()['assets'] if a['category']=='server')
        response=self.client.post('/api/export/png',json={'image_id':asset['id'],'practice':True,'boxes':[]})
        self.assertEqual(response.status_code,200)
        with Image.open(io.BytesIO(response.content)) as image:
            self.assertEqual(image.size,(2000,800))
            self.assertGreater(len(image.resize((100,40)).getcolors(4001)),10)

    def test_export_rejects_missing_image_and_out_of_bounds(self):
        self.assertEqual(self.client.post('/api/export/png',json={'image_id':'unknown','boxes':[]}).status_code,400)
        asset=self.client.get('/api/catalog').json()['assets'][0]
        response=self.client.post('/api/export/png',json={'image_id':asset['id'],'boxes':[{'x':999,'y':0,'w':100,'h':20}]})
        self.assertEqual(response.status_code,400)

    def test_raster_upload_and_invalid_raster(self):
        with tempfile.TemporaryDirectory() as temp, patch('app.server.USER_ASSETS',Path(temp)):
            png=io.BytesIO();Image.new('RGB',(10,10),'blue').save(png,format='PNG')
            response=self.client.post('/api/images?name=test.png&category=disk',content=png.getvalue())
            self.assertEqual(response.status_code,200)
            self.assertTrue((Path(temp)/response.json()['file']).exists())
            bad=self.client.post('/api/images?name=bad.png&category=disk',content=b'not an image')
            self.assertEqual(bad.status_code,400)
            self.assertEqual(len(list(Path(temp).glob('*.png'))),1)


class OptionalAiTests(unittest.TestCase):
    def test_verified_structured_response_and_failure_fallback(self):
        raw='CPU : 8C/16T * 2EA'
        it=item('cpu',raw);it['cores']=8;it['quantity']=2
        message=SimpleNamespace(content=json.dumps({'items':[it],'unparsed':[]}),refusal=None)
        create=SimpleNamespace(create=lambda **kwargs:SimpleNamespace(choices=[SimpleNamespace(message=message)]))
        fake=SimpleNamespace(chat=SimpleNamespace(completions=create))
        with patch.object(ai,'ai_status',return_value={'ai_connected':True}),patch.object(ai,'client',return_value=fake):
            valid=ai.extract_document(raw,'quote')
            self.assertEqual(valid['method'],'openai')
            it['cores']=16
            message.content=json.dumps({'items':[it],'unparsed':[]})
            rejected=ai.extract_document(raw,'quote')
        self.assertEqual(rejected['method'],'rules')
        self.assertEqual(rejected['items'][0]['cores'],8)
        self.assertIn('검증에 실패',rejected['warnings'][0])

    def test_unavailable_service_falls_back_without_exposing_error(self):
        with patch.object(ai,'ai_status',return_value={'ai_connected':True}),patch.object(ai,'client',side_effect=RuntimeError('private diagnostic')):
            result=ai.extract_document('CPU : 8C/16T * 2EA','quote')
        self.assertEqual(result['method'],'rules')
        self.assertNotIn('private diagnostic',json.dumps(result))


if __name__=='__main__':unittest.main()

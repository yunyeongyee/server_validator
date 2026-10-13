"""Run real workflows with Windows' CP949 default for unqualified text reads."""
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from app.analysis import ROOT
from app.server import app
from app.stencils import extract_stencil


def windows_default_reader():
    original = Path.read_text
    def read(path, *args, **kwargs):
        if not args and kwargs.get('encoding') is None:
            kwargs['encoding'] = 'cp949'
        return original(path, *args, **kwargs)
    return read


class WindowsEncodingTests(unittest.TestCase):
    def test_document_analysis_with_cp949_default(self):
        with patch.object(Path, 'read_text', windows_default_reader()):
            response = TestClient(app).post('/api/analyze', json={
                'requirement': 'PowerEdge R760 Server\nCPU : 2.8Ghz이상 16코어이상',
                'quote': 'CPU : 제온 골드 5415+ 2.9G, 8C/16T * 2EA',
                'engine': 'rules',
            })
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['quote']['items'][0]['cores'], 8)
        self.assertEqual(response.json()['compatibility']['status'], 'unknown')

    def test_stencil_import_preserves_korean_manifest_with_cp949_default(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / 'assets'
            target.mkdir()
            old = {'id': 'existing', 'name': '기존 디스크 이미지', 'file': 'existing.png'}
            (target / 'manifest.json').write_text(json.dumps([old], ensure_ascii=False), encoding='utf-8')
            source = Path(temp) / 'Dell.vssx'
            artwork = next((ROOT / 'static/assets/dell').glob('*.png'))
            with zipfile.ZipFile(source, 'w') as archive:
                archive.write(artwork, 'visio/media/image1.png')
            with patch.object(Path, 'read_text', windows_default_reader()):
                result = extract_stencil(source, target)
            saved = json.loads((target / 'manifest.json').read_text(encoding='utf-8'))
        self.assertEqual(result['imported'], 1)
        self.assertIn(old, saved)
        self.assertEqual(len(saved), 2)


if __name__ == '__main__': unittest.main()

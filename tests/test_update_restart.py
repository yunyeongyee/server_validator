"""Exercise an actual launcher process through update and same-port restart."""
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
import zipfile
from pathlib import Path
from unittest.mock import patch

from app.releases import file_digest
import updater

ROOT = Path(__file__).resolve().parents[1]


class RestartTests(unittest.TestCase):
    def test_update_stops_server_and_restarts_latest_web_on_same_port(self):
        with tempfile.TemporaryDirectory(prefix='sv-update-check-') as temp:
            root = Path(temp)/'program'
            root.mkdir()
            for name in ('app', 'static', 'data', 'web'):
                shutil.copytree(ROOT/name, root/name, ignore=shutil.ignore_patterns('__pycache__'))
            code = (ROOT/'launcher.py').read_bytes()
            (root/'launcher.py').write_bytes(code)
            (root/'release-info.json').write_text(json.dumps({
                'release_id': 'previous-release',
                'files': {'launcher.py': file_digest('launcher.py', code)},
            }), encoding='utf-8')
            new_code = code + b'\r\n# Updated release fixture.\r\n'
            descriptor = {'release_id': 'updated-release', 'files': {'launcher.py': file_digest('launcher.py', new_code)}}
            archive_data = io.BytesIO()
            with zipfile.ZipFile(archive_data, 'w') as archive:
                archive.writestr('ServerValidator-Mockup/launcher.py', new_code)
                archive.writestr('ServerValidator-Mockup/release-info.json', json.dumps(descriptor))
            payload = archive_data.getvalue()
            metadata = {'sha256': hashlib.sha256(payload).hexdigest(), 'release_id': descriptor['release_id']}
            store = Path(temp)/'user-data'
            env = {**os.environ, 'SERVER_VALIDATOR_DATA_DIR': str(store)}
            processes = []

            def launch(port):
                log = open(Path(temp)/f'launch-{len(processes)}.log', 'w')
                process = subprocess.Popen([sys.executable, 'launcher.py', '--no-browser', '--port', str(port)],
                                           cwd=root, env=env, stdout=log, stderr=log)
                processes.append((process, log))
                for _ in range(200):
                    if process.poll() is not None:
                        log.flush()
                        self.fail(Path(log.name).read_text(encoding='utf-8', errors='replace'))
                    marker = store/'runtime.json'
                    if marker.exists():
                        try:
                            info = json.loads(marker.read_text(encoding='utf-8'))
                            address = f"http://127.0.0.1:{info['port']}"
                            with urllib.request.urlopen(address+'/api/health', timeout=.2) as response:
                                return process, address, json.load(response), info['port']
                        except (OSError, ValueError): pass
                    time.sleep(.05)
                self.fail('Startup timed out')

            try:
                process, address, health, port = launch(0)
                self.assertEqual(health['release_id'], 'previous-release')
                (store/'assets/user.txt').write_text('사용자 이미지 보존', encoding='utf-8')
                with patch.dict(os.environ, {'SERVER_VALIDATOR_DATA_DIR': str(store)}):
                    updater.install_zip(root, payload, metadata)
                self.assertEqual(process.wait(timeout=10), 0)
                self.assertEqual((store/'assets/user.txt').read_text(encoding='utf-8'), '사용자 이미지 보존')
                process, address, health, port = launch(port)
                self.assertEqual(health['release_id'], 'updated-release')
                with urllib.request.urlopen(address, timeout=3) as response:
                    self.assertEqual(response.status, 200)
                body = json.dumps({'requirement': 'PowerEdge R760 CPU 2.8GHz 이상 16코어 이상',
                                   'quote': 'CPU: Xeon Gold 5415+ 2.9G 8C/16T * 2EA', 'engine': 'rules'}).encode('utf-8')
                request = urllib.request.Request(address+'/api/analyze', data=body, headers={'Content-Type': 'application/json'})
                with urllib.request.urlopen(request, timeout=3) as response:
                    self.assertEqual(response.status, 200)
                with patch.dict(os.environ, {'SERVER_VALIDATOR_DATA_DIR': str(store)}): updater.stop_server(root)
                self.assertEqual(process.wait(timeout=10), 0)
            finally:
                for process, log in processes:
                    if process.poll() is None:
                        process.terminate()
                        process.wait(timeout=10)
                    log.close()

import hashlib
import io
import json
import tempfile
import shutil
import subprocess
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.releases import file_digest
from app.server import app
import updater


def release(data=None):
    files = data or {'app/example.py': b'print("new version")\n', 'run.bat': b'@echo off\r\n'}
    hashes = {n: file_digest(n, b) for n, b in files.items()}
    descriptor = {'release_id': 'test-release', 'files': hashes}
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w') as archive:
        for n, b in files.items(): archive.writestr('ServerValidator-Mockup/'+n, b)
        archive.writestr('ServerValidator-Mockup/release-info.json', json.dumps(descriptor))
    data = output.getvalue()
    return data, {'schema_version':1, 'release_id':'test-release', 'sha256':hashlib.sha256(data).hexdigest(), 'size':len(data), 'url':'https://github.com/yunyeongyee/server_validator/raw/commit/dist/ServerValidator-Mockup.zip'}


class UpdateTests(unittest.TestCase):
    def test_source_archive_line_endings_do_not_count_as_local_edits(self):
        for name in ('LICENSE', 'app/analysis.py', 'README.md', '.gitattributes'):
            self.assertEqual(file_digest(name, b'first\nsecond\n'), file_digest(name, b'first\r\nsecond\r\n'))

    @unittest.skipUnless(shutil.which('git'), 'Git is unavailable')
    def test_git_updates_only_clean_main_and_refuses_divergence(self):
        with tempfile.TemporaryDirectory() as temp:
            remote = Path(temp)/'remote'
            root = Path(temp)/'checkout'
            def git(folder, *args):
                return subprocess.run(['git', '-C', str(folder), *args], check=True, capture_output=True)
            remote.mkdir()
            git(remote, 'init', '-b', 'main')
            git(remote, 'config', 'user.name', 'Update Test')
            git(remote, 'config', 'user.email', 'test@example.invalid')
            (remote/'program.txt').write_bytes(b'old')
            git(remote, 'add', '.'); git(remote, 'commit', '-m', 'initial')
            subprocess.run(['git', 'clone', str(remote), str(root)], check=True, capture_output=True)
            git(root, 'config', 'user.name', 'Update Test')
            git(root, 'config', 'user.email', 'test@example.invalid')
            (remote/'program.txt').write_bytes(b'new')
            git(remote, 'commit', '-am', 'update')
            with patch.object(updater, 'stop_server') as stop:
                git(root, 'switch', '-c', 'feature')
                self.assertIn('Development branch', updater.git_update(root))
                stop.assert_not_called()
                git(root, 'switch', 'main')
                (root/'private.txt').write_bytes(b'local data')
                self.assertIn('Local changes', updater.git_update(root))
                stop.assert_not_called()
                (root/'private.txt').unlink()
                self.assertIn('--ff-only', updater.git_update(root))
                self.assertEqual((root/'program.txt').read_bytes(), b'new')
                (root/'local-code.txt').write_bytes(b'local work')
                git(root, 'add', '.'); git(root, 'commit', '-m', 'local work')
                original_head = git(root, 'rev-parse', 'HEAD').stdout
                (remote/'program.txt').write_bytes(b'newer')
                git(remote, 'commit', '-am', 'remote work')
                with self.assertRaises(ValueError): updater.git_update(root)
                self.assertEqual(git(root, 'rev-parse', 'HEAD').stdout, original_head)
                self.assertEqual((root/'local-code.txt').read_bytes(), b'local work')

    def test_zip_update_preserves_user_data_and_creates_backup(self):
        data, metadata = release()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root/'app').mkdir();(root/'app/example.py').write_bytes(b'old code')
            (root/'.venv').mkdir();(root/'.venv/user.txt').write_bytes(b'keep venv')
            (root/'.local').mkdir();(root/'.local/user-image.png').write_bytes(b'keep image')
            (root/'.env').write_bytes(b'private settings')
            (root/'server.calibration.json').write_bytes(b'private calibration')
            with patch.object(updater, 'stop_server'):
                self.assertEqual(updater.install_zip(root, data, metadata), 'test-release')
            self.assertEqual((root/'app/example.py').read_bytes(), b'print("new version")\n')
            self.assertEqual((root/'.env').read_bytes(), b'private settings')
            self.assertEqual((root/'.local/user-image.png').read_bytes(), b'keep image')
            self.assertEqual((root/'.venv/user.txt').read_bytes(), b'keep venv')
            self.assertEqual((root/'server.calibration.json').read_bytes(), b'private calibration')
            backups = list((root/'.local/update-backups').glob('*/app/example.py'))
            self.assertEqual(backups[0].read_bytes(), b'old code')

    def test_checksum_failure_and_local_edits_do_not_replace_files(self):
        data, metadata = release()
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'app').mkdir();target=root/'app/example.py';target.write_bytes(b'user code')
            with self.assertRaises(ValueError):updater.install_zip(root, data+b'bad', metadata)
            (root/'release-info.json').write_text(json.dumps({'files':{'app/example.py':file_digest('app/example.py',b'original')}}),encoding='utf-8')
            with self.assertRaises(ValueError):updater.install_zip(root, data, metadata)
            self.assertEqual(target.read_bytes(), b'user code')

    def test_archive_cannot_replace_private_files(self):
        data, metadata = release({'.env':b'bad replacement'})
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(ValueError):updater.install_zip(Path(temp), data, metadata)

    def test_current_release_does_not_download_archive(self):
        data, metadata = release()
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'release-info.json').write_text(json.dumps({'release_id':'test-release'}),encoding='utf-8')
            def fetch(url, limit=None):
                self.assertIn('update.json',url)
                return json.dumps(metadata).encode()
            self.assertIn('latest',updater.update(root,fetch))

    def test_failed_install_rolls_back_written_files(self):
        data, metadata=release()
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'app').mkdir();target=root/'app/example.py';target.write_bytes(b'old code')
            original=updater.os.replace
            def fail(src,dest):
                if Path(dest).name=='run.bat':raise PermissionError('locked file')
                return original(src,dest)
            with patch.object(updater,'stop_server'),patch.object(updater.os,'replace',fail):
                with self.assertRaises(PermissionError):updater.install_zip(root,data,metadata)
            self.assertEqual(target.read_bytes(),b'old code')
            self.assertFalse((root/'release-info.json').exists())

    def test_shutdown_requires_loopback_and_control_token(self):
        called=[]
        with patch.object(app.state,'control_token','test-control',create=True),patch.object(app.state,'shutdown_callback',lambda:called.append(True),create=True):
            client=TestClient(app,client=('127.0.0.1',50001))
            self.assertEqual(client.post('/api/shutdown',json={}).status_code,403)
            self.assertEqual(client.post('/api/shutdown',json={},headers={'X-SV-Control':'test-control'}).status_code,200)
            remote=TestClient(app,client=('192.0.2.1',50001))
            self.assertEqual(remote.post('/api/shutdown',json={},headers={'X-SV-Control':'test-control'}).status_code,403)
        self.assertEqual(called,[True])


if __name__=='__main__':unittest.main()

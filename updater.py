"""Safe startup updates for Git checkouts and GitHub-downloaded ZIP folders."""
import hashlib
import io
import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath
from app.releases import release_info, modified_files, file_digest
from app.runtime import runtime_path

ROOT = Path(__file__).resolve().parent
INDEX_URL = 'https://github.com/yunyeongyee/server_validator/raw/refs/heads/main/dist/update.json'
MAX_DOWNLOAD = 128 * 1024 * 1024
PROTECTED = {'.git', '.env', '.venv', '.venv-build', '.local', 'node_modules'}
FOLDERS = {'app', 'frontend', 'static', 'data', 'docs', 'tests', 'scripts', 'web'}
ROOT_FILES = {'README.md', 'LICENSE', 'AGENTS.md', '.gitignore', '.gitattributes', 'launcher.py', 'run.bat', 'start.cmd', 'updater.py', 'release-info.json', 'requirements.txt', 'requirements-ai.txt', 'requirements-dev.txt'}


def get_url(url, limit=MAX_DOWNLOAD):
    request = urllib.request.Request(url, headers={'User-Agent': 'ServerValidator-Updater', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=30) as response:
        data = response.read(limit + 1)
    if len(data) > limit: raise ValueError('Download exceeds the permitted size.')
    return data


def stop_server(root):
    marker = runtime_path(root)
    if not marker.exists(): return
    info = json.loads(marker.read_text(encoding='utf-8'))
    if Path(info.get('project_root', '')).resolve() != Path(root).resolve(): return
    port = info.get('port')
    if not isinstance(port, int) or not 1 <= port <= 65535: raise ValueError('Invalid local server port.')
    request = urllib.request.Request(f'http://127.0.0.1:{port}/api/shutdown', data=b'{}', headers={'Content-Type':'application/json', 'X-SV-Control': info.get('control_token', '')})
    try:
        with urllib.request.urlopen(request, timeout=3): pass
    except urllib.error.HTTPError:
        raise ValueError('Close the existing Server Validator window and run again.') from None
    except urllib.error.URLError:
        return  # stale record; no running server
    for _ in range(50):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health', timeout=.3): pass
        except OSError: return
        time.sleep(.1)
    raise ValueError('Server did not stop. Close its window and run again.')


def install_zip(root, data, metadata):
    if hashlib.sha256(data).hexdigest() != metadata['sha256']: raise ValueError('ZIP checksum verification failed; no files were changed.')
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        records = archive.infolist()
        if len(records) > 10000 or sum(r.file_size for r in records) > 512*1024*1024: raise ValueError('Archive limits exceeded.')
        payload = {}
        for record in records:
            if record.is_dir(): continue
            p = PurePosixPath(record.filename)
            parts = p.parts
            if p.is_absolute() or len(parts) < 2 or parts[0] != 'ServerValidator-Mockup' or any(v in {'.', '..'} or ':' in v or '\\' in v for v in parts): raise ValueError('Invalid archive path.')
            relative = PurePosixPath(*parts[1:])
            if any(v.casefold() in PROTECTED for v in relative.parts) or str(relative).endswith(('.calibration.json', '.image-mappings.json')): raise ValueError('Protected user file found in archive.')
            if relative.parts[0] not in FOLDERS and str(relative) not in ROOT_FILES: raise ValueError('Unexpected program file.')
            destination = (Path(root) / str(relative)).resolve()
            if not destination.is_relative_to(Path(root).resolve()): raise ValueError('Archive path escapes the project.')
            payload[str(relative)] = archive.read(record)
        descriptor = json.loads(payload['release-info.json'].decode('utf-8'))
        if descriptor['release_id'] != metadata['release_id']: raise ValueError('Release identity mismatch.')
        for name, digest in descriptor['files'].items():
            if name not in payload or file_digest(name, payload[name]) != digest: raise ValueError('Release file verification failed.')
    changed = modified_files(root, release_info(root))
    if changed: raise ValueError('Local program edits detected; update skipped to preserve your changes.')
    stop_server(root)
    backups = Path(root) / '.local/update-backups' / (str(time.time_ns()) + '-' + descriptor['release_id'][:8])
    backups.mkdir(parents=True, exist_ok=True)
    applied = []
    try:
        for name, contents in payload.items():
            target = Path(root) / name
            if target.exists() and target.read_bytes() == contents: continue
            original = target.exists()
            if original:
                backup = backups / name
                backup.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, backup)
            target.parent.mkdir(parents=True, exist_ok=True)
            staged = None
            try:
                with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as handle:
                    handle.write(contents)
                    staged = Path(handle.name)
                os.replace(staged, target)
                applied.append((name, original))
            finally:
                if staged: staged.unlink(missing_ok=True)
    except Exception:
        for name, original in reversed(applied):
            target = Path(root) / name
            if original: shutil.copy2(backups / name, target)
            else: target.unlink(missing_ok=True)
        raise
    return descriptor['release_id']


def git_update(root):
    git = shutil.which('git')
    if not git: raise ValueError('Git is not installed; keeping the current version.')
    def run(*args):
        return subprocess.run([git, '-C', str(root), *args], capture_output=True, text=True, encoding='utf-8', timeout=60, env={**os.environ, 'GIT_TERMINAL_PROMPT':'0'})
    branch = run('branch', '--show-current')
    if branch.returncode or branch.stdout.strip() != 'main': return 'Development branch: automatic pull skipped.'
    dirty = run('status', '--porcelain')
    if dirty.returncode or dirty.stdout.strip(): return 'Local changes: automatic pull skipped.'
    stop_server(root)
    result = run('pull', '--ff-only', 'origin', 'main')
    if result.returncode: raise ValueError('Git pull failed; no reset or forced merge was performed.')
    return 'Git main updated with --ff-only.'


def update(root=ROOT, fetch=get_url):
    root = Path(root)
    if (root / '.git').exists(): return git_update(root)
    metadata = json.loads(fetch(INDEX_URL + '?t=' + str(time.time_ns()), 64*1024).decode('utf-8'))
    if metadata.get('schema_version') != 1 or not isinstance(metadata.get('sha256'), str) or len(metadata['sha256']) != 64: raise ValueError('Invalid update index.')
    expected_prefix = 'https://github.com/yunyeongyee/server_validator/raw/'
    if not metadata.get('url', '').startswith(expected_prefix) or not metadata['url'].endswith('/dist/ServerValidator-Mockup.zip'): raise ValueError('Unexpected update source.')
    if release_info(root).get('release_id') == metadata.get('release_id'): return 'Already using the latest release.'
    data = fetch(metadata['url'])
    if len(data) != metadata.get('size'): raise ValueError('Incomplete release download.')
    version = install_zip(root, data, metadata)
    return 'Updated to release ' + version[:12] + '. User images, settings and keys were preserved.'


def main():
    try: print('[Update] ' + update())
    except Exception as error:
        if isinstance(error, ValueError): print('[Update] ' + str(error))
        else: print('[Update] Network or file access unavailable; keeping the current version.')


if __name__ == '__main__': main()

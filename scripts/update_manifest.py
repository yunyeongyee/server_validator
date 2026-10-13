"""Create the update index referencing an immutable, committed release ZIP."""
import hashlib
import io
import json
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
commit = subprocess.check_output(['git', 'rev-parse', '--verify', sys.argv[1]+'^{commit}'], cwd=ROOT, text=True).strip()
payload = subprocess.check_output(['git', 'show', commit+':dist/ServerValidator-Mockup.zip'], cwd=ROOT)
with zipfile.ZipFile(io.BytesIO(payload)) as archive:
    descriptor = json.loads(archive.read('ServerValidator-Mockup/release-info.json').decode('utf-8'))
metadata = {'schema_version': 1, 'release_id': descriptor['release_id'], 'sha256': hashlib.sha256(payload).hexdigest(), 'size': len(payload), 'url': f'https://github.com/yunyeongyee/server_validator/raw/{commit}/dist/ServerValidator-Mockup.zip'}
(ROOT/'dist/update.json').write_text(json.dumps(metadata, indent=2)+'\n', encoding='utf-8', newline='\r\n')
print('Update index prepared for', commit[:12])

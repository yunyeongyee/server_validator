"""Release identity and source-change checks, independent of third-party packages."""
import hashlib
import json
from pathlib import Path

TEXT_SUFFIXES = {'.py', '.ts', '.tsx', '.js', '.css', '.html', '.json', '.md', '.txt', '.bat', '.cmd'}


def file_digest(name, data):
    if Path(name).suffix.lower() in TEXT_SUFFIXES or Path(name).name in {'.gitignore', '.gitattributes', 'LICENSE'}:
        data = data.replace(b'\r\n', b'\n')
    return hashlib.sha256(data).hexdigest()


def release_info(root):
    path = Path(root) / 'release-info.json'
    if not path.exists(): return {}
    return json.loads(path.read_text(encoding='utf-8'))


def modified_files(root, info):
    changed = []
    for name, expected in info.get('files', {}).items():
        path = Path(root) / name
        if not path.is_file() or file_digest(name, path.read_bytes()) != expected:
            changed.append(name)
    return changed

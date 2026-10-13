"""Private local control for restarting this project's own server."""
import json
import os
from pathlib import Path


def data_directory(root):
    if os.environ.get('SERVER_VALIDATOR_DATA_DIR'): return Path(os.environ['SERVER_VALIDATOR_DATA_DIR'])
    if os.name == 'nt': return Path(os.environ.get('LOCALAPPDATA', str(Path.home() / 'AppData/Local'))) / 'ServerValidator'
    return Path(root) / '.local'


def runtime_path(root): return data_directory(root) / 'runtime.json'


def write_runtime(root, port, token):
    path = runtime_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({'pid': os.getpid(), 'port': port, 'project_root': str(Path(root).resolve()), 'control_token': token}), encoding='utf-8')
    if os.name != 'nt': path.chmod(0o600)


def clear_runtime(root):
    path = runtime_path(root)
    try:
        record = json.loads(path.read_text(encoding='utf-8'))
        if record.get('pid') == os.getpid(): path.unlink(missing_ok=True)
    except (OSError, ValueError): pass

"""Create a source-run ZIP with only reviewed application/distribution files."""
from pathlib import Path
import zipfile

ROOT=Path(__file__).resolve().parents[1]
output=ROOT/'dist/ServerValidator-Mockup.zip'
output.parent.mkdir(exist_ok=True)
roots=['app','static','data','docs','tests','scripts','frontend','web']
files=[ROOT/name for name in ['README.md','LICENSE','AGENTS.md','.gitignore','.gitattributes','launcher.py','run.bat','start.cmd','requirements.txt','requirements-ai.txt','requirements-dev.txt']]
for name in roots:
    files.extend(p for p in (ROOT/name).rglob('*') if p.is_file() and not any(part in {'__pycache__','node_modules','.cache'} for part in p.parts) and p.suffix not in {'.pyc','.pyo'})
if not (ROOT/'web/index.html').is_file(): raise RuntimeError('Build the React UI before packaging: cd frontend && npm ci && npm run build')
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
    for file in sorted(set(files)):
        archive.write(file,'ServerValidator-Mockup/'+file.relative_to(ROOT).as_posix())
    bad=archive.testzip()
    if bad: raise RuntimeError('ZIP integrity check failed: '+bad)
print(f'{output.name}: {len(files)} files, {output.stat().st_size:,} bytes')

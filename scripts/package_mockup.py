"""Create a source-run ZIP with only reviewed application/distribution files."""
from pathlib import Path
import zipfile

ROOT=Path(__file__).resolve().parents[1]
output=ROOT/'dist/ServerValidator-Mockup.zip'
output.parent.mkdir(exist_ok=True)
roots=['app','static','data','docs','tests','scripts']
files=[ROOT/name for name in ['README.md','LICENSE','.gitignore','.gitattributes','launcher.py','start.cmd']]
for name in roots:
    files.extend(p for p in (ROOT/name).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix not in {'.pyc','.pyo'})
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
    for file in sorted(set(files)):
        archive.write(file,'ServerValidator-Mockup/'+file.relative_to(ROOT).as_posix())
    bad=archive.testzip()
    if bad: raise RuntimeError('ZIP integrity check failed: '+bad)
print(f'{output.name}: {len(files)} files, {output.stat().st_size:,} bytes')

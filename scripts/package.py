from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'extension' / 'manifest.json').read_text())['version']
dist = root / 'dist'
dist.mkdir(exist_ok=True)
for name, files in [
    (f'ig-likes-viewer-extension-{version}.zip', list((root / 'extension').glob('*')) + [root / 'INSTALL.ja.md', root / 'PRIVACY.ja.md', root / 'LICENSE']),
    (f'ig-likes-viewer-project-{version}.zip', [p for p in root.rglob('*') if p.is_file() and not any(x in p.relative_to(root).parts for x in ['node_modules', 'dist', '.git', '.DS_Store', '__pycache__']) and p.suffix != '.pyc'])
]:
    target = dist / name
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(files):
            archive.write(file, file.relative_to(root))
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    print(f'{target.name}  {target.stat().st_size} bytes  SHA256 {digest}')
    (dist / (name + '.sha256')).write_text(f'{digest}  {name}\n')

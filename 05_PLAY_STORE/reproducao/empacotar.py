"""Gera uma prévia de revisão e ZIP com as imagens finais."""
import json
import zipfile
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
files = sorted((ROOT / 'prontos-upload').glob('*.png'))
assert len(files) == 6
canvas = Image.new('RGB', (1200, 930), '#F3F7F3')
icon = Image.open(files[0]).convert('RGB').resize((230, 230), Image.Resampling.LANCZOS)
banner = Image.open(files[1]).convert('RGB').resize((860, 420), Image.Resampling.LANCZOS)
canvas.paste(icon, (35, 95))
canvas.paste(banner, (305, 0))
for i, path in enumerate(files[2:]):
    shot = Image.open(path).convert('RGB').resize((270, 480), Image.Resampling.LANCZOS)
    canvas.paste(shot, (30 + i * 290, 435))
canvas.save(ROOT / 'previa.png', optimize=True)
with zipfile.ZipFile(ROOT / 'simvio-play-store.zip', 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for path in files + [ROOT / 'LEIA-ME.md', ROOT / 'revisao/validacao-tecnica.json']:
        archive.write(path, path.relative_to(ROOT).as_posix())
    for folder in ['originais-gerados', 'capturas-reais', 'referencias', 'reproducao']:
        for path in sorted((ROOT / folder).glob('*')):
            if path.is_file():
                archive.write(path, path.relative_to(ROOT).as_posix())
print('ZIP e prévia criados; seis PNGs finais incluídos.')

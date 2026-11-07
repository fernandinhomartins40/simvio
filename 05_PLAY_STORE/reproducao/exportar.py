"""Exporta artes geradas e aplica apenas capturas reais, sem redesenhar a interface."""
import json
from pathlib import Path
from PIL import Image, ImageOps, ImageCms

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'originais-gerados'
FILES = {name: name + '.png' for name in (
    '01-icone', '02-banner', '03-fundo-conectar',
    '04-fundo-inicio', '05-fundo-atividade', '06-fundo-ajustes',
)}
PROFILE = ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()


def save(im, target):
    im.save(target, optimize=True, icc_profile=PROFILE)


icon = Image.open(SOURCE / FILES['01-icone']).convert('RGBA')
save(icon.resize((512, 512), Image.Resampling.LANCZOS), ROOT / 'prontos-upload/01-icone-512x512.png')
banner = Image.open(SOURCE / FILES['02-banner']).convert('RGB')
save(ImageOps.fit(banner, (1024, 500), Image.Resampling.LANCZOS), ROOT / 'prontos-upload/02-banner-1024x500.png')

screens = [
    ('01-conectar', '03-fundo-conectar', '03-conectar'),
    ('02-inicio', '04-fundo-inicio', '04-inicio'),
    ('03-atividade', '05-fundo-atividade', '05-atividade'),
    ('04-ajustes', '06-fundo-ajustes', '06-ajustes'),
]
for capture, artwork, final in screens:
    path = ROOT / 'capturas-reais' / (capture + '.png')
    if not path.exists():
        continue
    backdrop = ImageOps.fit(Image.open(SOURCE / FILES[artwork]).convert('RGB'), (1080, 1920), Image.Resampling.LANCZOS, centering=(0.5, 0.0))
    # Captura inteira, sem corte, máscara, retoque de texto ou modificação da logo.
    screen = Image.open(path).convert('RGB')
    assert screen.size == (1080, 1920), (path, screen.size)
    screen = screen.resize((730, 1298), Image.Resampling.LANCZOS)
    backdrop.paste(screen, (175, 340))
    save(backdrop, ROOT / 'prontos-upload' / (final + '-1080x1920.png'))

report = []
for path in sorted((ROOT / 'prontos-upload').glob('*.png')):
    with Image.open(path) as im:
        item = {'arquivo': path.name, 'dimensoes': list(im.size), 'modo': im.mode, 'bytes': path.stat().st_size, 'sRGB': bool(im.info.get('icc_profile'))}
        assert im.mode == ('RGBA' if 'icone' in path.name else 'RGB')
        assert item['sRGB']
        if 'icone' in path.name:
            assert path.stat().st_size <= 1024 * 1024
        report.append(item)
(ROOT / 'revisao/validacao-tecnica.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))

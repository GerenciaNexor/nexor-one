"""Optimiza los símbolos de NEXOR para uso en la app.

Los originales (nexor-light.png / nexor-dark.png) ya son el símbolo con fondo
transparente, pero pesan ~5MB (2240px). Aquí los recortamos al borde real del
símbolo (bounding box del canal alfa) y los reescalamos a un alto manejable,
guardando copias optimizadas. Los originales NO se modifican.
"""
from PIL import Image

JOBS = [
    ("apps/web/public/logos/nexor-light.png", "apps/web/public/logos/icon-light.png"),
    ("apps/web/public/logos/nexor-dark.png",  "apps/web/public/logos/icon-dark.png"),
]

TARGET_H = 128  # alto suficiente para retina en un ícono de ~32px

for src, dst in JOBS:
    im = Image.open(src).convert("RGBA")
    bbox = im.getbbox()              # recorta el espacio transparente alrededor
    im = im.crop(bbox)
    ratio = TARGET_H / im.height
    im = im.resize((max(1, round(im.width * ratio)), TARGET_H), Image.LANCZOS)
    im.save(dst, optimize=True)
    print(f"{dst}  ->  {im.size[0]}x{im.size[1]}")

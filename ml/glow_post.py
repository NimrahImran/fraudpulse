"""Add a soft bloom to the Blender renders (bright parts bleed light)."""
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageFilter

d = Path(__file__).resolve().parents[1] / "public" / "img" / "3d"
for name in sys.argv[1:] or ["grid", "slab", "capsules", "icons", "ring"]:
    if not (d / f"{name}.png").exists():
        continue
    im = Image.open(d / f"{name}.png").convert("RGB")
    bright = im.point(lambda v: max(0, v - 120) * 2)
    glow = ImageChops.add(bright.filter(ImageFilter.GaussianBlur(18)), bright.filter(ImageFilter.GaussianBlur(50)))
    out = ImageChops.add(im, glow.point(lambda v: int(v * 0.7)))
    out.save(d / f"{name}.webp", quality=88, method=6)
    print(name, out.size)

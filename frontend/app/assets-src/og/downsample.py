"""Downsample the 2x render to the published 1200x630 card plus previews.

Usage: python3 downsample.py <card@2x.png> <output.png> <preview-dir>
"""
import sys
from pathlib import Path

from PIL import Image

raw, output, preview_dir = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
src = Image.open(raw).convert("RGB")
assert src.size == (2400, 1260), f"expected a 2400x1260 render, got {src.size}"

card = src.resize((1200, 630), Image.LANCZOS)
card.save(output, optimize=True)
for width in (400, 350):
    card.resize((width, round(width * 630 / 1200)), Image.LANCZOS).save(
        preview_dir / f"preview-{width}.png", optimize=True
    )
print(f"wrote {output} {card.size} and previews in {preview_dir}")

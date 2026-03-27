"""
LEGACY: slice-stack compositor. Prefer PDF-first rendering instead:
  npm run infobook:render  (scripts/render_infobook_pdf.py)

Stack extracted PNG slices per PDF page onto a white A4 canvas (contain fit).
Run from repo root: python scripts/composite_infobook_pages.py

Reads:  public/offer-templates/infobook/p{N}_*.png
Writes: public/offer-templates/infobook/full/page-NN.png
         public/offer-templates/infobook/full/pages-meta.json
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "offer-templates" / "infobook"
OUT = SRC / "full"

# A4 @ ~150 DPI (good for screen + PDF embed)
A4_PORTRAIT = (1240, 1754)
A4_LANDSCAPE = (1754, 1240)


def page_numbers() -> list[int]:
    """PDF page indices present in filenames (skip missing page 12)."""
    found = set()
    for p in SRC.glob("p*_*.png"):
        m = re.match(r"p(\d+)_", p.name)
        if m:
            found.add(int(m.group(1)))
    return sorted(found)


def slices_for_page(n: int) -> list[Path]:
    files = list(SRC.glob(f"p{n}_*.png"))
    return sorted(files, key=lambda p: int(p.stem.split("_")[1]))


def stack_vertical(paths: list[Path]) -> Image.Image:
    imgs = [Image.open(p).convert("RGB") for p in paths]
    w = max(im.width for im in imgs)
    h = sum(im.height for im in imgs)
    canvas = Image.new("RGB", (w, h), "white")
    y = 0
    for im in imgs:
        x = (w - im.width) // 2
        canvas.paste(im, (x, y))
        y += im.height
    return canvas


def fit_a4(img: Image.Image) -> tuple[Image.Image, str]:
    """Return image fitted to A4 and format key 'A4' or 'A4-landscape'."""
    ar = img.width / max(1, img.height)
    if ar >= 1.0:
        fw, fh = A4_LANDSCAPE
        fmt = "A4-landscape"
    else:
        fw, fh = A4_PORTRAIT
        fmt = "A4"
    scale = min(fw / img.width, fh / img.height)
    nw, nh = int(img.width * scale), int(img.height * scale)
    resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (fw, fh), "white")
    canvas.paste(resized, ((fw - nw) // 2, (fh - nh) // 2))
    return canvas, fmt


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    meta: list[dict[str, str]] = []
    order = [n for n in page_numbers() if n != 12]
    for i, pn in enumerate(order, start=1):
        paths = slices_for_page(pn)
        if not paths:
            continue
        stacked = stack_vertical(paths)
        fitted, fmt = fit_a4(stacked)
        name = f"page-{i:02d}.png"
        fitted.save(OUT / name, optimize=True, quality=92)
        meta.append(
            {
                "index": i,
                "pdfPage": pn,
                "format": fmt,
                "publicPath": f"/offer-templates/infobook/full/{name}",
            }
        )
        print(f"{name} <- PDF page {pn} ({len(paths)} slices) {fmt}")

    (OUT / "pages-meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"Wrote {len(meta)} pages to {OUT}")


if __name__ == "__main__":
    main()

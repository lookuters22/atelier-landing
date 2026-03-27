#!/usr/bin/env python3
"""
Render each page of the source infobook PDF to full-size PNGs (PyMuPDF).

Reads:  public/offer-templates/infobook/source.pdf
Writes: public/offer-templates/infobook/full/pdf-page-NN.png
        public/offer-templates/infobook/full/pdf-pages-meta.json

Run from repo root: python scripts/render_infobook_pdf.py
Requires: pip install -r requirements-infobook.txt
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    print("Missing PyMuPDF. Install with: pip install -r requirements-infobook.txt", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT / "public" / "offer-templates" / "infobook" / "source.pdf"
OUT_DIR = ROOT / "public" / "offer-templates" / "infobook" / "full"
META_PATH = OUT_DIR / "pdf-pages-meta.json"

# ~2x zoom → sharp rasters on retina; matches prior composite script visual weight
ZOOM = 2.0


def main() -> None:
    if not PDF_PATH.is_file():
        print(f"Expected PDF at:\n  {PDF_PATH}\nPlace source.pdf there and retry.", file=sys.stderr)
        sys.exit(1)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(PDF_PATH)
    pages_out: list[dict] = []
    try:
        for i in range(len(doc)):
            page = doc[i]
            rect = page.rect
            w_pt = float(rect.width)
            h_pt = float(rect.height)
            mat = fitz.Matrix(ZOOM, ZOOM)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            n = i + 1
            fname = f"pdf-page-{n:02d}.png"
            out_png = OUT_DIR / fname
            pix.save(str(out_png))
            fmt = "A4-landscape" if w_pt >= h_pt else "A4"
            pages_out.append(
                {
                    "page": n,
                    "src": f"/offer-templates/infobook/full/{fname}",
                    "widthPt": round(w_pt, 2),
                    "heightPt": round(h_pt, 2),
                    "widthPx": pix.width,
                    "heightPx": pix.height,
                    "format": fmt,
                }
            )
    finally:
        doc.close()

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourcePdf": "public/offer-templates/infobook/source.pdf",
        "zoom": ZOOM,
        "pages": pages_out,
    }
    META_PATH.parent.mkdir(parents=True, exist_ok=True)
    META_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(pages_out)} PNG(s) under {OUT_DIR}")
    print(f"Wrote {META_PATH}")


if __name__ == "__main__":
    main()

"""PaddleOCR HTTP sidecar for InvoiceFlow inbound waybill scanning."""

from __future__ import annotations

import base64
import io
import os
from typing import Any

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

app = FastAPI(title="InvoiceFlow PaddleOCR", version="1.0.0")

_ocr = None
_SECRET = os.environ.get("PADDLE_OCR_SECRET", "").strip()


def get_ocr():
    global _ocr
    if _ocr is None:
        from paddleocr import PaddleOCR

        # Chinese (covers simplified + traditional glyphs for SF labels).
        _ocr = PaddleOCR(use_angle_cls=True, lang="ch", show_log=False)
    return _ocr


def check_secret(authorization: str | None, x_paddle_ocr_secret: str | None) -> None:
    if not _SECRET:
        return
    token = None
    if x_paddle_ocr_secret:
        token = x_paddle_ocr_secret.strip()
    elif authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    if token != _SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")


def polygon_to_aabb(poly: list) -> tuple[float, float, float, float]:
    xs = [float(p[0]) for p in poly]
    ys = [float(p[1]) for p in poly]
    return min(xs), min(ys), max(xs), max(ys)


def run_ocr(image_bytes: bytes) -> list[dict[str, Any]]:
    from PIL import Image
    import numpy as np

    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    arr = np.array(img)
    result = get_ocr().ocr(arr, cls=True)
    boxes: list[dict[str, Any]] = []
    if not result:
        return boxes
    page = result[0] if result else None
    if not page:
        return boxes
    for item in page:
        if not item or len(item) < 2:
            continue
        poly, meta = item[0], item[1]
        text = meta[0] if isinstance(meta, (list, tuple)) else str(meta)
        score = float(meta[1]) if isinstance(meta, (list, tuple)) and len(meta) > 1 else 1.0
        text = (text or "").strip()
        if not text:
            continue
        x0, y0, x1, y1 = polygon_to_aabb(poly)
        boxes.append(
            {
                "text": text,
                "score": score,
                "x0": x0,
                "y0": y0,
                "x1": x1,
                "y1": y1,
            }
        )
    return boxes


class OcrJsonBody(BaseModel):
    image_base64: str = Field(..., description="Raw base64 (no data: URL prefix)")
    mime_type: str | None = None


@app.on_event("startup")
def warmup() -> None:
    try:
        get_ocr()
    except Exception as exc:  # pragma: no cover
        print(f"PaddleOCR warmup failed: {exc}")


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/ocr")
async def ocr_multipart(
    file: UploadFile = File(...),
    authorization: str | None = Header(None),
    x_paddle_ocr_secret: str | None = Header(None, alias="X-Paddle-OCR-Secret"),
) -> dict[str, Any]:
    check_secret(authorization, x_paddle_ocr_secret)
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image")
    try:
        boxes = run_ocr(image_bytes)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"OCR failed: {exc}") from exc
    return {"boxes": boxes}


@app.post("/ocr/json")
async def ocr_json(
    body: OcrJsonBody,
    authorization: str | None = Header(None),
    x_paddle_ocr_secret: str | None = Header(None, alias="X-Paddle-OCR-Secret"),
) -> dict[str, Any]:
    """JSON endpoint used by the Next.js client."""
    check_secret(authorization, x_paddle_ocr_secret)
    raw = body.image_base64
    if "," in raw and raw.strip().startswith("data:"):
        raw = raw.split(",", 1)[1]
    try:
        image_bytes = base64.b64decode(raw)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid base64: {exc}") from exc
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image")
    try:
        boxes = run_ocr(image_bytes)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"OCR failed: {exc}") from exc
    return {"boxes": boxes}

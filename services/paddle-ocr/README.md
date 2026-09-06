# PaddleOCR sidecar (inbound waybills)

CPU PaddleOCR HTTP service used by InvoiceFlow inbound waybill scan and rental utility meter dial OCR.

## Endpoints

| Method | Path | Body | Response |
|--------|------|------|----------|
| `GET` | `/health` | — | `{ "ok": true }` |
| `POST` | `/ocr` | multipart `file` | `{ "boxes": [{ text, score, x0, y0, x1, y1 }] }` |
| `POST` | `/ocr/json` | `{ "image_base64": "...", "mime_type": "image/jpeg" }` | same |

If `PADDLE_OCR_SECRET` is set, send header `X-Paddle-OCR-Secret: <secret>` (or `Authorization: Bearer <secret>`).

## Local run (Docker)

```bash
cd services/paddle-ocr
docker build -t paddle-ocr .
docker run --rm -p 8000:8000 paddle-ocr
curl http://127.0.0.1:8000/health
```

First boot downloads OCR models and can take several minutes; needs ~2GB+ RAM.

## Local run (venv)

```bash
cd services/paddle-ocr
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

## Point the Next.js app at it

In `.env.local`:

```bash
PADDLE_OCR_URL=http://127.0.0.1:8000
# PADDLE_OCR_SECRET=same-as-sidecar-if-set
```

Restart `npm run dev`. Leave `GEMINI_API_KEY` unset to force the Paddle path while testing.

## Railway (second service)

1. In the same Railway project: **+ New** → GitHub repo (same repo).
2. Service **Settings → Root Directory:** `services/paddle-ocr` (uses this folder’s `Dockerfile` + `railway.json`; builder is **DOCKERFILE**, not Railpack/`npm`).
3. Allocate **≥2GB RAM**. Private networking is enough (no public domain required).
4. On the **Next.js** service set:
   ```bash
   PADDLE_OCR_URL=http://<paddle-service-name>.railway.internal:8000
   ```
   Optional: set the same `PADDLE_OCR_SECRET` on both services.
5. Clear any dashboard start command that says `npm start` on the Paddle service. Prefer start command:
   `sh -c 'uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}'`
   (Railway runs commands without a shell unless wrapped in `sh -c`, so bare `${PORT:-8000}` is passed literally and fails.)

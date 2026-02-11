# Tesseract Runtime Bundle

Place OCR runtime files here for packaged builds.

- `bin/`
  - macOS/Linux: `tesseract`
  - Windows: `tesseract.exe`
- `tessdata/`
  - at least `eng.traineddata` and `kor.traineddata`

Forge PDF viewer resolves OCR paths in this order:
1. UI-configured path
2. Environment variables (`OPENCLAW_TESSERACT_BIN`, `TESSDATA_PREFIX`)
3. Bundled resource path (`resources/tesseract/...`)
4. System PATH (`tesseract`)

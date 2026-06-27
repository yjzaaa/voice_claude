# voice_claude

语音 → Claude Code · Electron + TypeScript

Speech-to-text for Claude Code via Electron, with local Vosk ASR.

## Quick Start

```bash
npm install
npm run build
npm start
```

## Vosk ASR Model

voice_claude uses [vosk-browser](https://github.com/ccoreilly/vosk-browser) (WASM) for local offline speech recognition with Chinese language support.

### Model Setup

1. Download the Vosk Chinese small model:
   - [vosk-model-small-cn-0.22.zip](https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip)

2. Extract the zip, then re-package as a `.tar.gz` with the original model folder structure:

   ```bash
   # After extracting vosk-model-small-cn-0.22/
   tar -czf vosk-model-small-cn-0.22.tar.gz vosk-model-small-cn-0.22/
   ```

3. Create a `models/` directory in the project root and place the `.tar.gz` file there:

   ```
   models/
   └── vosk-model-small-cn-0.22.tar.gz
   ```

4. Restart voice_claude. The app will detect the model and start Vosk ASR automatically.

### Manual Download Script (PowerShell)

```powershell
# Download the model
Invoke-WebRequest -Uri "https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip" -OutFile "vosk-model-small-cn-0.22.zip"
# Extract (requires 7-Zip or similar)
7z x vosk-model-small-cn-0.22.zip
# Re-package as tar.gz (requires tar)
tar -czf vosk-model-small-cn-0.22.tar.gz vosk-model-small-cn-0.22/
# Move to models directory
mkdir -Force models
mv vosk-model-small-cn-0.22.tar.gz models/
```

## Architecture

- **Vosk ASR** (primary): Local offline speech recognition via vosk-browser WASM in a hidden BrowserWindow
- **Doubao ASR** (fallback): Volcengine Doubao API for PCM audio transcription via `/asr` HTTP endpoint
- **Chrome Web Speech** (legacy fallback): `speech.html` served via HTTP server on `:9877`

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript |
| `npm start` | Build and launch Electron |

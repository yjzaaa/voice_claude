# ASR Test Fixtures

Place recorded audio samples here for the ASR test harness.

## Recording New Fixtures

1. Open `test/asr/capture.html` in Chrome or any browser with microphone access.
2. Enter a file name (e.g., `hello`).
3. Enter the expected text in the input field (e.g., `你好`).
4. Click **Record (5s)** and speak the text clearly.
5. After recording, click **Save .pcm** and **Save .txt** to download both files.
6. Move the downloaded files to this directory: `test/asr/fixtures/`.

## File Format

Each fixture consists of two files:

- `<name>.pcm` — raw PCM audio: 16kHz, 16-bit signed little-endian, mono
- `<name>.txt` — expected transcription text (UTF-8)

Example:
```
fixtures/
  hello.pcm       # raw 16kHz 16-bit mono PCM audio
  hello.txt       # contains: 你好
  debug.pcm
  debug.txt       # contains: 帮我修复这个bug
  switch.pcm
  switch.txt      # contains: 切换到终端
```

## Running Tests

```bash
npx ts-node test/asr/run.ts
```

The runner scans all `.pcm` files in this directory, looks up matching `.txt` files,
and sends each through both ASR backends:
- **Doubao v3** — via `src/asr/doubao.ts` (streaming ASR API)
- **Chrome Web Speech** — via HTTP POST to `localhost:9877/send`

## Placeholder Files

The initial `.pcm` files in this directory contain synthetic audio (sine wave tones)
and will not produce meaningful recognition results. Replace them with real recordings
using `capture.html` before running tests.

/**
 * ASR Test Runner
 *
 * Scans test/asr/fixtures/ for .pcm files, runs each through:
 *   a) Doubao v3 (via src/asr/doubao.ts)
 *   b) Chrome Web Speech (HTTP POST to localhost:9877)
 *
 * Compares output with expected text from corresponding .txt file.
 * Usage: npx ts-node test/asr/run.ts
 */
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import { transcribe as doubaoTranscribe } from "../../src/asr/doubao";

const FIXTURES_DIR = path.resolve(__dirname, "fixtures");
const CHROME_ASR_URL = "http://localhost:9877/send";

interface TestResult {
  backend: string;
  fixture: string;
  expected: string;
  actual: string | null;
  matchPct: number;
  status: "PASS" | "FAIL";
}

/**
 * Levenshtein edit distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  const matrix: number[] = new Array((an + 1) * (bn + 1));
  for (let i = 0; i <= an; i++) matrix[i * (bn + 1)] = i;
  for (let j = 0; j <= bn; j++) matrix[j] = j;
  for (let i = 1; i <= an; i++) {
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i * (bn + 1) + j] = Math.min(
        matrix[(i - 1) * (bn + 1) + j] + 1,
        matrix[i * (bn + 1) + j - 1] + 1,
        matrix[(i - 1) * (bn + 1) + j - 1] + cost,
      );
    }
  }
  return matrix[an * (bn + 1) + bn];
}

/**
 * Compute character-level match percentage between expected and actual text.
 * 100% = exact match. Uses Levenshtein distance normalized by max length.
 */
function matchPercent(expected: string, actual: string | null): number {
  if (!actual) return 0;
  const e = expected.trim();
  const a = actual.trim();
  if (!e && !a) return 100;
  if (!e || !a) return 0;
  const dist = levenshtein(e, a);
  return Math.max(0, Math.round((1 - dist / Math.max(e.length, a.length)) * 100));
}

/**
 * Run fixture through Doubao v3 ASR backend.
 */
async function testDoubao(audioPath: string): Promise<string | null> {
  const audio = fs.readFileSync(audioPath);
  return await doubaoTranscribe(audio, 16000);
}

/**
 * Run fixture through Chrome Web Speech ASR backend.
 * Sends PCM audio to localhost:9877/send and expects JSON with "text" field.
 */
function testChromeSpeech(audioPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const audio = fs.readFileSync(audioPath);
    const url = new URL(CHROME_ASR_URL);

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 9877,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": audio.length,
        },
        timeout: 30000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString("utf-8");
        });
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve(json.text || null);
          } catch {
            // If response isn't JSON, return raw text
            resolve(data.trim() || null);
          }
        });
        res.on("error", () => resolve(null));
      },
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.write(audio);
    req.end();
  });
}

function formatResult(result: TestResult): string {
  const expected = JSON.stringify(result.expected);
  const actual = JSON.stringify(result.actual);
  return `[${result.status}] ${result.fixture} (${result.backend}) → ${actual} (expected ${expected}) match: ${result.matchPct}%`;
}

async function main() {
  // Discover fixtures
  let files: string[];
  try {
    files = fs.readdirSync(FIXTURES_DIR)
      .filter((f) => f.endsWith(".pcm"))
      .sort();
  } catch {
    console.error(`Fixtures directory not found: ${FIXTURES_DIR}`);
    console.error("Create test recordings or placeholder PCM files in test/asr/fixtures/");
    process.exit(1);
  }

  if (files.length === 0) {
    console.log("No .pcm fixtures found in " + FIXTURES_DIR);
    console.log("Use test/asr/capture.html to record audio samples.");
    process.exit(1);
  }

  console.log("ASR Test Runner");
  console.log("=".repeat(60));
  console.log("Fixtures directory: " + FIXTURES_DIR);
  console.log("Found " + files.length + " fixture(s)\n");

  const allResults: TestResult[] = [];

  for (const file of files) {
    const name = path.basename(file, ".pcm");
    const txtPath = path.join(FIXTURES_DIR, name + ".txt");

    if (!fs.existsSync(txtPath)) {
      console.log(`[SKIP] ${file} → missing ${name}.txt (expected text file)`);
      console.log("");
      continue;
    }

    const expected = fs.readFileSync(txtPath, "utf-8").trim();
    const audioPath = path.join(FIXTURES_DIR, file);

    if (!expected) {
      console.log(`[SKIP] ${file} → ${name}.txt is empty`);
      console.log("");
      continue;
    }

    console.log(`--- ${file} ---`);

    // ---- Doubao v3 ----
    console.log("  Doubao v3: transcribing...");
    const doubaoStart = Date.now();
    const doubaoResult = await testDoubao(audioPath);
    const doubaoTime = Date.now() - doubaoStart;
    const doubaoMatch = matchPercent(expected, doubaoResult);
    const doubaoResult_: TestResult = {
      backend: "doubao",
      fixture: file,
      expected,
      actual: doubaoResult,
      matchPct: doubaoMatch,
      status: doubaoMatch >= 50 ? "PASS" : "FAIL",
    };
    allResults.push(doubaoResult_);
    console.log("  " + formatResult(doubaoResult_) + ` (${doubaoTime}ms)`);

    // ---- Chrome Web Speech ----
    console.log("  Chrome Web Speech: transcribing...");
    const chromeStart = Date.now();
    const chromeResult = await testChromeSpeech(audioPath);
    const chromeTime = Date.now() - chromeStart;
    const chromeMatch = matchPercent(expected, chromeResult);
    const chromeResult_: TestResult = {
      backend: "chrome",
      fixture: file,
      expected,
      actual: chromeResult,
      matchPct: chromeMatch,
      status: chromeMatch >= 50 ? "PASS" : "FAIL",
    };
    allResults.push(chromeResult_);
    console.log("  " + formatResult(chromeResult_) + ` (${chromeTime}ms)`);

    console.log("");
  }

  // Summary
  const total = allResults.length;
  const passed = allResults.filter((r) => r.status === "PASS").length;
  const failed = total - passed;

  console.log("=".repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed out of ${total} tests`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

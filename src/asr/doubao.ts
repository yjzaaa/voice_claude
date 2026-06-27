// @ts-nocheck
/**
 * 豆包 ASR v3 — 大模型流式语音识别
 * 端点: /api/v3/sauc/bigmodel（双向流式）
 *
 * 修复:
 * - WsReader 持久化缓冲，解决多帧在单 TCP 段到达时丢失的问题
 * - parseResp 多格式探测（v3 标准 / v2 风格 / 裸 JSON）
 * - 音频包大小 6400B (200ms @ 16kHz 16bit mono)
 * - 启动后先读服务端 ack
 */
import * as crypto from "crypto";
import * as net from "net";
import * as tls from "tls";
import * as fs from "fs";

const HOST = "openspeech.bytedance.com";
const PATH = "/api/v3/sauc/bigmodel";
const PROXY_HOST = "127.0.0.1";
const PROXY_PORT = 7890;

const APP_ID = "8217719829";
const ACCESS_TOKEN = "OjnzVCjORKQbMwd4hafgTOv8vTJQ1U87";
const RESOURCE_ID = "volc.bigasr.sauc.duration";

const LOGF = "D:/voice_claude/doubao.log";
function L(s: string) { try { fs.appendFileSync(LOGF, s + "\n"); } catch {} }

class WsReader {
  private buf: Buffer = Buffer.alloc(0);
  private resolve: ((v: Buffer | null) => void) | null = null;
  private timer: NodeJS.Timeout | null = null;

  private onData = (d: Buffer): void => {
    this.buf = Buffer.concat([this.buf, d]);
    this.flush();
  };

  attach(sock: net.Socket): void { sock.on("data", this.onData); }
  detach(sock: net.Socket): void { sock.removeListener("data", this.onData); this.cancel(); }

  private cancel(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.resolve = null;
  }

  read(timeout = 10000): Promise<Buffer | null> {
    if (this.tryResolveFrame()) return Promise.resolve(null);
    if (this.resolve) return Promise.reject(new Error("concurrent wsRead"));
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.timer = setTimeout(() => {
        L("WS.TIMEOUT");
        const r = this.resolve;
        this.resolve = null;
        this.timer = null;
        if (r) r(null);
      }, timeout);
    });
  }

  private tryResolveFrame(): boolean {
    if (this.buf.length < 2) return true;
    const opcode = this.buf[0] & 0x0F;
    const masked = (this.buf[1] & 0x80) !== 0;
    let len = this.buf[1] & 0x7F;
    let offset = 2;
    if (len === 126) { if (this.buf.length < 4) return true; len = this.buf.readUInt16BE(2); offset = 4; }
    else if (len === 127) { if (this.buf.length < 10) return true; len = Number(this.buf.readBigUInt64BE(2)); offset = 10; }
    const maskLen = masked ? 4 : 0;
    if (this.buf.length < offset + maskLen + len) return true;

    let payload: Buffer;
    if (masked) {
      const mask = this.buf.subarray(offset, offset + 4);
      const raw = this.buf.subarray(offset + 4, offset + 4 + len);
      payload = Buffer.alloc(len);
      for (let i = 0; i < len; i++) payload[i] = raw[i] ^ mask[i % 4];
    } else {
      payload = this.buf.subarray(offset, offset + len);
    }
    this.buf = this.buf.subarray(offset + maskLen + len);

    if (opcode === 0x8) { this.cancel(); return false; }
    if (opcode !== 0x1 && opcode !== 0x2) return this.tryResolveFrame();

    const resolve = this.resolve;
    if (resolve) { this.cancel(); resolve(payload); }
    return false;
  }

  private flush(): void { if (this.resolve) this.tryResolveFrame(); }
}

function hdr(msgType: number, flags = 0, serial = 0, compress = 0): Buffer {
  return Buffer.from([(1 << 4) | 1, (msgType << 4) | flags, (serial << 4) | compress, 0]);
}

function reqFrame(msgType: number, payload: Buffer, flags = 0, serial = 0): Buffer {
  const h = hdr(msgType, flags, serial);
  const sz = Buffer.alloc(4); sz.writeUInt32BE(payload.length, 0);
  return Buffer.concat([h, sz, payload]);
}

function wsFrame(data: Buffer): Buffer {
  const mask = crypto.randomBytes(4);
  const len = data.length;
  let h: Buffer;
  if (len < 126) h = Buffer.from([0x82, 0x80 | len]);
  else if (len < 65536) { h = Buffer.alloc(4); h[0] = 0x82; h[1] = 0x80 | 126; h.writeUInt16BE(len, 2); }
  else { h = Buffer.alloc(10); h[0] = 0x82; h[1] = 0x80 | 127; h.writeBigUInt64BE(BigInt(len), 2); }
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = data[i] ^ mask[i % 4];
  return Buffer.concat([h, mask, masked]);
}

function parseResp(raw: Buffer): { msgType: number; seq: number; json?: any; raw?: Buffer } | null {
  if (raw.length < 4) return null;
  const msgType = (raw[1] >> 4) & 0xF;

  const tries: { seq: number; p: Buffer }[] = [];

  if (raw.length >= 12) {
    const sz = raw.readUInt32BE(8);
    if (sz > 0 && sz <= raw.length - 12 && sz < 0x100000) tries.push({ seq: raw.readUInt32BE(4), p: raw.subarray(12, 12 + sz) });
  }
  if (raw.length >= 8) {
    const sz = raw.readUInt32BE(4);
    if (sz > 0 && sz <= raw.length - 8 && sz < 0x100000) tries.push({ seq: 0, p: raw.subarray(8, 8 + sz) });
  }
  if (raw.length > 4) tries.push({ seq: 0, p: raw.subarray(4) });

  for (const t of tries) {
    try { return { msgType, seq: t.seq, json: JSON.parse(t.p.toString("utf-8")) }; } catch {}
  }

  if (raw.length > 2) {
    try { return { msgType: 0, seq: 0, json: JSON.parse(raw.toString("utf-8")) }; } catch {}
  }

  return { msgType, seq: 0, raw: raw.subarray(4) };
}

function readHttpResp(sock: net.Socket, timeout: number): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => { sock.removeListener("data", onData); resolve(null); }, timeout);
    let buf = "";
    const onData = (d: Buffer) => {
      buf += d.toString();
      const idx = buf.indexOf("\r\n\r\n");
      if (idx >= 0) { clearTimeout(timer); sock.removeListener("data", onData); resolve(buf.slice(0, idx)); }
    };
    sock.on("data", onData);
  });
}

export async function transcribe(audio: Buffer, sampleRate = 16000): Promise<string | null> {
  L("T begin audio=" + audio.length + "B rate=" + sampleRate);
  try {
    L("1.CONNECT");
    const sock = net.connect(PROXY_PORT, PROXY_HOST);
    await new Promise<void>(r => sock.on("connect", r));
    sock.write("CONNECT " + HOST + ":443 HTTP/1.1\r\nHost: " + HOST + ":443\r\n\r\n");
    const resp = await readHttpResp(sock, 5000);
    if (!resp || !resp.includes("200")) { L("1.FAIL " + (resp ? resp.slice(0,100) : "timeout")); sock.end(); return null; }
    L("1.OK");

    L("2.TLS");
    const tlsSock = tls.connect({ socket: sock, servername: HOST });
    await new Promise<void>(r => tlsSock.on("secureConnect", r));
    L("2.OK");

    L("3.WS");
    const ws = new WsReader();
    ws.attach(tlsSock);
    const reqId = crypto.randomUUID();
    const key = crypto.randomBytes(16).toString("base64");
    tlsSock.write("GET " + PATH + " HTTP/1.1\r\nHost: " + HOST + "\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: " + key + "\r\nSec-WebSocket-Version: 13\r\nX-Api-App-Key: " + APP_ID + "\r\nX-Api-Access-Key: " + ACCESS_TOKEN + "\r\nX-Api-Resource-Id: " + RESOURCE_ID + "\r\nX-Api-Request-Id: " + reqId + "\r\nX-Api-Sequence: -1\r\n\r\n");
    const upgResp = await ws.read(5000);
    if (!upgResp || !upgResp.toString().includes("101")) { L("3.FAIL " + (upgResp ? upgResp.toString().slice(0,100) : "timeout")); ws.detach(tlsSock); tlsSock.end(); return null; }
    L("3.OK");

    L("4.REQ");
    const req = JSON.stringify({
      user: { uid: "voice_claude" },
      audio: { format: "pcm", rate: sampleRate, bits: 16, channel: 1, language: "zh-CN" },
      request: { model_name: "bigmodel", show_utterances: true, add_punc: true, result_type: "full" },
    });
    tlsSock.write(wsFrame(reqFrame(1, Buffer.from(req), 0, 1)));
    L("4.OK");

    const ack = await Promise.race([ ws.read(2000), new Promise<null>(r => setTimeout(r, 500, null)) ]);
    if (ack) {
      const p = parseResp(ack);
      L("4.ACK msgType=" + (p ? p.msgType : "?") + " " + JSON.stringify(p ? p.json : "").slice(0,200));
    } else {
      L("4.ACK (none)");
    }

    L("5.AUDIO " + audio.length + "B");
    for (let i = 0; i < audio.length; i += 6400) tlsSock.write(wsFrame(reqFrame(2, audio.subarray(i, i + 6400))));
    tlsSock.write(wsFrame(reqFrame(2, Buffer.alloc(0), 2)));
    L("5.LAST sent");

    const deadline = Date.now() + 20000;
    let text = "";
    while (Date.now() < deadline) {
      const raw = await ws.read(5000);
      if (!raw) { L("RESP timeout/close"); break; }
      L("RESP " + raw.length + "B hex=" + raw.slice(0,20).toString("hex") + " txt=" + raw.slice(0,80).toString().replace(/\n/g, "\\n"));
      const r = parseResp(raw);
      if (!r) { L("parseResp=null"); continue; }
      if (r.json) {
        L("JSON: " + JSON.stringify(r.json).slice(0,300));
        if (r.json.code !== undefined && r.json.code !== 0) { L("ERR: code=" + r.json.code + " msg=" + r.json.message); break; }
        if (r.json.result) { const j = r.json.result.map((x: any) => x.text || "").join(""); if (j) { text += j; } }
        if (r.json.text) { text += r.json.text; }
        if (r.json.utterance) { text += r.json.utterance; }
        if (r.json.is_final || r.msgType === 4) { L("RESP is_final"); break; }
      } else {
        L("RESP raw " + (r.raw ? r.raw.length : 0) + "B");
      }
    }
    ws.detach(tlsSock);
    tlsSock.end();
    const result = text.trim() || null;
    L("T end result=" + (result || "null"));
    return result;
  } catch (e) {
    L("EX: " + ((e as Error).stack || String(e)));
    return null;
  }
}

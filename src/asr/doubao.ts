// @ts-nocheck
/**
 * 豆包 ASR v3 — 大模型流式语音识别
 * 端点: /api/v3/sauc/bigmodel（双向流式）
 * 参考: https://www.volcengine.com/docs/6561/1354869
 */
import * as crypto from 'crypto';
import * as net from 'net';
import * as tls from 'tls';

const HOST = "openspeech.bytedance.com";
const PATH = "/api/v3/sauc/bigmodel";
const PROXY_HOST = "127.0.0.1";
const PROXY_PORT = 7890;

const APP_ID = "8217719829";
const ACCESS_TOKEN = "OjnzVCjORKQbMwd4hafgTOv8vTJQ1U87";
const RESOURCE_ID = "volc.bigasr.sauc.duration";

// 日志
let LOGF = '';
export function setLogFile(p: string) { LOGF = p; }
function L(s: string) { if (LOGF) try { require('fs').appendFileSync(LOGF, s + '\n'); } catch { } }

/**
 * WsReader — 持久化 WebSocket 帧读取器
 * 保证跨 wsRead 调用的数据不丢失（修复原版 buf 在每个 Promise 中从头累积的问题）
 */
class WsReader {
  private buf: Buffer = Buffer.alloc(0);
  private resolve: ((v: Buffer | null) => void) | null = null;
  private timer: NodeJS.Timeout | null = null;
  private onData = (d: Buffer) => {
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
    const frame = this.extractFrame();
    if (frame !== undefined) return Promise.resolve(frame);
    // 已有 resolve 等待中（不应该发生，但安全处理）
    if (this.resolve) return Promise.reject(new Error('concurrent wsRead'));
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.timer = setTimeout(() => {
        L("WS.TIMEOUT");
        this.resolve = null;
        this.timer = null;
        resolve(null);
      }, timeout);
    });
  }

  /** 尝试从 buffer 提取一个 WS 帧。
   * 返回 undefined = 需要更多数据；null = close 帧；Buffer = payload
   */
  private extractFrame(): Buffer | null | undefined {
    if (this.buf.length < 2) return undefined;
    const opcode = this.buf[0] & 0x0F;
    const masked = (this.buf[1] & 0x80) !== 0;
    let len = this.buf[1] & 0x7F;
    let offset = 2;
    if (len === 126) { if (this.buf.length < 4) return undefined; len = this.buf.readUInt16BE(2); offset = 4; }
    else if (len === 127) { if (this.buf.length < 10) return undefined; len = Number(this.buf.readBigUInt64BE(2)); offset = 10; }
    const maskLen = masked ? 4 : 0;
    if (this.buf.length < offset + maskLen + len) return undefined;
    // 提取 payload
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
    // 关闭帧
    if (opcode === 0x8) {
      return null;
    }
    // 仅处理 binary (0x2) 和 text (0x1) 帧；其余跳过继续解析
    if (opcode !== 0x1 && opcode !== 0x2) {
      return this.extractFrame();
    }
    return payload;
  }

  private flush() {
    if (!this.resolve) return;
    const frame = this.extractFrame();
    if (frame !== undefined) {
      const r = this.resolve;
      this.resolve = null;
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }
      r(frame);
    }
  }
}

function hdr(msgType: number, flags = 0, serial = 0, compress = 0): Buffer {
  return Buffer.from([(1 << 4) | 1, (msgType << 4) | flags, (serial << 4) | compress, 0]);
}

function reqFrame(msgType: number, payload: Buffer, flags = 0, serial = 0): Buffer {
  const h = hdr(msgType, flags, serial);
  const sz = Buffer.alloc(4); sz.writeUInt32BE(payload.length, 0);
  return Buffer.concat([h, sz, payload]);
}

/** WebSocket 掩码帧（客户端→服务器规格） */
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

/**
 * parseResp — 解析 Doubao 协议响应帧
 * 响应帧格式：Header(4B) + [可选Sequence(4B)] + PayloadSize(4B) + Payload
 * 为兼容不同版本，尝试多种解析策略：
 *   A) [4B hdr][4B seq][4B payloadSize][payload]  (v3 标准)
 *   B) [4B hdr][4B payloadSize][payload]           (v2 风格)
 *   C) [4B hdr][payload] 并假设 payload 是 JSON
 *   D) 整个 buffer 是 JSON（无协议封装）
 */
function parseResp(raw: Buffer): { msgType: number; seq: number; json?: any; raw?: Buffer } | null {
  if (raw.length < 4) return null;
  const msgType = (raw[1] >> 4) & 0xF;

  // 收集所有可能的 payload 候选
  const candidates: { seq: number; payload: Buffer }[] = [];

  // A) v3 标准: [4B hdr][4B seq][4B payloadSize][payload]
  if (raw.length >= 12) {
    const sz = raw.readUInt32BE(8);
    if (sz > 0 && sz <= raw.length - 12 && sz < 0x100000) candidates.push({ seq: raw.readUInt32BE(4), payload: raw.subarray(12, 12 + sz) });
  }

  // B) v2 风格无 seq: [4B hdr][4B payloadSize][payload]
  if (raw.length >= 8) {
    const sz = raw.readUInt32BE(4);
    if (sz > 0 && sz <= raw.length - 8 && sz < 0x100000) candidates.push({ seq: 0, payload: raw.subarray(8, 8 + sz) });
  }

  // C) payload 紧跟在 4B header 后
  if (raw.length > 4) {
    candidates.push({ seq: 0, payload: raw.subarray(4) });
  }

  // 按顺序解析 JSON
  for (const { seq, payload } of candidates) {
    try {
      const json = JSON.parse(payload.toString('utf-8'));
      return { msgType, seq, json };
    } catch { /* 下一个 */ }
  }

  // D) 整个 buffer 本身是 JSON
  if (raw.length > 2) {
    try { return { msgType: 0, seq: 0, json: JSON.parse(raw.toString("utf-8")) }; } catch {}
  }

  return { msgType, seq: 0, raw: raw.subarray(4) };

  return { msgType, seq: 0, raw: raw.subarray(4) };
}

/**
 * transcribe — PCM 音频 → 中文文本
 * @param audio PCM 16-bit 16kHz mono 音频数据
 * @param sampleRate 采样率（默认 16000）
 * @returns 识别文本，无结果或出错时返回 null
 */
export async function transcribe(audio: Buffer, sampleRate = 16000): Promise<string | null> {
  L("T begin audio=" + audio.length + "B rate=" + sampleRate);
  try {
    L("1.CONNECT");
    const sock = net.connect(PROXY_PORT, PROXY_HOST);
    await new Promise(r => sock.on('connect', r));
    sock.write(`CONNECT ${HOST}:443 HTTP/1.1\r\nHost: ${HOST}:443\r\n\r\n`);
    // 读取 HTTP 响应
    let resp = await readHttpResponse(sock, 5000);
    if (!resp || !resp.includes('200')) {
      L(`1.FAIL ${resp?.slice(0, 100) || 'timeout'}`);
      sock.end(); return null;
    }
    L('1.OK');

    L("2.TLS");
    const tlsSock = tls.connect({ socket: sock, servername: HOST });
    await new Promise<void>(r => tlsSock.on("secureConnect", r));
    L("2.OK");

    L("3.WS");
    const ws = new WsReader();
    const reqId = crypto.randomUUID();
    const key = crypto.randomBytes(16).toString("base64");
    tlsSock.write("GET " + PATH + " HTTP/1.1\r\nHost: " + HOST + "\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: " + key + "\r\nSec-WebSocket-Version: 13\r\nX-Api-App-Key: " + APP_ID + "\r\nX-Api-Access-Key: " + ACCESS_TOKEN + "\r\nX-Api-Resource-Id: " + RESOURCE_ID + "\r\nX-Api-Request-Id: " + reqId + "\r\nX-Api-Sequence: -1\r\n\r\n");
    const upgResp = await readHttpResponse(tlsSock, 5000);
    if (!upgResp || !upgResp.includes("101")) { L("3.FAIL " + (upgResp ? upgResp.slice(0,100) : "timeout")); tlsSock.end(); return null; }
    L("3.OK");
    ws.attach(tlsSock);

    L("4.REQ");
    const req = JSON.stringify({
      user: { uid: "voice_claude" },
      audio: { format: "pcm", rate: sampleRate, bits: 16, channel: 1, language: "zh-CN" },
      request: { model_name: "bigmodel", show_utterances: true, add_punc: true, result_type: "full" },
    });
    tlsSock.write(wsFrame(reqFrame(1, Buffer.from(req), 0, 1)));
    L("4.OK");

    // 5. 读取服务端确认（可能有也可能没有，非阻塞尝试）
    const ack = await Promise.race([ws.read(2000), new Promise<null>(r => setTimeout(r, 500, null))]);
    if (ack) {
      const parsed = parseResp(ack);
      L(`4.ACK msgType=${parsed?.msgType} json=${JSON.stringify(parsed?.json).slice(0, 200)}`);
    } else {
      L("4.ACK (none)");
    }

    // 6. 发送音频（200ms 每包 = 6400 bytes @ 16kHz 16bit mono，按 v3 文档推荐）
    L(`5.AUDIO ${audio.length}B`);
    const pktSize = 6400;
    for (let i = 0; i < audio.length; i += pktSize) {
      tlsSock.write(wsFrame(reqFrame(2, audio.subarray(i, i + pktSize))));
    }

    // 7. 最后一包（flags=2 = last）
    tlsSock.write(wsFrame(reqFrame(2, Buffer.alloc(0), 2)));
    L("5.LAST sent");

    const deadline = Date.now() + 20000;
    let text = "";
    while (Date.now() < deadline) {
      const raw = await ws.read(5000);
      if (!raw) { L('RESP timeout/close'); break; }
      L(`RESP ${raw.length}B hex=${raw.slice(0, 20).toString('hex')} first=${raw.slice(0, 80).toString().replace(/\n/g, '\\n')}`);
      const r = parseResp(raw);
      if (!r) { L("parseResp=null"); continue; }
      if (r.json) {
        L(`JSON: ${JSON.stringify(r.json).slice(0, 300)}`);
        // msg_type=3 = interim, 4 = final, 5 = error
        if (r.json.code !== undefined && r.json.code !== 0) {
          L(`ERR: ${r.json.message || r.json.code}`);
          break;
        }
        // 取最新累积文本（流式结果中 result.text 是累计的）
        if (r.json.result) {
          if (Array.isArray(r.json.result)) {
            const parts: string[] = r.json.result.map((x: any) => x.text || '');
            const joined = parts.join('');
            if (joined) { text = joined; }
          } else if (r.json.result.text !== undefined) {
            text = r.json.result.text;
          }
        }
        if (r.json.text) { text = r.json.text; }

        // 判断是否为最终结果：is_final / definite / utterances 中 definite
        const isFinal = r.json.is_final === true ||
                        r.json.result?.definite === true ||
                        (r.json.utterances && r.json.utterances.some((u: any) => u.definite === true));
        if (isFinal) { L('RESP is_final'); break; }
      } else {
        L(`RESP raw ${r.raw?.length}B: ${r.raw?.slice(0, 40).toString('hex')}`);
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

/** 读取 HTTP 响应直到 \r\n\r\n */
function readHttpResponse(sock: net.Socket, timeout: number): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { sock.removeListener('data', onData); resolve(null); }, timeout);
    let buf = '';
    const onData = (d: Buffer) => {
      buf += d.toString();
      const idx = buf.indexOf('\r\n\r\n');
      if (idx >= 0) {
        clearTimeout(timer);
        sock.removeListener('data', onData);
        resolve(buf.slice(0, idx));
      }
    };
    sock.on('data', onData);
  });
}

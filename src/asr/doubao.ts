/**
 * 豆包 ASR v3 — 大模型流式语音识别
 * 端点: /api/v3/sauc/bigmodel（双向流式）
 * 参考: https://www.volcengine.com/docs/6561/1354869
 *
 * 修复:
 * - WsReader 持久化缓冲，解决多帧在单 TCP 段到达时丢失的问题
 * - parseResp 多格式探测（v3 标准 / v2 风格 / 裸 JSON）
 * - 音频包大小 6400B (200ms @ 16kHz 16bit mono)
 * - 启动后先读服务端 ack
 * - 更完善的日志和错误处理
 */
import * as crypto from 'crypto';
import * as net from 'net';
import * as tls from 'tls';
import * as fs from 'fs';

const HOST = 'openspeech.bytedance.com';
const PATH = '/api/v3/sauc/bigmodel';
const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 7890;

// 凭证（旧版控制台）
const APP_ID = '8217719829';
const ACCESS_TOKEN = 'OjnzVCjORKQbMwd4hafgTOv8vTJQ1U87';
const RESOURCE_ID = 'volc.bigasr.sauc.duration'; // 豆包1.0 小时版

const LOGF = 'D:/voice_claude/doubao.log';
function L(s: string) { try { fs.appendFileSync(LOGF, s + '\n'); } catch { } }

/**
 * WsReader — 持久化 WebSocket 帧读取器
 * 保证跨 read() 调用的数据不丢失
 */
class WsReader {
  private buf = Buffer.alloc(0);
  private resolve: ((v: Buffer | null) => void) | null = null;
  private timer: NodeJS.Timeout | null = null;

  private onData = (d: Buffer) => {
    this.buf = Buffer.concat([this.buf, d]);
    this.flush();
  };

  attach(sock: net.Socket) { sock.on('data', this.onData); }
  detach(sock: net.Socket) { sock.removeListener('data', this.onData); this.cancel(); }

  private cancel() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.resolve = null;
  }

  /** 读一个 WS 帧的 payload。返回 null = 超时或关闭帧。 */
  read(timeout = 10000): Promise<Buffer | null> {
    // 尝试从已有 buffer 解析
    if (this.tryResolveFrame()) return Promise.resolve(null);

    if (this.resolve) return Promise.reject(new Error('concurrent wsRead'));
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.timer = setTimeout(() => {
        L('WS.TIMEOUT');
        const r = this.resolve;
        this.resolve = null;
        this.timer = null;
        r?.(null);
      }, timeout);
    });
  }

  /** 从 buf 提取一个 WS 帧。返回 true = 需要更多数据 */
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

    // 关闭帧
    if (opcode === 0x8) { this.cancel(); return false; }
    // 只处理 binary(0x2) 和 text(0x1)，跳过 ping/pong
    if (opcode !== 0x1 && opcode !== 0x2) return this.tryResolveFrame();

    const resolve = this.resolve;
    if (resolve) { this.cancel(); resolve(payload); }
    return false;
  }

  private flush() { if (this.resolve) this.tryResolveFrame(); }
}

// ---- Doubao 协议函数 ----

/** 帧头: [version(4)|hdr_size(4)] [msg_type(4)|flags(4)] [serial(4)|compress(4)] [reserved(8)] */
function hdr(msgType: number, flags = 0, serial = 0, compress = 0): Buffer {
  return Buffer.from([(1 << 4) | 1, (msgType << 4) | flags, (serial << 4) | compress, 0]);
}

/** 请求帧: Header(4B) + PayloadSize(4B) + Payload */
function reqFrame(msgType: number, payload: Buffer, flags = 0, serial = 0): Buffer {
  const h = hdr(msgType, flags, serial);
  const sz = Buffer.alloc(4); sz.writeUInt32BE(payload.length, 0);
  return Buffer.concat([h, sz, payload]);
}

/** WebSocket 掩码帧（客户端→服务器） */
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
 * 尝试多种格式:
 *   A) [4B hdr][4B seq][4B payloadSize][payload]  (v3 标准)
 *   B) [4B hdr][4B payloadSize][payload]           (v2 风格)
 *   C) [4B hdr][payload] 整个余部尝试 JSON
 *   D) 整个 buffer 尝试 JSON（无协议封装）
 */
function parseResp(raw: Buffer): { msgType: number; seq: number; json?: any; raw?: Buffer } | null {
  if (raw.length < 4) return null;
  const msgType = (raw[1] >> 4) & 0xF;

  // 收集 payload 候选
  const candidates: { seq: number; payload: Buffer }[] = [];

  // A) v3 标准
  if (raw.length >= 12) {
    const paySz = raw.readUInt32BE(8);
    if (paySz > 0 && paySz <= raw.length - 12 && paySz < 0x100000) {
      candidates.push({ seq: raw.readUInt32BE(4), payload: raw.subarray(12, 12 + paySz) });
    }
  }

  // B) v2 风格（无 seq）
  if (raw.length >= 8) {
    const paySz = raw.readUInt32BE(4);
    if (paySz > 0 && paySz <= raw.length - 8 && paySz < 0x100000) {
      candidates.push({ seq: 0, payload: raw.subarray(8, 8 + paySz) });
    }
  }

  // C) 余部整个当 payload
  if (raw.length > 4) {
    candidates.push({ seq: 0, payload: raw.subarray(4) });
  }

  for (const { seq, payload } of candidates) {
    try {
      const json = JSON.parse(payload.toString('utf-8'));
      return { msgType, seq, json };
    } catch { /* 下一候选 */ }
  }

  // D) 整个 buffer 试 JSON
  if (raw.length > 2) {
    try {
      const json = JSON.parse(raw.toString('utf-8'));
      return { msgType: 0, seq: 0, json };
    } catch { }
  }

  return { msgType, seq: 0, raw: raw.subarray(4) };
}

/** 读 HTTP 响应直到 \r\n\r\n */
function readHttpResp(sock: net.Socket, timeout: number): Promise<string | null> {
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

/**
 * transcribe — PCM 音频 → 中文文本
 * @param audio PCM 16-bit 16kHz mono 音频数据
 * @param sampleRate 采样率（默认 16000）
 * @returns 识别文本，无结果或出错时返回 null
 */
export async function transcribe(audio: Buffer, sampleRate = 16000): Promise<string | null> {
  L(`T begin audio=${audio.length}B rate=${sampleRate}`);
  try {
    // 1. 代理连接
    L('1.CONNECT');
    const sock = net.connect(PROXY_PORT, PROXY_HOST);
    await new Promise(r => sock.on('connect', r));
    sock.write(`CONNECT ${HOST}:443 HTTP/1.1\r\nHost: ${HOST}:443\r\n\r\n`);
    const resp = await readHttpResp(sock, 5000);
    if (!resp || !resp.includes('200')) {
      L(`1.FAIL ${resp?.slice(0, 100) || 'timeout'}`);
      sock.end(); return null;
    }
    L('1.OK');

    // 2. TLS
    L('2.TLS');
    const tlsSock = tls.connect({ socket: sock, servername: HOST });
    await new Promise(r => tlsSock.on('secureConnect', r));
    L('2.OK');

    // 3. WS 升级
    L('3.WS');
    const ws = new WsReader();
    ws.attach(tlsSock);
    const reqId = crypto.randomUUID();
    const key = crypto.randomBytes(16).toString('base64');
    tlsSock.write([
      `GET ${PATH} HTTP/1.1`, `Host: ${HOST}`,
      'Upgrade: websocket', 'Connection: Upgrade',
      `Sec-WebSocket-Key: ${key}`, 'Sec-WebSocket-Version: 13',
      `X-Api-App-Key: ${APP_ID}`, `X-Api-Access-Key: ${ACCESS_TOKEN}`,
      `X-Api-Resource-Id: ${RESOURCE_ID}`, `X-Api-Request-Id: ${reqId}`,
      'X-Api-Sequence: -1',
      '', '',
    ].join('\r\n'));
    const upgResp = await ws.read(5000);
    if (!upgResp || !upgResp.toString().includes('101')) {
      L(`3.FAIL ${upgResp?.toString().slice(0, 100) || 'timeout'}`);
      ws.detach(tlsSock); tlsSock.end(); return null;
    }
    L('3.OK');

    // 4. 发送客户端请求
    L('4.REQ');
    const req = JSON.stringify({
      user: { uid: 'voice_claude' },
      audio: { format: 'pcm', rate: sampleRate, bits: 16, channel: 1, language: 'zh-CN' },
      request: { model_name: 'bigmodel', show_utterances: true, add_punc: true, result_type: 'full' },
    });
    tlsSock.write(wsFrame(reqFrame(1, Buffer.from(req), 0, 1)));
    L('4.OK');

    // 5. 读取服务端确认（非阻塞，500ms 超时）
    const ack = await Promise.race([
      ws.read(2000),
      new Promise<null>(r => setTimeout(r, 500, null)),
    ]);
    if (ack) {
      const parsed = parseResp(ack);
      L(`4.ACK msgType=${parsed?.msgType} data=${JSON.stringify(parsed?.json).slice(0, 200)}`);
    } else {
      L('4.ACK (none/ignored)');
    }

    // 6. 发送音频（200ms 每包 = 6400 bytes @ 16kHz 16bit mono）
    L(`5.AUDIO ${audio.length}B`);
    const pktSize = 6400;
    for (let i = 0; i < audio.length; i += pktSize) {
      tlsSock.write(wsFrame(reqFrame(2, audio.subarray(i, i + pktSize))));
    }

    // 7. 最后一包（flags=2 = last）
    tlsSock.write(wsFrame(reqFrame(2, Buffer.alloc(0), 2)));
    L('5.LAST sent');

    // 8. 收结果
    const deadline = Date.now() + 20000;
    let text = '';
    let hasResult = false;
    while (Date.now() < deadline) {
      const raw = await ws.read(5000);
      if (!raw) { L('RESP timeout/close'); break; }
      L(`RESP ${raw.length}B hex=${raw.slice(0, 20).toString('hex')} txt=${raw.slice(0, 80).toString().replace(/\n/g, '\\n')}`);
      const r = parseResp(raw);
      if (!r) { L('parseResp=null'); continue; }
      if (r.json) {
        L(`JSON: ${JSON.stringify(r.json).slice(0, 300)}`);
        if (r.json.code !== undefined && r.json.code !== 0) {
          L(`ERR: code=${r.json.code} msg=${r.json.message}`);
          break;
        }
        if (r.json.result) {
          const parts: string[] = r.json.result.map((x: any) => x.text || '');
          const joined = parts.join('');
          if (joined) { text += joined; hasResult = true; }
        }
        if (r.json.text) { text += r.json.text; hasResult = true; }
        if (r.json.utterance) { text += r.json.utterance; hasResult = true; }
        if (r.json.is_final || r.msgType === 4) { L('RESP is_final'); break; }
      } else {
        L(`RESP raw ${r.raw?.length}B`);
      }
    }
    ws.detach(tlsSock);
    tlsSock.end();
    const result = text.trim() || null;
    L(`T end result=${result?.slice(0, 100) || 'null'}`);
    return result;
  } catch (e: any) {
    L(`EX: ${e?.stack || String(e)}`);
    return null;
  }
}

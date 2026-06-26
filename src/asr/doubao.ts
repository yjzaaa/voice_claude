/**
 * 豆包 ASR v3 — 大模型流式语音识别
 * 端点: /api/v3/sauc/bigmodel（双向流式）
 * 参考: https://www.volcengine.com/docs/6561/1354869
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

// Header: [version(4b)|header_size(4b)] [msg_type(4b)|flags(4b)] [serial(4b)|compress(4b)] [reserved(8b)]
function hdr(msgType: number, flags=0, serial=0, compress=0): Buffer {
  return Buffer.from([(1<<4)|1, (msgType<<4)|flags, (serial<<4)|compress, 0]);
}

// 请求帧: Header(4B) + PayloadSize(4B) + Payload
function reqFrame(msgType: number, payload: Buffer, flags=0, serial=0): Buffer {
  const h = hdr(msgType, flags, serial);
  const sz = Buffer.alloc(4); sz.writeUInt32BE(payload.length, 0);
  return Buffer.concat([h, sz, payload]);
}

// 响应帧: Header(4B) + Sequence(4B) + PayloadSize(4B) + Payload
function parseResp(raw: Buffer) {
  if (raw.length < 12) return null;
  const msgType = (raw[1] >> 4) & 0xF;
  const serial = (raw[2] >> 4) & 0xF;
  // Sequence
  const seq = raw.readUInt32BE(4);
  // Payload size
  const payloadSize = raw.readUInt32BE(8);
  if (raw.length < 12 + payloadSize) return null;
  const payload = raw.subarray(12, 12 + payloadSize);
  try {
    if (serial === 0 /* raw */) return { msgType, seq, raw: payload };
    const json = JSON.parse(payload.toString('utf-8'));
    return { msgType, seq, json };
  } catch { return null; }
}

// WebSocket framing
function wsFrame(data: Buffer): Buffer {
  const mask = crypto.randomBytes(4);
  const len = data.length;
  let h: Buffer;
  if (len < 126) h = Buffer.from([0x82, 0x80|len]);
  else if (len < 65536) { h = Buffer.alloc(4); h[0]=0x82; h[1]=0x80|126; h.writeUInt16BE(len,2); }
  else { h = Buffer.alloc(10); h[0]=0x82; h[1]=0x80|127; h.writeBigUInt64BE(BigInt(len),2); }
  const masked = Buffer.alloc(len);
  for (let i=0;i<len;i++) masked[i]=data[i]^mask[i%4];
  return Buffer.concat([h, mask, masked]);
}

function wsRead(sock: net.Socket, timeout=10000): Promise<Buffer|null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeout);
    let buf = Buffer.alloc(0);
    const onData = (d: Buffer) => {
      buf = Buffer.concat([buf, d]);
      // 解析 WS 帧（服务端帧不掩码）
      if (buf.length < 2) return;
      const opcode = buf[0] & 0xF;
      let len = buf[1] & 0x7F;
      let offset = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); offset = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); offset = 10; }
      if (buf.length < offset + len) return;
      clearTimeout(timer);
      sock.removeListener('data', onData);
      const payload = buf.subarray(offset, offset + len);
      if (opcode === 0x8) resolve(null); // close
      else resolve(payload);
    };
    sock.on('data', onData);
  });
}

const LOGF = 'D:/voice_claude/doubao.log';
function L(s: string) { try { fs.appendFileSync(LOGF, s+'\n'); } catch {} }

export async function transcribe(audio: Buffer, sampleRate=16000): Promise<string|null> {
  try {
    L('1.CONNECT');
    const sock = net.connect(PROXY_PORT, PROXY_HOST);
    await new Promise(r => sock.on('connect', r));
    sock.write(`CONNECT ${HOST}:443 HTTP/1.1\r\nHost: ${HOST}:443\r\n\r\n`);
    let buf = await wsRead(sock, 5000); if (!buf || !buf.toString().includes('200')) { L('1.FAIL '+buf?.toString().slice(0,100)); sock.end(); return null; }
    L('1.OK');

    L('2.TLS');
    const sock2 = tls.connect({ socket: sock, servername: HOST });
    await new Promise(r => sock2.on('secureConnect', r));
    L('2.OK');

    L('3.WS');
    const reqId = crypto.randomUUID();
    const key = crypto.randomBytes(16).toString('base64');
    sock2.write([
      `GET ${PATH} HTTP/1.1`, `Host: ${HOST}`,
      'Upgrade: websocket', 'Connection: Upgrade',
      `Sec-WebSocket-Key: ${key}`, 'Sec-WebSocket-Version: 13',
      `X-Api-App-Key: ${APP_ID}`, `X-Api-Access-Key: ${ACCESS_TOKEN}`,
      `X-Api-Resource-Id: ${RESOURCE_ID}`, `X-Api-Request-Id: ${reqId}`,
      'X-Api-Sequence: -1',
      '', '',
    ].join('\r\n'));
    buf = await wsRead(sock2, 5000);
    if (!buf || !buf.toString().includes('101')) { L('3.FAIL '+buf?.toString().slice(0,100)); sock2.end(); return null; }
    L('3.OK');

    L('4.REQ');
    // 4. Full client request
    const req = JSON.stringify({
      user: { uid: 'voice_claude' },
      audio: { format: 'pcm', rate: sampleRate, bits: 16, channel: 1, language: 'zh-CN' },
      request: { model_name: 'bigmodel', show_utterances: true },
    });
    sock2.write(wsFrame(reqFrame(1, Buffer.from(req), 0, 1/*JSON*/)));
    L('4.OK');

    // 5. 发音频（100ms 每包 = 3200 bytes @ 16kHz 16bit mono）
    L('5.AUDIO '+audio.length+'bytes');
    const pktSize = 3200;
    for (let i=0; i<audio.length; i+=pktSize)
      sock2.write(wsFrame(reqFrame(2, audio.subarray(i, i+pktSize))));

    // 6. 最后一包（flags=2 = negative）
    sock2.write(wsFrame(reqFrame(2, Buffer.alloc(0), 2/*last*/)));

    // 7. 收结果
    const deadline = Date.now() + 15000;
    let text = '';
    while (Date.now() < deadline) {
      const raw = await wsRead(sock2, 3000);
      if (!raw) { L('RESP timeout'); break; }
      L('RESP '+raw.length+'B: '+raw.slice(0,16).toString('hex'));
      const r = parseResp(raw);
      if (!r) { L('parse FAIL'); continue; }
      if (r.json) {
        fs.appendFileSync('D:/voice_claude/doubao.log', JSON.stringify(r.json).slice(0,300)+'\n');
        if (r.json.result) text += r.json.result.map((x:any)=>x.text||'').join('');
        if (r.json.is_final) break;
        if (r.json.code && r.json.code!==0) { fs.appendFileSync('D:/voice_claude/doubao.log', 'ERR:'+r.json.message+'\n'); break; }
      }
    }
    sock2.end();
    return text.trim() || null;
  } catch (e) {
    fs.appendFileSync('D:/voice_claude/doubao.log', 'EX:'+String(e)+'\n');
    return null;
  }
}

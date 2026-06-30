import * as http from 'http';
import * as https from 'https';

export interface HttpClient {
  request(
    options: https.RequestOptions,
    callback: (res: http.IncomingMessage) => void,
  ): http.ClientRequest;
}

class NodeHttpClient implements HttpClient {
  request(
    options: https.RequestOptions,
    callback: (res: http.IncomingMessage) => void,
  ): http.ClientRequest {
    const module = options.protocol === 'http:' ? http : https;
    return module.request(options, callback);
  }
}

export class HttpsJsonClient {
  constructor(private client: HttpClient = new NodeHttpClient()) {}

  post(
    url: string,
    body: unknown,
    headers: Record<string, string> = {},
    timeoutMs = 30000,
  ): Promise<unknown> {
    const urlObj = new URL(url);
    const jsonBody = JSON.stringify(body);

    const options: https.RequestOptions = {
      protocol: urlObj.protocol,
      hostname: urlObj.hostname,
      port: urlObj.port || undefined,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(jsonBody).toString(),
        ...headers,
      },
      timeout: timeoutMs,
    };

    return new Promise((resolve, reject) => {
      const req = this.client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ raw: data });
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      });

      req.write(jsonBody);
      req.end();
    });
  }
}

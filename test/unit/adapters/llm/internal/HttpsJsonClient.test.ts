import { HttpsJsonClient, HttpClient } from '../../../../../src/adapters/llm/internal/HttpsJsonClient';

type ResponseLike = { on(event: 'data' | 'end', cb: any): void; statusCode?: number };

type RequestLike = {
  on(event: 'error' | 'timeout', cb: any): void;
  write(data: any): void;
  end(): void;
  destroy(): void;
  _errorHandler?: (err: Error) => void;
  _timeoutHandler?: () => void;
};

function makeFakeClient(
  response: ResponseLike,
): { calls: { options: any; body?: string }[]; getLastReq: () => RequestLike | undefined; client: HttpClient } {
  const calls: { options: any; body?: string }[] = [];
  let lastReq: RequestLike | undefined;
  const client = {
    request: (options: any, callback: (res: ResponseLike) => void) => {
      calls.push({ options });
      const req: RequestLike = {
        on: (event, handler) => {
          if (event === 'error') req._errorHandler = handler;
          if (event === 'timeout') req._timeoutHandler = handler;
        },
        write: (data) => { calls[calls.length - 1].body = data.toString(); },
        end: () => { callback(response); },
        destroy: jest.fn(),
      };
      lastReq = req;
      return req as any;
    },
  } as unknown as HttpClient;
  return { calls, getLastReq: () => lastReq, client };
}

describe('HttpsJsonClient', () => {
  test('POST sends JSON body and Authorization header', async () => {
    const response: ResponseLike = {
      statusCode: 200,
      on(event, cb) {
        if (event === 'data') cb(Buffer.from(JSON.stringify({ ok: true })));
        if (event === 'end') cb();
      },
    };
    const { client, calls } = makeFakeClient(response);
    const http = new HttpsJsonClient(client);

    const result = await http.post(
      'https://api.example.com/v1/chat/completions',
      { model: 'gpt-4', messages: [] },
      { Authorization: 'Bearer token123' },
      5000,
    );

    expect(result).toEqual({ ok: true });
    expect(calls[0].options.method).toBe('POST');
    expect(calls[0].options.hostname).toBe('api.example.com');
    expect(calls[0].options.headers['Authorization']).toBe('Bearer token123');
    expect(calls[0].options.headers['Content-Type']).toBe('application/json');
    expect(calls[0].body).toBe(JSON.stringify({ model: 'gpt-4', messages: [] }));
  });

  test('resolves with raw string wrapper when response is not valid JSON', async () => {
    const response: ResponseLike = {
      statusCode: 200,
      on(event, cb) {
        if (event === 'data') cb(Buffer.from('not-json'));
        if (event === 'end') cb();
      },
    };
    const { client } = makeFakeClient(response);
    const http = new HttpsJsonClient(client);

    const result = await http.post('https://api.example.com/v1', {});

    expect(result).toEqual({ raw: 'not-json' });
  });

  test('rejects on request error', async () => {
    const { client, getLastReq } = makeFakeClient({ statusCode: 200, on: () => {} });
    const http = new HttpsJsonClient(client);

    const promise = http.post('https://api.example.com/v1', {});
    getLastReq()!._errorHandler!(new Error('network down'));

    await expect(promise).rejects.toThrow('network down');
  });

  test('rejects on timeout and destroys request', async () => {
    const { client, getLastReq } = makeFakeClient({ statusCode: 200, on: () => {} });
    const http = new HttpsJsonClient(client);

    const promise = http.post('https://api.example.com/v1', {});
    getLastReq()!._timeoutHandler!();

    await expect(promise).rejects.toThrow('timeout');
  });
});

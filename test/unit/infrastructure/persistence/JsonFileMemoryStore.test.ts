import { JsonFileMemoryStore } from '../../../../src/infrastructure/persistence/JsonFileMemoryStore';

describe('JsonFileMemoryStore', () => {
  const makeFs = (initial?: string) => {
    let data = initial ?? '';
    return {
      existsSync: jest.fn().mockReturnValue(data !== ''),
      readFileSync: jest.fn().mockImplementation(() => data),
      writeFileSync: jest.fn().mockImplementation((_path: string, content: string) => {
        data = content;
      }),
    };
  };

  test('returns undefined when file does not exist', async () => {
    const fs = makeFs();
    fs.existsSync.mockReturnValue(false);
    const store = new JsonFileMemoryStore('/tmp/memory.json', fs as any);

    const value = await store.get('foo');

    expect(value).toBeUndefined();
  });

  test('returns undefined for missing key', async () => {
    const fs = makeFs('{}');
    const store = new JsonFileMemoryStore('/tmp/memory.json', fs as any);

    const value = await store.get('foo');

    expect(value).toBeUndefined();
  });

  test('stores and retrieves a value', async () => {
    const fs = makeFs('{}');
    const store = new JsonFileMemoryStore('/tmp/memory.json', fs as any);

    await store.set('foo', { bar: 1 });
    const value = await store.get('foo');

    expect(value).toEqual({ bar: 1 });
  });

  test('keeps multiple keys in the same file', async () => {
    const fs = makeFs('{}');
    const store = new JsonFileMemoryStore('/tmp/memory.json', fs as any);

    await store.set('a', 1);
    await store.set('b', 2);

    expect(await store.get('a')).toBe(1);
    expect(await store.get('b')).toBe(2);
  });
});

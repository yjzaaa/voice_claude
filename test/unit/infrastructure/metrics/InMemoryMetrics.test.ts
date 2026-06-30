import { InMemoryMetrics } from '../../../../src/infrastructure/metrics/InMemoryMetrics';

describe('InMemoryMetrics', () => {
  let metrics: InMemoryMetrics;

  beforeEach(() => {
    metrics = new InMemoryMetrics();
  });

  test('records values under a name', () => {
    metrics.record('latency', 100);
    metrics.record('latency', 200);
    const snapshot = metrics.getSnapshot();
    expect(snapshot.latency).toEqual({ count: 2, sum: 300, values: [100, 200] });
  });

  test('increments a counter', () => {
    metrics.increment('deliveries');
    metrics.increment('deliveries');
    metrics.increment('errors');
    const snapshot = metrics.getSnapshot();
    expect(snapshot.deliveries).toBe(2);
    expect(snapshot.errors).toBe(1);
  });

  test('supports labels for counters', () => {
    metrics.increment('delivery', { target: 'terminal-1' });
    metrics.increment('delivery', { target: 'terminal-1' });
    metrics.increment('delivery', { target: 'terminal-2' });
    const snapshot = metrics.getSnapshot();
    expect(snapshot['delivery|target=terminal-1']).toBe(2);
    expect(snapshot['delivery|target=terminal-2']).toBe(1);
  });

  test('returns empty snapshot initially', () => {
    expect(metrics.getSnapshot()).toEqual({});
  });
});

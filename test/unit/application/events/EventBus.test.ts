import { EventBus } from '../../../../src/application/events/EventBus';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  test('emits event to a single subscriber', () => {
    const handler = jest.fn();
    bus.on('test:event', handler);
    bus.emit('test:event', { value: 42 });
    expect(handler).toHaveBeenCalledWith({ value: 42 });
  });

  test('emits event to multiple subscribers', () => {
    const handlerA = jest.fn();
    const handlerB = jest.fn();
    bus.on('test:event', handlerA);
    bus.on('test:event', handlerB);
    bus.emit('test:event', 'payload');
    expect(handlerA).toHaveBeenCalledWith('payload');
    expect(handlerB).toHaveBeenCalledWith('payload');
  });

  test('unsubscribe stops delivery', () => {
    const handler = jest.fn();
    const unsubscribe = bus.on('test:event', handler);
    unsubscribe();
    bus.emit('test:event', 'payload');
    expect(handler).not.toHaveBeenCalled();
  });

  test('routes subscriber errors to injected error handler', () => {
    const onError = jest.fn();
    bus = new EventBus({ onError });
    const boom = new Error('subscriber boom');

    bus.on('test:event', () => {
      throw boom;
    });
    bus.emit('test:event', { value: 42 });

    expect(onError).toHaveBeenCalledTimes(1);
    const [event, err] = onError.mock.calls[0];
    expect(event).toBe('test:event');
    expect(err).toBe(boom);
  });

  test('does not throw when emitting event with no subscribers', () => {
    expect(() => bus.emit('unknown:event', 'payload')).not.toThrow();
  });

  test('supports typed event names with different payloads', () => {
    const handler = jest.fn();
    bus.on('recording:started', handler);
    bus.emit('recording:started', { recording: true });
    expect(handler).toHaveBeenCalledWith({ recording: true });
  });
});

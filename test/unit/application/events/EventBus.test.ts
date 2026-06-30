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

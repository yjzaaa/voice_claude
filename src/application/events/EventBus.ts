/**
 * Internal event bus for decoupling layers.
 * Domain/Application code publishes and subscribes here instead of
 * depending on Electron IPC or concrete adapters.
 */
export type EventPayload =
  Record<string, unknown> | string | number | boolean | unknown[] | undefined;

interface EventBusOptions {
  /** Optional handler for subscriber exceptions. Receives event name and the thrown value. */
  onError?: (event: string, error: unknown) => void;
}

export class EventBus {
  private listeners = new Map<string, Set<(payload: EventPayload) => void>>();

  constructor(private options: EventBusOptions = {}) {}

  on(event: string, handler: (payload: EventPayload) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(handler);

    return () => {
      set.delete(handler);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  emit(event: string, payload?: EventPayload): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(payload);
      } catch (err) {
        if (this.options.onError) {
          this.options.onError(event, err);
        } else {
          // EventBus should not crash if a subscriber throws.
          // eslint-disable-next-line no-console
          console.error(`[EventBus] handler for "${event}" threw:`, err);
        }
      }
    }
  }

  removeAll(event: string): void {
    this.listeners.delete(event);
  }
}

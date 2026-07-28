// A minimal, self-contained implementation of the DOM EventTarget / Event
// interfaces, sufficient for AbortSignal. The project targets `es2023` (no DOM
// lib), so these primitives must be implemented rather than imported.

export interface EventInit {
  bubbles?: boolean
  cancelable?: boolean
  composed?: boolean
}

export interface EventListenerOptions {
  capture?: boolean
}

export interface AddEventListenerOptions extends EventListenerOptions {
  once?: boolean
  passive?: boolean
  signal?: AbortSignalLike
}

export type EventListenerCallback = (event: Event) => void

export interface EventListenerObject {
  handleEvent(event: Event): void
}

export type EventListener = EventListenerCallback | EventListenerObject

/**
 * A structural description of the subset of the DOM `AbortSignal` interface
 * that this library depends on.
 *
 * It is intentionally a structural "like" type (rather than the DOM
 * `AbortSignal` itself) so that:
 *   - it works in builds that do not include the DOM lib (`lib: ["es2023"]`),
 *   - the *native* `AbortSignal` (from `lib.dom.d.ts`),
 *   - this library's own `AbortSignal` (see `./abort-signal`), and
 *   - any other conforming implementation
 * are all assignable to it.
 *
 * Because this project ships its own `Event` class (with a few extra internal
 * fields) that is *not* identical to the DOM `Event`, every place that would
 * otherwise be typed with `Event` is typed with `any` instead. Under `strict`,
 * function-typed members are checked (contra)variantly, and `Event` from one
 * implementation is never assignable to `Event` from another — `any` is what
 * keeps a native `AbortSignal` assignable to this interface.
 *
 * The core members (`aborted`, `addEventListener`, `removeEventListener`) are
 * required; the rest mirror the spec but are optional so that lightweight
 * custom signals remain assignable.
 */
export interface AbortSignalLike {
  /** Whether the signal has been aborted. */
  readonly aborted: boolean

  /**
   * The reason the signal was aborted, or `undefined` when it has not been
   * aborted yet. Mirrors the DOM `AbortSignal.reason` (typed `any` there).
   */
  reason?: any

  /**
   * The `abort` event handler property. Mirrors the DOM `onabort`: it accepts
   * either a plain callback or an object with a `handleEvent` method.
   */
  onabort?: ((event: any) => void) | { handleEvent(event: any): void } | null

  /** Throws the abort reason if the signal has already been aborted. */
  throwIfAborted?(): void

  /** Register a listener for the `"abort"` event. */
  addEventListener(
    type: 'abort',
    listener: (event: any) => void,
    options?: boolean | AddEventListenerOptions,
  ): void
  /** Register a listener for any event type. */
  addEventListener(
    type: string,
    listener: ((event: any) => void) | { handleEvent(event: any): void } | null,
    options?: boolean | AddEventListenerOptions,
  ): void

  /** Remove an `"abort"` listener. */
  removeEventListener(
    type: 'abort',
    listener: (event: any) => void,
    options?: boolean | EventListenerOptions,
  ): void
  /** Remove a listener for any event type. */
  removeEventListener(
    type: string,
    listener: ((event: any) => void) | { handleEvent(event: any): void } | null,
    options?: boolean | EventListenerOptions,
  ): void

  /** Dispatch an event to this target. Inherited from `EventTarget`. */
  dispatchEvent?(event: any): boolean
}

interface ListenerRecord {
  type: string
  callback: EventListener
  capture: boolean
  passive: boolean
  once: boolean
}

export class Event {
  readonly type: string
  readonly bubbles: boolean
  readonly cancelable: boolean
  readonly composed: boolean
  defaultPrevented = false
  eventPhase = 0
  target: EventTarget | null = null
  currentTarget: EventTarget | null = null
  readonly isTrusted = false
  readonly timeStamp: number

  // Internal dispatch flags.
  _stopPropagation = false
  _stopImmediatePropagation = false
  _dispatch = false

  constructor(type: string, eventInitDict: EventInit = {}) {
    this.type = type
    this.bubbles = Boolean(eventInitDict.bubbles)
    this.cancelable = Boolean(eventInitDict.cancelable)
    this.composed = Boolean(eventInitDict.composed)
    this.timeStamp = Date.now()
  }

  preventDefault(): void {
    if (this.cancelable) this.defaultPrevented = true
  }

  stopPropagation(): void {
    this._stopPropagation = true
  }

  stopImmediatePropagation(): void {
    this._stopPropagation = true
    this._stopImmediatePropagation = true
  }
}

export class EventTarget {
  #listeners: ListenerRecord[] = []

  addEventListener(
    type: string,
    callback: EventListener | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (callback == null) return
    const opts = normalizeOptions(options)
    const existing = this.#listeners.find(
      l => l.type === type && l.callback === callback && l.capture === opts.capture,
    )
    if (existing) return

    const record: ListenerRecord = {
      type,
      callback,
      capture: opts.capture,
      passive: opts.passive,
      once: opts.once,
    }
    this.#listeners.push(record)

    if (opts.signal) {
      const signal = opts.signal
      if (signal.aborted) {
        this.removeEventListener(type, callback, options)
      } else {
        signal.addEventListener('abort', () => {
          this.removeEventListener(type, callback, options)
        })
      }
    }
  }

  removeEventListener(
    type: string,
    callback: EventListener | null,
    options?: boolean | EventListenerOptions,
  ): void {
    if (callback == null) return
    const opts = normalizeOptions(options)
    const index = this.#listeners.findIndex(
      l => l.type === type && l.callback === callback && l.capture === opts.capture,
    )
    if (index !== -1) this.#listeners.splice(index, 1)
  }

  dispatchEvent(event: Event): boolean {
    if (event._dispatch) {
      throw new TypeError('The event is already being dispatched.')
    }
    event._dispatch = true
    event.target = this
    event.eventPhase = 2 // Event.AT_TARGET

    // Snapshot so listeners removed during dispatch don't shift iteration.
    const records = this.#listeners.filter(l => l.type === event.type)
    let defaultPrevented = false

    for (const record of records) {
      event.currentTarget = this
      if (record.once) {
        const idx = this.#listeners.indexOf(record)
        if (idx !== -1) this.#listeners.splice(idx, 1)
      }
      const cb =
        typeof record.callback === 'function'
          ? (record.callback as EventListenerCallback)
          : record.callback.handleEvent
      cb.call(this, event)
      if (event.defaultPrevented) defaultPrevented = true
      if (event._stopImmediatePropagation) break
    }

    event.currentTarget = null
    event.eventPhase = 0
    event._dispatch = false
    return !defaultPrevented
  }
}

function normalizeOptions(options?: boolean | EventListenerOptions): {
  capture: boolean
  once: boolean
  passive: boolean
  signal?: AbortSignalLike | null
} {
  if (typeof options === 'boolean') {
    return { capture: options, once: false, passive: false }
  }
  const o = options ?? {}
  return {
    capture: Boolean(o.capture),
    once: Boolean((o as AddEventListenerOptions).once),
    passive: Boolean((o as AddEventListenerOptions).passive),
    signal: (o as AddEventListenerOptions).signal,
  }
}

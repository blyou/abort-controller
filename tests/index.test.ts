import { afterEach, describe, expect, test, vi } from 'vitest'
import { AbortController } from '../src/abort-controller'
import { AbortSignal } from '../src/abort-signal'
import { DOMException } from '../src/dom-exception'
import { Event } from '../src/event-target'

afterEach(() => {
  vi.useRealTimers()
})

describe('AbortController construction', () => {
  test('has a signal that is not aborted initially', () => {
    const controller = new AbortController()
    expect(controller.signal).toBeInstanceOf(AbortSignal)
    expect(controller.signal.aborted).toBe(false)
    expect(controller.signal.reason).toBeUndefined()
  })

  test('each controller gets its own distinct signal', () => {
    const a = new AbortController()
    const b = new AbortController()
    expect(a.signal).not.toBe(b.signal)
  })
})

describe('AbortController.abort()', () => {
  test('aborts the signal and sets aborted to true', () => {
    const controller = new AbortController()
    controller.abort()
    expect(controller.signal.aborted).toBe(true)
  })

  test('uses a default "AbortError" DOMException when no reason is given', () => {
    const controller = new AbortController()
    controller.abort()
    const reason = controller.signal.reason
    expect(reason).toBeInstanceOf(DOMException)
    expect((reason as DOMException).name).toBe('AbortError')
  })

  test('uses the provided reason', () => {
    const controller = new AbortController()
    const myReason = new Error('custom')
    controller.abort(myReason)
    expect(controller.signal.reason).toBe(myReason)
  })

  test('is idempotent: calling abort twice does not change the reason', () => {
    const controller = new AbortController()
    const first = new Error('first')
    const second = new Error('second')
    controller.abort(first)
    controller.abort(second)
    expect(controller.signal.aborted).toBe(true)
    expect(controller.signal.reason).toBe(first)
  })

  test('fires an "abort" event with the signal as target', () => {
    const controller = new AbortController()
    let received: Event | undefined
    controller.signal.addEventListener('abort', event => {
      received = event as Event
    })
    controller.abort()
    expect(received).toBeInstanceOf(Event)
    expect(received!.type).toBe('abort')
    expect(received!.target).toBe(controller.signal)
  })

  test('fires the event only once even after repeated aborts', () => {
    const controller = new AbortController()
    let count = 0
    controller.signal.addEventListener('abort', () => {
      count++
    })
    controller.abort()
    controller.abort()
    expect(count).toBe(1)
  })

  test('invokes the onabort event handler', () => {
    const controller = new AbortController()
    let called = false
    controller.signal.onabort = () => {
      called = true
    }
    controller.abort()
    expect(called).toBe(true)
  })
})

describe('AbortSignal.throwIfAborted()', () => {
  test('throws the reason when aborted', () => {
    const controller = new AbortController()
    const reason = new Error('boom')
    controller.abort(reason)
    expect(() => controller.signal.throwIfAborted()).toThrow(reason)
  })

  test('does nothing when not aborted', () => {
    const controller = new AbortController()
    expect(() => controller.signal.throwIfAborted()).not.toThrow()
  })
})

describe('AbortSignal cannot be constructed directly', () => {
  test('new AbortSignal() throws a TypeError', () => {
    expect(() => new (AbortSignal as unknown as new () => AbortSignal)()).toThrow(TypeError)
  })
})

describe('AbortSignal.abort()', () => {
  test('returns an already-aborted signal with an AbortError by default', () => {
    const signal = AbortSignal.abort()
    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBeInstanceOf(DOMException)
    expect((signal.reason as DOMException).name).toBe('AbortError')
  })

  test('returns an already-aborted signal with the provided reason', () => {
    const reason = new Error('nope')
    const signal = AbortSignal.abort(reason)
    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBe(reason)
  })

  test('does not fire an "abort" event for a born-aborted signal', () => {
    const signal = AbortSignal.abort()
    let fired = false
    signal.addEventListener('abort', () => {
      fired = true
    })
    expect(fired).toBe(false)
  })
})

describe('AbortSignal.timeout()', () => {
  test('is not aborted before the timeout elapses', () => {
    vi.useFakeTimers()
    const signal = AbortSignal.timeout(1000)
    expect(signal.aborted).toBe(false)
    vi.advanceTimersByTime(500)
    expect(signal.aborted).toBe(false)
  })

  test('aborts with a TimeoutError after the timeout', () => {
    vi.useFakeTimers()
    const signal = AbortSignal.timeout(1000)
    let fired = false
    signal.addEventListener('abort', () => {
      fired = true
    })
    vi.advanceTimersByTime(1000)
    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBeInstanceOf(DOMException)
    expect((signal.reason as DOMException).name).toBe('TimeoutError')
    expect(fired).toBe(true)
  })
})

describe('AbortSignal.any()', () => {
  test('returns a non-aborted signal when no source is aborted', () => {
    const a = new AbortController()
    const b = new AbortController()
    const anySignal = AbortSignal.any([a.signal, b.signal])
    expect(anySignal.aborted).toBe(false)
  })

  test('returns an already-aborted signal if a source is already aborted', () => {
    const a = new AbortController()
    const reason = new Error('already')
    a.abort(reason)
    const b = new AbortController()
    const anySignal = AbortSignal.any([a.signal, b.signal])
    expect(anySignal.aborted).toBe(true)
    expect(anySignal.reason).toBe(reason)
  })

  test('aborts (with the source reason) when one of the sources aborts', () => {
    const a = new AbortController()
    const b = new AbortController()
    const anySignal = AbortSignal.any([a.signal, b.signal])
    const reason = new Error('a aborted')
    let fired = false
    anySignal.addEventListener('abort', () => {
      fired = true
    })
    a.abort(reason)
    expect(anySignal.aborted).toBe(true)
    expect(anySignal.reason).toBe(reason)
    expect(fired).toBe(true)
  })

  test('aborts as soon as ANY source aborts (even if others stay alive)', () => {
    const a = new AbortController()
    const b = new AbortController()
    const anySignal = AbortSignal.any([a.signal, b.signal])
    const reason = new Error('b aborted')
    a.abort(reason)
    expect(anySignal.aborted).toBe(true)
    expect(anySignal.reason).toBe(reason)
  })

  test('works for a single source that aborts later', () => {
    const a = new AbortController()
    const anySignal = AbortSignal.any([a.signal])
    a.abort('single')
    expect(anySignal.aborted).toBe(true)
    expect(anySignal.reason).toBe('single')
  })

  test('propagates transitively through nested any()', () => {
    const source = new AbortController()
    const inner = AbortSignal.any([source.signal])
    const outer = AbortSignal.any([inner])
    const reason = new Error('deep')
    source.abort(reason)
    expect(inner.aborted).toBe(true)
    expect(outer.aborted).toBe(true)
    expect(outer.reason).toBe(reason)
  })

  test('only the first aborting source determines the reason', () => {
    const a = new AbortController()
    const b = new AbortController()
    const anySignal = AbortSignal.any([a.signal, b.signal])
    const reasonA = new Error('a')
    const reasonB = new Error('b')
    a.abort(reasonA)
    b.abort(reasonB)
    expect(anySignal.reason).toBe(reasonA)
  })
})

describe('event listener semantics', () => {
  test('a listener added after abort does not fire (event already fired)', () => {
    const controller = new AbortController()
    controller.abort()
    let fired = false
    controller.signal.addEventListener('abort', () => {
      fired = true
    })
    expect(fired).toBe(false)
  })

  test('once listeners are removed after firing', () => {
    const controller = new AbortController()
    let count = 0
    controller.signal.addEventListener(
      'abort',
      () => {
        count++
      },
      { once: true },
    )
    controller.abort()
    // Re-aborting must not re-trigger the once listener.
    controller.abort()
    expect(count).toBe(1)
  })

  test('removeEventListener stops further notifications', () => {
    const controller = new AbortController()
    let count = 0
    const listener = () => {
      count++
    }
    controller.signal.addEventListener('abort', listener)
    controller.signal.removeEventListener('abort', listener)
    controller.abort()
    expect(count).toBe(0)
  })

  test('the addEventListener signal option removes the listener when aborted', () => {
    const controller = new AbortController()
    const guard = new AbortController()
    let count = 0
    controller.signal.addEventListener(
      'abort',
      () => {
        count++
      },
      { signal: guard.signal },
    )
    guard.abort()
    controller.abort()
    expect(count).toBe(0)
  })
})

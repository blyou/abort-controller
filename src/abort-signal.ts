import type { EventListener } from './event-target'
import { Event, EventTarget } from './event-target'
import { DOMException } from './dom-exception'

// Internal state of an AbortSignal. We deliberately avoid `#` private fields so
// that the module-level helper functions below can read/write this state; the
// WeakMaps keep it private from outside the module.
//
// Per the WHATWG DOM Standard, an AbortSignal is "aborted" precisely when its
// abort reason is not `undefined`. We therefore store the reason (initially
// `undefined`) and derive `aborted` from it.
const reasonMap = new WeakMap<AbortSignal, unknown>()
const algorithmsMap = new WeakMap<AbortSignal, Set<() => void>>()
const dependentMap = new WeakMap<AbortSignal, Set<AbortSignal>>()

// Token guarding against `new AbortSignal()` from user code.
const INTERNAL = Symbol('AbortSignal.internal')

function createSignal(): AbortSignal {
  const signal = new AbortSignal(INTERNAL)
  reasonMap.set(signal, undefined)
  algorithmsMap.set(signal, new Set())
  dependentMap.set(signal, new Set())
  return signal
}

function addDependentSignal(signal: AbortSignal, dependent: AbortSignal): void {
  const dependents = dependentMap.get(signal)
  if (dependents) dependents.add(dependent)
}

// To run the abort steps for an AbortSignal signal:
//   1. For each algorithm of signal's abort algorithms: run algorithm.
//   2. Empty signal's abort algorithms.
//   3. Fire an event named "abort" at signal.
function runAbortSteps(signal: AbortSignal): void {
  const algorithms = algorithmsMap.get(signal)
  if (algorithms) {
    for (const algorithm of algorithms) algorithm()
    algorithms.clear()
  }
  signal.dispatchEvent(new Event('abort'))
}

// To signal abort, given an AbortSignal signal and an optional reason:
//   1. If signal is aborted, then return.
//   2. Set signal's abort reason to reason if given; otherwise to a new
//      "AbortError" DOMException.
//   3. Run the abort steps for signal.
//   4. Recurse into each of signal's dependent signals, propagating the same
//      reason. Each dependent runs its own abort steps and further propagates
//      to its own dependents (so e.g. AbortSignal.any([any([...])]) works).
function signalAbort(signal: AbortSignal, reason?: unknown): void {
  if (reasonMap.get(signal) !== undefined) return

  const r =
    reason === undefined ? new DOMException('The operation was aborted.', 'AbortError') : reason
  reasonMap.set(signal, r)

  const dependents = dependentMap.get(signal)
  const toAbort: AbortSignal[] = dependents ? [...dependents] : []

  runAbortSteps(signal)
  for (const dependent of toAbort) signalAbort(dependent, r)
}

export class AbortSignal extends EventTarget {
  // AbortSignal has no public constructor; constructing it directly throws.
  constructor(token?: symbol) {
    super()
    if (token !== INTERNAL) {
      throw new TypeError('Illegal constructor: AbortSignal is not a constructor')
    }
  }

  get aborted(): boolean {
    return reasonMap.get(this) !== undefined
  }

  get reason(): unknown {
    return reasonMap.get(this)
  }

  throwIfAborted(): void {
    const reason = reasonMap.get(this)
    if (reason !== undefined) throw reason
  }

  private _onabort: EventListener | null = null

  get onabort(): EventListener | null {
    return this._onabort
  }

  set onabort(value: EventListener | null) {
    if (this._onabort) super.removeEventListener('abort', this._onabort)
    this._onabort = value
    if (value) super.addEventListener('abort', value)
  }

  // To create a new AbortSignal: a fresh, non-aborted signal.
  static abort(reason?: unknown): AbortSignal {
    const signal = createSignal()
    reasonMap.set(
      signal,
      reason === undefined ? new DOMException('The operation was aborted.', 'AbortError') : reason,
    )
    return signal
  }

  static timeout(milliseconds: number): AbortSignal {
    const signal = createSignal()
    setTimeout(() => {
      signalAbort(signal, new DOMException('The operation was timed out.', 'TimeoutError'))
    }, milliseconds)
    return signal
  }

  // To create a dependent abort signal from signals:
  //   1. Let resultSignal be a new AbortSignal.
  //   2. For each signal of signals:
  //        - if signal is aborted, set resultSignal's reason to signal's reason;
  //        - otherwise add resultSignal as a dependent signal of signal.
  //   3. Return resultSignal.
  static any(signals: AbortSignal[]): AbortSignal {
    const resultSignal = createSignal()
    for (const signal of signals) {
      if (reasonMap.get(signal) !== undefined) {
        reasonMap.set(resultSignal, reasonMap.get(signal))
      } else {
        addDependentSignal(signal, resultSignal)
      }
    }
    return resultSignal
  }
}

// Internal helpers used by AbortController. Not part of the public API.
export { createSignal, signalAbort }

import type { AbortSignal } from './abort-signal'
import { createSignal, signalAbort } from './abort-signal'

// https://dom.spec.whatwg.org/#interface-abortcontroller
export class AbortController {
  #signal: AbortSignal

  constructor() {
    this.#signal = createSignal()
  }

  get signal(): AbortSignal {
    return this.#signal
  }

  // The abort(reason) method steps are to signal abort on this with reason if
  // it is given (otherwise a new "AbortError" DOMException is used).
  abort(reason?: unknown): void {
    signalAbort(this.#signal, reason)
  }
}

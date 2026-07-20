// Minimal DOMException implementation. WHATWG AbortSignal uses the
// "AbortError" and "TimeoutError" names, both of which map to a DOMException
// whose `name` identifies the error type.

export class DOMException extends Error {
  readonly name: string

  constructor(message = '', name = 'Error') {
    super(message)
    this.name = name
    // Ensure `instanceof DOMException` works after extending a built-in.
    Object.setPrototypeOf(this, DOMException.prototype)
  }
}

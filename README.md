# abort-controller

A WHATWG [DOM Standard](https://dom.spec.whatwg.org/#interface-abortcontroller) compliant implementation of `AbortController` and `AbortSignal`, written in TypeScript with **zero runtime dependencies**.

Because the project's TypeScript target is `es2023` (no DOM lib), this package also ships a minimal, self-contained `EventTarget`, `Event`, and `DOMException` so it runs correctly in any JavaScript environment — Node, browsers, workers, or edge runtimes.

## Features

- `AbortController` with `signal` and `abort(reason?)`
- `AbortSignal` with `aborted`, `reason`, `throwIfAborted()`, and the `onabort` event handler
- `AbortSignal.abort(reason?)` — a pre-aborted signal
- `AbortSignal.timeout(milliseconds)` — a signal that aborts after a delay
- `AbortSignal.any(signals)` — a signal that aborts when any of the given signals aborts (transitively)
- Correct propagation of abort through dependent signals
- `EventTarget` / `Event` semantics: `addEventListener` / `removeEventListener` / `dispatchEvent`, including the `once`, `signal`, and `capture` options

## Installation

```bash
npm install abort-controller
```

## Usage

```ts
import { AbortController, AbortSignal } from 'abort-controller'

const controller = new AbortController()

controller.signal.addEventListener('abort', () => {
  console.log('aborted:', controller.signal.reason)
})

controller.abort(new Error('cancelled'))
// → aborted: Error: cancelled
```

### `AbortSignal.timeout`

```ts
const signal = AbortSignal.timeout(1000)
signal.addEventListener('abort', () => {
  console.log(signal.reason.name) // "TimeoutError"
})
```

### `AbortSignal.any`

```ts
const a = new AbortController()
const b = new AbortController()
const signal = AbortSignal.any([a.signal, b.signal])

b.abort() // signal aborts because ANY source aborted
```

### `AbortSignal.abort`

```ts
const signal = AbortSignal.abort() // already aborted, reason is an "AbortError"
```

## Development

```bash
npm install        # install dependencies
npm run test       # run the unit tests (vitest)
npm run typecheck  # type-check with tsc --noEmit
npm run lint       # lint with eslint
npm run build      # build the library with tsdown
```

## Specification

This implementation follows the [WHATWG DOM Standard — AbortController](https://dom.spec.whatwg.org/#interface-abortcontroller) and [AbortSignal](https://dom.spec.whatwg.org/#interface-abortsignal) interfaces.

## License

[MIT](./LICENSE)

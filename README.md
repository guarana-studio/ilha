# ilha

A tiny, framework-free island architecture library. Define interactive islands with typed props, reactive state, async-derived data, and slots — render them as plain HTML strings on the server, mount them on the client.

Built on [alien-signals](https://github.com/stackblitz/alien-signals) for fine-grained reactivity. Supports any [Standard Schema](https://standardschema.dev) validator (Zod, Valibot, ArkType, …).

## Install

```bash
bun add ilha
# or
npm install ilha
```

## Quick start

```ts
import ilha, { html, mount } from "ilha";
import { z } from "zod";

const counter = ilha
  .input(z.object({ count: z.number().default(0) }))
  .state("count", ({ count }) => count)
  .on("[data-inc]@click", ({ state }) => state.count(state.count() + 1))
  .render(
    ({ state }) => html`
      <p>${state.count}</p>
      <button data-inc>+</button>
    `,
  );

// SSR — sync islands return a string immediately
counter({ count: 5 }); // → "<p>5</p><button data-inc>+</button>"

// Client — mount onto a DOM element
mount({ counter });
```

```html
<div data-ilha="counter" data-props='{"count": 5}'></div>
```

## Builder API

Every island is built with a chainable builder. All methods return a new builder — nothing is mutated.

| Method                          | Description                                                        |
| ------------------------------- | ------------------------------------------------------------------ |
| `.input(schema)`                | Declare typed props via any Standard Schema validator              |
| `.state(key, init)`             | Add a reactive signal; `init` can be a value or `(input) => value` |
| `.derived(key, fn)`             | Derive reactive data from state/input — sync or async              |
| `.bind(selector, stateKey)`     | Two-way bind a form element to a state key                         |
| `.on(selector@event, handler)`  | Attach a delegated event listener                                  |
| `.effect(fn)`                   | Run a reactive side effect on mount; return a cleanup function     |
| `.slot(name, island)`           | Nest a child island                                                |
| `.transition({ enter, leave })` | Async-safe mount/unmount animations                                |
| `.render(fn)`                   | Finalize — returns an `Island`                                     |

## Events

The `.on()` selector string uses `selector@event` syntax with optional modifiers:

```ts
.on("[data-btn]@click", handler)                   // delegated click
.on("@click", handler)                             // bind to root element
.on("[data-btn]@click:once", handler)              // fires once
.on("[data-btn]@click:passive:capture", handler)
```

## Two-way binding

`.bind(selector, stateKey)` creates a two-way link between a form element and a state key — no event handler boilerplate needed:

```ts
const form = ilha
  .state("email", "")
  .state("subscribe", false)
  .bind("[data-email]", "email")
  .bind("[data-sub]", "subscribe")
  .render(
    ({ state }) => html`
      <input data-email value="${state.email()}" />
      <input type="checkbox" data-sub ${state.subscribe() ? "checked" : ""} />
      <p>Email: ${state.email()}, Subscribe: ${state.subscribe()}</p>
    `,
  );
```

Both directions are handled automatically:

- **DOM → state** — when the user types or toggles, the signal updates immediately
- **state → DOM** — when the signal changes programmatically, the element's value/checked syncs

The DOM value is automatically coerced to match the type of the state key — no manual conversion needed:

```ts
.state("count", 0)
.bind("[data-count]", "count") // input string coerced to number automatically
```

If the input is cleared and the state is a number, the value falls back to `0` rather than `NaN`.

Element types and their behaviour:

| Element                  | Event              | Property         |
| ------------------------ | ------------------ | ---------------- |
| `input` (text, email, …) | `input`            | `.value`         |
| `input[type=number]`     | `input`            | `.valueAsNumber` |
| `input[type=checkbox]`   | `change`           | `.checked`       |
| `select`, `textarea`     | `change` / `input` | `.value`         |

> **Note:** `input[type=radio]` groups are not currently supported by `.bind()`.

`.bind()` is a no-op during SSR — it only activates on mount.

### Stale element references

Every time bound state changes, the island re-renders and replaces `el.innerHTML`. Any element reference captured before a state change becomes stale. Always re-query from `el` after dispatching events or triggering state changes:

```ts
// ✗ — reference captured before re-render, may be a detached element
const input = el.querySelector("[data-q]")!;
input.dispatchEvent(new Event("input"));
input.value; // stale

// ✓ — always re-query after a state-changing interaction
el.querySelector<HTMLInputElement>("[data-q]")!.dispatchEvent(new Event("input"));
el.querySelector<HTMLInputElement>("[data-q]")!.value; // fresh
```

## Derived data

`.derived()` computes values from state or input. It can be sync or async.

### Sync derived

Sync derived is a pure computation — `value` is available immediately with no loading state, and updates synchronously whenever its dependencies change:

```ts
const island = ilha
  .state("count", 0)
  .derived("doubled", ({ state }) => state.count() * 2)
  .on("[data-inc]@click", ({ state }) => state.count(state.count() + 1))
  .render(
    ({ state, derived }) => html`
      <p>${state.count()} × 2 = ${derived.doubled.value}</p>
      <button data-inc>+</button>
    `,
  );
```

### Async derived

Async derived wraps the result in a `{ loading, value, error }` envelope. Previous `value` is preserved while re-fetching (stale-while-revalidate). Each run gets an `AbortSignal` — stale requests are cancelled automatically when dependencies change:

```ts
const pokemon = ilha
  .state("name", "charizard")
  .derived("data", async ({ state, signal }) => {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${state.name()}`, { signal });
    return res.json() as Promise<{ name: string }>;
  })
  .render(({ derived }) => {
    const { loading, value, error } = derived.data;
    if (loading) return `<p>Loading${value ? ` (was: ${value.name})` : ""}…</p>`;
    if (error) return `<p>Error: ${error.message}</p>`;
    return `<p>${value!.name}</p>`;
  });
```

### Async SSR

On the server, islands with async derived values can be used in two ways:

- **`await island()`** — resolves all async derived values before rendering final HTML
- **`island.toString()`** or implicit template interpolation — stays synchronous and uses the loading fallback for async derived values

```ts
const page = ilha
  .derived("user", async () => ({ name: "Ada" }))
  .render(({ derived }) => {
    if (derived.user.loading) return "<p>Loading…</p>";
    if (derived.user.error) return `<p>Error: ${derived.user.error.message}</p>`;
    return `<p>${derived.user.value!.name}</p>`;
  });

// async SSR
await page(); // → "<p>Ada</p>"

// sync fallback
page.toString(); // → "<p>Loading…</p>"
`${page}`; // → "<p>Loading…</p>"
```

This keeps SSR flexible:

- sync islands remain zero-overhead and return a plain string
- async islands can be awaited when the server runtime supports async rendering
- template literals remain safe and synchronous

### Derived envelope

Every `.derived()` value — sync or async — is accessed as:

```ts
derived.key.loading; // boolean — always false for sync
derived.key.value; // T | undefined
derived.key.error; // Error | undefined — always undefined for sync
```

### Derived context

The `fn` passed to `.derived()` receives:

```ts
({ state, input, signal }) => ...
//                ^^^^^^  AbortSignal — only meaningful for async
```

## Slots

Compose islands by nesting them as slots:

```ts
const app = ilha
  .slot("counter", counter)
  .render(
    ({ slots }) => html`
      <div>${slots.counter} // default props ${slots.counter({ count: 10 })} // with props</div>
    `,
  );
```

Or declaratively in HTML:

```html
<div data-ilha-slot="counter" data-props='{"count": 10}'></div>
```

## Shared state

`context()` creates a module-level signal shared across all islands. The same key always returns the same signal — the initial value from the first registration wins.

```ts
import { context } from "ilha";

const theme = context("theme", "light");

theme(); // → "light"
theme("dark"); // updates all subscribed islands
```

> **Note:** Context signals are global for the lifetime of the page. There is no per-instance scoping or cleanup.

## Mounting

```ts
// Auto-discover all [data-ilha] elements
mount({ counter, app });
mount({ counter }, { root: document.querySelector("#app") });
mount({ counter }, { lazy: true }); // IntersectionObserver
mount({ counter }, { hydrate: true }); // preserve SSR HTML

// Mount a single island by selector or element
import { from } from "ilha";
from("#my-counter", counter, { count: 5 });
```

## SSR hydration

Set `data-ilha-state` on the element to restore serialised state client-side without re-running validation:

```html
<div data-ilha="counter" data-ilha-state='{"count": 42}'>
  <p>42</p>
  <button data-inc>+</button>
</div>
```

## `html` template tag

Safe HTML template helper — escapes all interpolations by default:

```ts
import { html, raw } from "ilha";

html`<p>${userInput}</p>`; // escaped
html`<p>${raw("<b>bold</b>")}</p>`; // explicit raw passthrough
html`<p>${state.count}</p>`; // signal accessor — calls getter + escapes
```

## Known limitations

- `input[type=radio]` groups are not supported by `.bind()`
- `context()` signals are global with no scoping or cleanup mechanism
- Implicit string interpolation of islands (`${island}`) is always synchronous, so async derived values fall back to `loading`

## License

MIT

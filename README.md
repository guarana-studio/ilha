# ilha

A tiny, framework-free island architecture library. Define interactive islands with typed props, reactive state, and slots — render them as plain HTML strings on the server, mount them on the client.

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

// SSR — returns an HTML string
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
| `.on(selector@event, handler)`  | Attach a delegated event listener                                  |
| `.effect(fn)`                   | Run a reactive side effect on mount; return a cleanup function     |
| `.slot(name, island)`           | Nest a child island                                                |
| `.transition({ enter, leave })` | Async-safe mount/unmount animations                                |
| `.render(fn)`                   | Finalize — returns an `Island`                                     |

## Events

The `.on()` selector string uses `selector@event` syntax with optional modifiers:

```ts
.on("[data-btn]@click", handler)          // delegated click
.on("@click", handler)                    // bind to root element
.on("[data-btn]@click:once", handler)     // fires once
.on("[data-btn]@click:passive:capture", handler)
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

```ts
import { context } from "ilha";

const theme = context("theme", "light"); // module-level shared signal

// read and write from any island
theme(); // → "light"
theme("dark"); // updates all subscribers
```

## Mounting

```ts
// Auto-discover all [data-ilha] elements
mount({ counter, app });
mount({ counter }, { root: document.querySelector("#app") });
mount({ counter }, { lazy: true }); // IntersectionObserver
mount({ counter }, { hydrate: true }); // preserve SSR HTML

// Mount a single island by selector
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

## License

MIT

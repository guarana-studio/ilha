---
title: Ilha
description: Tiny, framework-free island architecture library
logo:
  src: PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDI0IiBoZWlnaHQ9IjEwMjQiIGZpbGw9Im5vbmUiPjxkZWZzPjxjbGlwUGF0aCBpZD0iYSIgY2xhc3M9ImZyYW1lLWNsaXAgZnJhbWUtY2xpcC1kZWYiPjxyZWN0IHdpZHRoPSIxMDI0IiBoZWlnaHQ9IjEwMjQiIHJ4PSIwIiByeT0iMCIvPjwvY2xpcFBhdGg+PC9kZWZzPjxnIGNsYXNzPSJmcmFtZS1jb250YWluZXItd3JhcHBlciI+PGcgY2xhc3M9ImZyYW1lLWNvbnRhaW5lci1ibHVyIj48ZyBjbGFzcz0iZnJhbWUtY29udGFpbmVyLXNoYWRvd3MiIGNsaXAtcGF0aD0idXJsKCNhKSI+PGcgY2xhc3M9ImZpbGxzIj48cmVjdCB3aWR0aD0iMTAyNCIgaGVpZ2h0PSIxMDI0IiBjbGFzcz0iZnJhbWUtYmFja2dyb3VuZCIgcng9IjAiIHJ5PSIwIi8+PC9nPjxnIGNsYXNzPSJmcmFtZS1jaGlsZHJlbiI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJiIiB4MT0iMCIgeDI9IjEiIHkxPSIuNSIgeTI9Ii41Ij48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMyZDYxZmYiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiMyOGJmZmYiLz48L2xpbmVhckdyYWRpZW50PjxwYXR0ZXJuIGlkPSJjIiB3aWR0aD0iNTY0LjkiIGhlaWdodD0iNTY0LjkiIHg9Ijg4LjQiIHk9IjIyOS42IiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNMCAwaDU2NXY1NjVIMHoiIHN0eWxlPSJmaWxsOnVybCgjYikiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSI1NjQuOSIgaGVpZ2h0PSI1NjQuOSIgeD0iODguNCIgeT0iMjI5LjYiIGZpbGw9InVybCgjYykiIGNsYXNzPSJmaWxscyIgcng9IjgwIiByeT0iODAiIHRyYW5zZm9ybT0icm90YXRlKDQ1IDM3MSA1MTIpIi8+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJkIiB4MT0iMCIgeDI9IjEiIHkxPSIuNSIgeTI9Ii41Ij48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMyOGJmZmYiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiMyZDYxZmYiLz48L2xpbmVhckdyYWRpZW50PjxwYXR0ZXJuIGlkPSJlIiB3aWR0aD0iNTY0LjkiIGhlaWdodD0iNTY0LjkiIHg9IjM3MC44IiB5PSIyMjkuNiIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTTAgMGg1NjV2NTY1SDB6IiBzdHlsZT0iZmlsbDp1cmwoI2QpIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iNTY0LjkiIGhlaWdodD0iNTY0LjkiIHg9IjM3MC44IiB5PSIyMjkuNiIgZmlsbD0idXJsKCNlKSIgY2xhc3M9ImZpbGxzIiByeD0iODAiIHJ5PSI4MCIgdHJhbnNmb3JtPSJyb3RhdGUoNDUgNjUzIDUxMikiLz48L2c+PC9nPjwvZz48L2c+PC9zdmc+
footer:
  text: Copyright © %YEAR% ilha
---

# Ilha

## Overview

ilha is a tiny, framework-free island architecture library. Islands are self-contained interactive components that:

- Render as plain HTML strings on the server (SSR)
- Mount reactively on the client with fine-grained signal-based updates
- Compose via typed props, slots, shared context, and async-derived data

ilha is built on [alien-signals](https://github.com/stackblitz/alien-signals) for reactivity and accepts any [Standard Schema](https://standardschema.dev) validator (Zod, Valibot, ArkType, …) for prop validation.

---

## Installation

```bash
bun add ilha
# or
npm install ilha
```

---

## Core concepts

An island is built with a **chainable builder**. Each method returns a new builder — nothing is mutated. The chain is finalised with `.render()`, which returns a callable `Island`.

```ts
import ilha, { html, mount } from "ilha";
import { z } from "zod";

const counter = ilha
  .input(z.object({ count: z.number().default(0) }))
  .state("count", ({ count }) => count)
  .derived("doubled", ({ state }) => state.count() * 2)
  .on("[data-inc]@click", ({ state }) => state.count(state.count() + 1))
  .render(
    ({ state, derived }) => html`
      <p>Count: ${state.count}</p>
      <p>Doubled: ${derived.doubled.value}</p>
      <button data-inc>+</button>
    `,
  );

// SSR
counter({ count: 5 }); // → "<p>Count: 5</p><p>Doubled: 10</p><button data-inc>+</button>"
// sync here because this island has no async derived values

// Client
mount({ counter });
```

```html
<div data-ilha="counter" data-props='{"count": 5}'></div>
```

---

## Builder API

### ilha (root builder)

The default export is the root builder. It can be used directly without `.input()` if no typed props are needed:

```ts
import ilha from "ilha";

const greeting = ilha.state("name", "world").render(({ state }) => `<p>Hello, ${state.name()}</p>`);
```

All builder methods are chainable and immutable — each call returns a new builder instance.

---

### .input()

```ts
.input(schema: StandardSchemaV1): Builder
```

Declares typed, validated props for the island using any [Standard Schema](https://standardschema.dev) compatible validator. Validation runs on every SSR call and every client mount.

```ts
import { z } from "zod";

const island = ilha
  .input(
    z.object({
      title: z.string().default("Untitled"),
      count: z.number().default(0),
    }),
  )
  .render(({ input }) => `<h1>${input.title}</h1><p>${input.count}</p>`);

island({ title: "Hello", count: 3 }); // → "<h1>Hello</h1><p>3</p>"
island(); // → "<h1>Untitled</h1><p>0</p>"
```

**Throws** `[ilha] Validation failed` if props fail schema validation.

**Async schemas** are not supported — validation must be synchronous.

`input` is available in `.state()` init functions, `.derived()`, `.effect()`, `.on()` handlers, and `.render()`.

---

### .state()

```ts
.state(key: string, init: Value | (input) => Value): Builder
```

Adds a reactive signal to the island. `init` can be a plain value or a function that receives the validated `input` and returns the initial value.

```ts
ilha
  .input(z.object({ count: z.number().default(0) }))
  .state("count", ({ count }) => count) // derived from input
  .state("step", 1) // plain value
  .render(({ state }) => `<p>${state.count()} (step: ${state.step()})</p>`);
```

State is accessed in `.render()` and handlers as a **signal accessor** — call it with no arguments to read, call it with a value to write:

```ts
state.count(); // → current value
state.count(5); // → sets to 5, triggers re-render
```

During SSR, state accessors are read-only plain functions — writes are silently ignored and no effects run.

Multiple `.state()` calls can be chained:

```ts
ilha.state("a", 0).state("b", "hello").state("active", false);
```

---

### .derived()

```ts
.derived(key: string, fn: (ctx) => Value | Promise<Value>): Builder
```

Derives a value from state or input. The function can be **sync** or **async**.

#### Context

```ts
fn({ state, input, signal });
```

| Property | Type          | Description                                     |
| -------- | ------------- | ----------------------------------------------- |
| `state`  | `IslandState` | Reactive state accessors                        |
| `input`  | `TInput`      | Validated input props                           |
| `signal` | `AbortSignal` | Cancelled when dependencies change (async only) |

#### Sync derived

Value is computed immediately, `loading` is always `false`. Re-runs synchronously when any accessed state changes.

```ts
ilha
  .state("count", 0)
  .derived("doubled", ({ state }) => state.count() * 2)
  .render(({ state, derived }) => `<p>${state.count()} × 2 = ${derived.doubled.value}</p>`);
```

During SSR, sync derived resolves immediately with the correct value.

#### Async derived

Result is wrapped in a `{ loading, value, error }` envelope. Stale requests are aborted automatically via the `AbortSignal` when dependencies change. The previous `value` is preserved while re-fetching.

```ts
ilha
  .state("query", "")
  .derived("results", async ({ state, signal }) => {
    const res = await fetch(`/api/search?q=${state.query()}`, { signal });
    return res.json();
  })
  .render(({ derived }) => {
    const { loading, value, error } = derived.results;
    if (loading) return `<p>Loading${value ? " (updating…)" : ""}…</p>`;
    if (error) return `<p>Error: ${error.message}</p>`;
    return `<ul>${value.map((r: string) => `<li>${r}</li>`).join("")}</ul>`;
  });
```

During SSR, async derived supports two modes:

- `await island()` resolves async derived before producing the final HTML
- `island.toString()` and implicit string interpolation stay synchronous, so async derived remains in its loading state

This lets you choose between async SSR and a synchronous loading fallback depending on how you render the island.

#### Derived envelope

Every `.derived()` key is accessible as:

```ts
derived.key.loading; // boolean — always false for sync
derived.key.value; // T | undefined
derived.key.error; // Error | undefined — always undefined for sync
```

#### Multiple derived keys

```ts
ilha
  .state("n", 4)
  .derived("square", ({ state }) => state.n() ** 2)
  .derived("label", async ({ state }) => fetchLabel(state.n()))
  .render(
    ({ derived }) =>
      `<p>${derived.square.value} — ${derived.label.loading ? "…" : derived.label.value}</p>`,
  );
```

---

### .bind()

```ts
.bind(selector: string, stateKey: string): Builder
```

Creates a **two-way binding** between a form element and a state key. No event handler boilerplate needed.

```ts
ilha
  .state("email", "")
  .state("age", 0)
  .state("subscribed", false)
  .bind("[data-email]", "email")
  .bind("[data-age]", "age")
  .bind("[data-sub]", "subscribed")
  .render(
    ({ state }) => html`
      <input data-email value="${state.email()}" />
      <input type="number" data-age value="${state.age()}" />
      <input type="checkbox" data-sub ${state.subscribed() ? "checked" : ""} />
    `,
  );
```

#### Directions

- **DOM → state** — user interaction updates the signal immediately
- **state → DOM** — programmatic signal writes sync back to the element's property

#### Type coercion

The DOM value is automatically coerced to match the type of the current state value. If the state is a `number` and the input is cleared, the value falls back to `0` rather than `NaN`.

```ts
.state("count", 0)
.bind("[data-count]", "count") // "42" from DOM → 42 in state automatically
```

#### Supported elements

| Element                  | Listens on | Reads / writes   |
| ------------------------ | ---------- | ---------------- |
| `input` (text, email, …) | `input`    | `.value`         |
| `input[type=number]`     | `input`    | `.valueAsNumber` |
| `input[type=checkbox]`   | `change`   | `.checked`       |
| `select`                 | `change`   | `.value`         |
| `textarea`               | `input`    | `.value`         |

> `input[type=radio]` groups are not currently supported.

#### SSR behaviour

`.bind()` is a complete no-op during SSR. It only activates on mount.

#### Stale element references

Every state change triggers a re-render which replaces `el.innerHTML`. Any element reference captured before a state change is a detached element. Always re-query from the root `el` after interactions:

```ts
// ✗ stale — captured before re-render
const input = el.querySelector("[data-q]")!;
input.dispatchEvent(new Event("input"));
input.value; // detached element

// ✓ always re-query
el.querySelector<HTMLInputElement>("[data-q]")!.dispatchEvent(new Event("input"));
el.querySelector<HTMLInputElement>("[data-q]")!.value; // live element
```

---

### .on()

```ts
.on(selectorAtEvent: string, handler: (ctx) => void | Promise<void>): Builder
```

Attaches a delegated DOM event listener. The selector and event are combined in a single string using `@` as separator.

#### Syntax

```txt
[css-selector]@[event-type][:modifier]*
```

```ts
.on("[data-btn]@click", handler) // delegated to matching child
.on("@click", handler) // bound to the island root element
.on("[data-btn]@click:once", handler) // fires once then detaches
.on("[data-btn]@submit:passive", handler)
.on("[data-btn]@scroll:passive:capture", handler)
```

#### Modifiers

| Modifier   | Description                                       |
| ---------- | ------------------------------------------------- |
| `:once`    | Handler fires once, then is automatically removed |
| `:capture` | Uses capture phase                                |
| `:passive` | Marks listener as passive                         |

Modifiers can be combined in any order after the event type.

#### Handler context

```ts
.on("[data-btn]@click", ({ state, input, el, event }) => {
  state.count(state.count() + 1);
  event.preventDefault();
});
```

| Property | Type          | Description                   |
| -------- | ------------- | ----------------------------- |
| `state`  | `IslandState` | Reactive state accessors      |
| `input`  | `TInput`      | Validated input props         |
| `el`     | `Element`     | The island's root DOM element |
| `event`  | `Event`       | The native DOM event          |

Async handlers are supported — errors are caught and logged.

#### SSR behaviour

`.on()` is a no-op during SSR.

---

### .effect()

```ts
.effect(fn: (ctx) => (() => void) | void): Builder
```

Runs a reactive side effect on mount. The function is re-run whenever any state it reads changes. Optionally returns a cleanup function.

```ts
ilha
  .state("count", 0)
  .effect(({ state, el }) => {
    document.title = `Count: ${state.count()}`;
    return () => {
      document.title = ""; // cleanup on unmount or before re-run
    };
  })
  .render(({ state }) => `<p>${state.count()}</p>`);
```

#### Effect context

| Property | Type          | Description                   |
| -------- | ------------- | ----------------------------- |
| `state`  | `IslandState` | Reactive state accessors      |
| `input`  | `TInput`      | Validated input props         |
| `el`     | `Element`     | The island's root DOM element |

#### Cleanup

The returned cleanup function is called:

- Before the effect re-runs (when tracked state changes)
- On island unmount

#### SSR behaviour

`.effect()` is a no-op during SSR.

---

### .slot()

```ts
.slot(name: string, island: Island): Builder
```

Registers a child island as a named slot. Slots allow composition — a parent island can embed child islands that have their own independent reactive state.

```ts
const badge = ilha.state("label", "hello").render(({ state }) => `<span>${state.label()}</span>`);

const card = ilha.slot("badge", badge).render(({ slots }) => `<div>${slots.badge}</div>`);
```

#### Rendering slots

Inside `.render()`, `slots` is a proxy where each key is a `SlotAccessor`. A slot can be rendered with or without props:

```ts
slots.badge; // renders with child's defaults
slots.badge({ label: "hi" }); // renders with props
```

In a template literal or `html` tag, `slots.badge` calls `.toString()` automatically:

```ts
html`<div>${slots.badge}</div>`;
// or
`<div>${slots.badge}</div>`;
```

#### Client behaviour

On the client, the parent renders a placeholder `<div data-ilha-slot="name">` in place of each slot. The child island is then mounted onto that placeholder. The placeholder element is preserved across parent re-renders — the child's state and lifecycle are never interrupted by parent updates.

Unmounting a parent cascades to all child slots.

#### Slot props via HTML

Slots can also receive props declaratively in markup:

```html
<div data-ilha-slot="badge" data-props='{"label": "world"}'></div>
```

#### SSR behaviour

During SSR, slots render inline using the child island's synchronous rendering path (`toString()`). This means async derived values inside child slots stay in their loading state unless the child is rendered directly with `await childIsland(...)`.

---

### .transition()

```ts
.transition({ enter?, leave? }): Builder
```

Registers mount and unmount lifecycle hooks. Both can be async — `leave` is awaited before teardown begins.

```ts
ilha
  .transition({
    enter: (el) => {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    },
    leave: (el) =>
      new Promise<void>((resolve) => {
        const anim = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
        anim.onfinish = () => resolve();
      }),
  })
  .render(() => `<p>Hello</p>`);
```

#### Hooks

| Hook    | Signature                          | Description                                              |
| ------- | ---------------------------------- | -------------------------------------------------------- |
| `enter` | `(el: Element) => void \| Promise` | Called immediately after initial render on mount         |
| `leave` | `(el: Element) => void \| Promise` | Called on unmount; teardown waits for promise to resolve |

#### SSR behaviour

`.transition()` is a no-op during SSR.

---

### .render()

```ts
.render(fn: (ctx) => string): Island
```

The render function itself must return a plain HTML string.

The resulting island can be rendered in two SSR modes:

- Sync: `island.toString()` or implicit string interpolation
- Async: `await island(props)` when async derived values are present

```ts
const island = ilha
  .state("x", 0)
  .render(({ state, derived, input, slots }) => `<p>${state.x()}</p>`);
```

#### Render context

| Property  | Type            | Description               |
| --------- | --------------- | ------------------------- |
| `state`   | `IslandState`   | Reactive signal accessors |
| `derived` | `IslandDerived` | Derived value envelopes   |
| `input`   | `TInput`        | Validated input props     |
| `slots`   | `SlotsProxy`    | Named slot accessors      |

The render function must return a plain HTML string. It is called:

- On SSR — once for sync rendering, or after async derived values resolve when using `await island(...)`
- On client — once on initial mount, then again whenever any accessed signal changes

---

## Island interface

`.render()` returns an `Island`, which is a callable function with two additional methods:

```ts
interface Island<TInput, TStateMap> {
  (props?: Partial<TInput>): string | Promise<string>;
  toString(props?: Partial<TInput>): string;
  mount(el: Element, props?: Partial<TInput>): () => void;
}
```

- If all derived values are synchronous, `island(props)` returns a string
- If any derived value is async, `island(props)` returns a Promise that resolves to the final HTML
- `toString()` is always synchronous

### Calling the island (SSR)

```ts
island(); // string if all derived values are sync, otherwise Promise<string>
await island({ count: 5 }); // safe for both
`<div>${island}</div>`; // implicit toString() with defaults
island.toString({ count: 3 }); // always sync
```

### Mounting

```ts
const unmount = island.mount(el, { count: 5 });

// later
unmount(); // stops effects, detaches listeners, runs leave transition
```

---

## Mounting

### mount()

```ts
import { mount } from "ilha";

mount(registry, options?): MountResult
```

Auto-discovers all `[data-ilha]` elements in the DOM and mounts the matching island from the registry.

```ts
mount({ counter, form, app });
```

#### Options

| Option    | Type      | Default         | Description                                                 |
| --------- | --------- | --------------- | ----------------------------------------------------------- |
| `root`    | `Element` | `document.body` | Scope discovery to a subtree                                |
| `hydrate` | `boolean` | `false`         | Preserve existing SSR HTML until first render               |
| `lazy`    | `boolean` | `false`         | Mount when element enters viewport (`IntersectionObserver`) |

```ts
mount({ counter }, { root: document.querySelector("#app") });
mount({ counter }, { hydrate: true });
mount({ counter }, { lazy: true });
```

#### HTML attributes

```html
<div data-ilha="counter" data-props='{"count": 5}' data-ilha-state='{"count": 42}'></div>
```

| Attribute         | Description                                                                |
| ----------------- | -------------------------------------------------------------------------- |
| `data-ilha`       | Island name — must match a key in the registry                             |
| `data-props`      | JSON props passed to the island                                            |
| `data-ilha-state` | Serialised state snapshot — takes priority over `data-props` on the client |

#### Return value

```ts
const { unmount } = mount({ counter });
unmount(); // tears down all discovered islands
```

---

### from()

```ts
import { from } from "ilha";

from(selector: string | Element, island: Island, props?): (() => void) | null
```

Mounts a single island onto a specific element. Returns the unmount function, or `null` if the selector matched nothing.

```ts
const unmountA = from("#my-counter", counter, { count: 5 });
const appEl = document.querySelector("#app");
const unmountB = appEl ? from(appEl, app) : null;
```

---

## Shared state

### context()

```ts
import { context } from "ilha";

context(key: string, initial: T): ContextSignal<T>
```

Creates or retrieves a module-level shared signal. The same key always returns the same signal — the initial value from the **first** registration wins.

```ts
const theme = context("theme", "light");

theme(); // → "light"
theme("dark"); // updates all islands subscribed to this signal
```

Context signals work identically to state signals — calling with no args reads, calling with a value writes. Any island that reads a context signal inside `.render()` or `.effect()` will re-render or re-run when the signal changes.

```ts
const score = context("score", 0);

const display = ilha.render(() => `<p>${score()}</p>`);

const control = ilha.on("@click", () => score(score() + 1)).render(() => `<button>+1</button>`);
```

> **Note:** Context signals are global for the lifetime of the page. There is no per-instance scoping or cleanup mechanism.

---

## SSR & hydration

### SSR rendering

Islands support both synchronous and asynchronous SSR.

```ts
island(); // string for fully sync islands
await island({ count: 3 }); // resolves async derived when needed
island.toString({ count: 3 }); // always sync
```

During SSR:

- Signal accessors return plain values; writes are ignored
- `.on()`, `.effect()`, `.bind()`, and `.transition()` are no-ops
- Sync `.derived()` resolves immediately
- Async `.derived()` can be awaited via `await island(...)`
- `toString()` and implicit string interpolation remain synchronous, so async derived values stay in loading state there
- Slots render inline through their synchronous slot accessor path

#### Async SSR example

```ts
const profile = ilha
  .derived("user", async () => ({ name: "Ada" }))
  .render(({ derived }) => {
    if (derived.user.loading) return "<p>Loading…</p>";
    if (derived.user.error) return `<p>Error: ${derived.user.error.message}</p>`;
    return `<p>${derived.user.value!.name}</p>`;
  });

await profile(); // "<p>Ada</p>"
profile.toString(); // "<p>Loading…</p>"
`${profile}`; // "<p>Loading…</p>"
```

### Hydration

To restore serialised state on the client without re-running prop validation, embed the state snapshot in the HTML:

```html
<div data-ilha="counter" data-ilha-state='{"count": 42}'>
  <p>42</p>
  <button data-inc>+</button>
</div>
```

`data-ilha-state` takes priority over `data-props` when both are present. Pass `{ hydrate: true }` to `mount()` to preserve the SSR HTML until the first client render completes:

```ts
mount({ counter }, { hydrate: true });
```

---

## html template tag

```ts
import { html } from "ilha";
```

A tagged template literal that **escapes all interpolations by default**. Use it to safely build HTML strings from user-provided or dynamic values.

```ts
html`<p>${userInput}</p>`;
// → "<p>&lt;script&gt;…</p>"
```

### Interpolation types

| Value               | Behaviour                                 |
| ------------------- | ----------------------------------------- |
| `string`, `number`  | HTML-escaped                              |
| `null`, `undefined` | Omitted (renders nothing)                 |
| `raw(str)`          | Inserted as-is, no escaping               |
| Signal accessor     | Called, result is HTML-escaped            |
| Slot accessor       | Calls `.toString()`, inserted as raw HTML |
| Other function      | Called, result is HTML-escaped            |

Leading and trailing blank lines are stripped (dedented) from the result.

### Signals in `html`

Signal accessors can be passed directly without calling them — `html` detects them and calls them automatically:

```ts
html`<p>${state.count}</p>`; // same as html`<p>${state.count()}</p>`
```

---

## raw()

```ts
import { raw } from "ilha";

raw(value: string): RawHtml
```

Wraps a string to mark it as safe HTML, bypassing `html`'s escaping. Use only with trusted content.

```ts
html`<div>${raw("<b>bold</b>")}</div>`;
// → "<div><b>bold</b></div>"
```

---

## TypeScript

ilha is written in TypeScript and ships full type declarations. The builder tracks the full state and derived map through the chain, so `.render()` and all handlers are fully typed with no manual annotations needed.

### Inferred types

```ts
const island = ilha
  .input(z.object({ count: z.number().default(0) }))
  .state("count", ({ count }) => count) // state.count: SignalAccessor<number>
  .derived("doubled", ({ state }) => state.count() * 2) // derived.doubled: DerivedValue<number>
  .render(({ state, derived }) => {
    state.count(); // → number
    derived.doubled.value; // → number | undefined
    return `<p>${state.count()}</p>`;
  });
```

### Exported types

```ts
import type {
  Island,
  IslandState,
  IslandDerived,
  DerivedValue,
  SignalAccessor,
  SlotAccessor,
  HandlerContext,
  MountOptions,
  MountResult,
} from "ilha";
```

#### `Island<TInput, TStateMap>`

The callable island returned by `.render()`.

#### `SignalAccessor<T>`

```ts
type SignalAccessor<T> = {
  (): T;
  (value: T): void;
};
```

#### `DerivedValue<T>`

```ts
interface DerivedValue<T> {
  loading: boolean;
  value: T | undefined;
  error: Error | undefined;
}
```

#### `HandlerContext<TInput, TStateMap>`

```ts
type HandlerContext<TInput, TStateMap> = {
  state: IslandState<TStateMap>;
  input: TInput;
  el: Element;
  event: Event;
};
```

#### `MountOptions`

```ts
interface MountOptions {
  root?: Element;
  hydrate?: boolean;
  lazy?: boolean;
}
```

---

## Known limitations

- **`input[type=radio]` groups** are not supported by `.bind()`.
- **`context()` signals** are global for the page lifetime with no scoping or cleanup mechanism.
- **Element references go stale after re-render** — always re-query from the island root element after any interaction that changes state.

// index.ts

import { signal, effect } from "alien-signals";

// ─────────────────────────────────────────────
// Standard Schema V1 (inlined, type-only)
// https://standardschema.dev
// ─────────────────────────────────────────────

interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}

declare namespace StandardSchemaV1 {
  interface Props<Input = unknown, Output = Input> {
    readonly version: 1;
    readonly vendor: string;
    readonly types?: Types<Input, Output> | undefined;
    readonly validate: (value: unknown) => Result<Output> | Promise<Result<Output>>;
  }
  type Result<Output> = SuccessResult<Output> | FailureResult;
  interface SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
  }
  interface FailureResult {
    readonly issues: ReadonlyArray<Issue>;
  }
  interface Issue {
    readonly message: string;
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }
  interface PathSegment {
    readonly key: PropertyKey;
  }
  interface Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
  }
  type InferOutput<Schema extends StandardSchemaV1> = NonNullable<
    Schema["~standard"]["types"]
  >["output"];
}

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

function validateSchema<S extends StandardSchemaV1>(
  schema: S,
  value: unknown,
): StandardSchemaV1.InferOutput<S> {
  const result = schema["~standard"].validate(value);
  if (result instanceof Promise) throw new Error("[ilha] Async schemas are not supported.");
  if (result.issues)
    throw new Error(
      `[ilha] Validation failed:\n${result.issues.map((i) => `  - ${i.message}`).join("\n")}`,
    );
  return result.value as StandardSchemaV1.InferOutput<S>;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function dedentString(str: string): string {
  const lines = str.split("\n");
  while (lines.length && lines[0]!.trim() === "") lines.shift();
  while (lines.length && lines[lines.length - 1]!.trim() === "") lines.pop();
  if (!lines.length) return "";
  const indent = Math.min(
    ...lines.filter((l) => l.trim() !== "").map((l) => l.match(/^(\s*)/)![1]!.length),
  );
  return lines.map((l) => l.slice(indent)).join("\n");
}

// ─────────────────────────────────────────────
// Symbols & internal marker interfaces
// ─────────────────────────────────────────────

const RAW = Symbol("ilha.raw");
const SLOT_ACCESSOR = Symbol("ilha.slotAccessor");
const SIGNAL_ACCESSOR = Symbol("ilha.signalAccessor");

const SLOT_ATTR = "data-ilha-slot";
const SLOT_PROPS_ATTR = "data-ilha-props";
const STATE_ATTR = "data-ilha-state";

interface RawHtml {
  [RAW]: true;
  value: string;
}

// ─────────────────────────────────────────────
// Slot accessor
// - ${slots.foo}        → toString() → raw HTML, no props
// - ${slots.foo(props)} → returns RawHtml, passed through unescaped
// ─────────────────────────────────────────────

export interface SlotAccessor {
  (props?: Record<string, unknown>): RawHtml;
  toString(): string;
  [SLOT_ACCESSOR]: true;
}

function makeSlotAccessor(render: (props?: Record<string, unknown>) => string): SlotAccessor {
  const fn = (props?: Record<string, unknown>): RawHtml => ({
    [RAW]: true,
    value: render(props),
  });
  fn.toString = () => render(undefined);
  (fn as unknown as Record<symbol, boolean>)[SLOT_ACCESSOR] = true;
  return fn as unknown as SlotAccessor;
}

function isSlotAccessor(v: unknown): v is SlotAccessor {
  return typeof v === "function" && SLOT_ACCESSOR in (v as object);
}

// ─────────────────────────────────────────────
// Signal accessor marker
// Lets html`` call the getter and escape the result for ${state.count}
// ─────────────────────────────────────────────

interface MarkedSignalAccessor<T> {
  (): T;
  (value: T): void;
  [SIGNAL_ACCESSOR]: true;
}

function markSignalAccessor<T>(fn: { (): T; (value: T): void }): MarkedSignalAccessor<T> {
  (fn as unknown as Record<symbol, boolean>)[SIGNAL_ACCESSOR] = true;
  return fn as MarkedSignalAccessor<T>;
}

function isSignalAccessor(v: unknown): v is MarkedSignalAccessor<unknown> {
  return typeof v === "function" && SIGNAL_ACCESSOR in (v as object);
}

// ─────────────────────────────────────────────
// Public helpers
// ─────────────────────────────────────────────

function ilhaRaw(value: string): RawHtml {
  return { [RAW]: true, value };
}

function ilhaHtml(strings: TemplateStringsArray, ...values: unknown[]): string {
  let result = "";
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      const v = values[i];
      if (v == null) continue;
      if (typeof v === "object" && RAW in (v as object)) {
        result += (v as RawHtml).value;
      } else if (isSlotAccessor(v)) {
        result += v.toString();
      } else if (isSignalAccessor(v)) {
        // ${state.count} — call getter, escape result
        result += escapeHtml(v());
      } else if (typeof v === "function") {
        // plain function — call and escape
        result += escapeHtml((v as () => unknown)());
      } else {
        result += escapeHtml(v);
      }
    }
  }
  return dedentString(result);
}

// ─────────────────────────────────────────────
// Context registry (shared signals across islands)
// ─────────────────────────────────────────────

type ContextSignal<T> = { (): T; (value: T): void };

const contextRegistry = new Map<string, ContextSignal<unknown>>();

function ilhaContext<T>(key: string, initial: T): ContextSignal<T> {
  if (contextRegistry.has(key)) {
    return contextRegistry.get(key) as ContextSignal<T>;
  }
  const s = signal(initial);
  const accessor = (...args: unknown[]): unknown => {
    if (args.length === 0) return s();
    s(args[0] as T);
  };
  contextRegistry.set(key, accessor as ContextSignal<unknown>);
  return accessor as ContextSignal<T>;
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type SignalAccessor<T> = MarkedSignalAccessor<T>;

export type IslandState<TStateMap extends Record<string, unknown>> = {
  [K in keyof TStateMap]: SignalAccessor<TStateMap[K]>;
};

export interface Island<TInput, TStateMap extends Record<string, unknown>> {
  (props?: Partial<TInput>): string;
  toString(props?: Partial<TInput>): string;
  mount(el: Element, props?: Partial<TInput>): () => void;
}

type AnyIsland = Island<Record<string, unknown>, Record<string, unknown>>;
type SlotMap = Record<string, AnyIsland>;

type SlotsProxy<TSlots extends SlotMap> = {
  readonly [K in keyof TSlots]: SlotAccessor;
};

type RenderContext<TInput, TStateMap extends Record<string, unknown>, TSlots extends SlotMap> = {
  state: IslandState<TStateMap>;
  input: TInput;
  slots: SlotsProxy<TSlots>;
};

type EffectContext<TInput, TStateMap extends Record<string, unknown>> = {
  state: IslandState<TStateMap>;
  input: TInput;
  el: Element;
};

type HandlerContext<TInput, TStateMap extends Record<string, unknown>> = {
  state: IslandState<TStateMap>;
  input: TInput;
  el: Element;
  event: Event;
};

type StateInit<TInput, V> = V | ((input: TInput) => V);

interface StateEntry<TInput> {
  key: string;
  init: StateInit<TInput, unknown>;
}

// ─────────────────────────────────────────────
// Event modifier parsing
// Supports: selector@event:once:capture:passive
// ─────────────────────────────────────────────

interface ParsedOn {
  selector: string;
  eventType: string;
  options: AddEventListenerOptions;
}

function parseOnArgs(
  selectorOrCombined: string,
  callbackOrEventType: ((ctx: HandlerContext<never, never>) => void) | string,
): ParsedOn {
  let selector: string;
  let rawEvent: string;

  if (typeof callbackOrEventType === "function") {
    const atIdx = selectorOrCombined.lastIndexOf("@");
    if (atIdx === -1) {
      // .on("@event", cb) shorthand with empty selector = root
      selector = "";
      rawEvent = selectorOrCombined.startsWith("@")
        ? selectorOrCombined.slice(1)
        : selectorOrCombined;
    } else {
      selector = selectorOrCombined.slice(0, atIdx);
      rawEvent = selectorOrCombined.slice(atIdx + 1);
    }
  } else {
    selector = selectorOrCombined;
    rawEvent = callbackOrEventType;
  }

  const parts = rawEvent.split(":");
  const eventType = parts[0]!;
  const modifiers = new Set(parts.slice(1));

  const options: AddEventListenerOptions = {
    once: modifiers.has("once"),
    capture: modifiers.has("capture"),
    passive: modifiers.has("passive"),
  };

  return { selector, eventType, options };
}

interface OnEntry<TInput, TStateMap extends Record<string, unknown>> {
  selector: string;
  event: string;
  options: AddEventListenerOptions;
  handler: (ctx: HandlerContext<TInput, TStateMap>) => void;
}

interface EffectEntry<TInput, TStateMap extends Record<string, unknown>> {
  fn: (ctx: EffectContext<TInput, TStateMap>) => (() => void) | void;
}

interface TransitionOptions {
  enter?: (el: Element) => Promise<void> | void;
  leave?: (el: Element) => Promise<void> | void;
}

export interface MountOptions {
  root?: Element;
  hydrate?: boolean;
  lazy?: boolean;
}

export interface MountResult {
  unmount: () => void;
}

// ─────────────────────────────────────────────
// Builder
// ─────────────────────────────────────────────

class IlhaBuilder<
  TInput extends Record<string, unknown>,
  TStateMap extends Record<string, unknown>,
  TSlots extends SlotMap = Record<string, never>,
> {
  constructor(
    private readonly _schema: StandardSchemaV1 | null,
    private readonly _states: StateEntry<TInput>[],
    private readonly _ons: OnEntry<TInput, TStateMap>[],
    private readonly _effects: EffectEntry<TInput, TStateMap>[],
    private readonly _slots: Record<string, AnyIsland>,
    private readonly _transition: TransitionOptions | null,
  ) {}

  input<S extends StandardSchemaV1>(
    schema: S,
  ): IlhaBuilder<
    StandardSchemaV1.InferOutput<S> & Record<string, unknown>,
    Record<string, never>,
    Record<string, never>
  > {
    return new IlhaBuilder<
      StandardSchemaV1.InferOutput<S> & Record<string, unknown>,
      Record<string, never>,
      Record<string, never>
    >(schema, [], [], [], {}, null);
  }

  state<K extends string, V>(
    key: K,
    init: StateInit<TInput, V>,
  ): IlhaBuilder<TInput, TStateMap & Record<K, V>, TSlots> {
    return new IlhaBuilder<TInput, TStateMap & Record<K, V>, TSlots>(
      this._schema,
      [...this._states, { key, init: init as StateInit<TInput, unknown> }],
      this._ons as unknown as OnEntry<TInput, TStateMap & Record<K, V>>[],
      this._effects as unknown as EffectEntry<TInput, TStateMap & Record<K, V>>[],
      this._slots,
      this._transition,
    );
  }

  on(
    selectorOrCombined: string,
    callbackOrEventType: ((ctx: HandlerContext<TInput, TStateMap>) => void) | string,
    handler?: (ctx: HandlerContext<TInput, TStateMap>) => void,
  ): IlhaBuilder<TInput, TStateMap, TSlots> {
    const parsed = parseOnArgs(selectorOrCombined, callbackOrEventType as string);
    const resolvedHandler =
      typeof callbackOrEventType === "function" ? callbackOrEventType : handler!;

    return new IlhaBuilder<TInput, TStateMap, TSlots>(
      this._schema,
      this._states,
      [
        ...this._ons,
        {
          selector: parsed.selector,
          event: parsed.eventType,
          options: parsed.options,
          handler: resolvedHandler,
        },
      ],
      this._effects,
      this._slots,
      this._transition,
    );
  }

  effect(
    fn: (ctx: EffectContext<TInput, TStateMap>) => (() => void) | void,
  ): IlhaBuilder<TInput, TStateMap, TSlots> {
    return new IlhaBuilder<TInput, TStateMap, TSlots>(
      this._schema,
      this._states,
      this._ons,
      [...this._effects, { fn }],
      this._slots,
      this._transition,
    );
  }

  slot<K extends string>(
    name: K,
    island: AnyIsland,
  ): IlhaBuilder<TInput, TStateMap, TSlots & Record<K, AnyIsland>> {
    return new IlhaBuilder<TInput, TStateMap, TSlots & Record<K, AnyIsland>>(
      this._schema,
      this._states,
      this._ons,
      this._effects,
      { ...this._slots, [name]: island },
      this._transition,
    );
  }

  transition(opts: TransitionOptions): IlhaBuilder<TInput, TStateMap, TSlots> {
    return new IlhaBuilder<TInput, TStateMap, TSlots>(
      this._schema,
      this._states,
      this._ons,
      this._effects,
      this._slots,
      opts,
    );
  }

  render(fn: (ctx: RenderContext<TInput, TStateMap, TSlots>) => string): Island<TInput, TStateMap> {
    const schema = this._schema;
    const states = this._states;
    const ons = this._ons;
    const effects = this._effects;
    const slotDefs = this._slots;
    const transition = this._transition;

    function resolveInput(props?: Partial<TInput>): TInput {
      const value = props ?? {};
      if (!schema) return value as TInput;
      return validateSchema(schema, value) as TInput;
    }

    function makeSlotsProxy(ssr: boolean): SlotsProxy<TSlots> {
      return new Proxy({} as SlotsProxy<TSlots>, {
        get(_, name: string) {
          if (!(name in slotDefs)) return makeSlotAccessor(() => "");
          if (ssr) {
            return makeSlotAccessor((props?: Record<string, unknown>) => slotDefs[name]!(props));
          }
          return makeSlotAccessor((props?: Record<string, unknown>) => {
            const encodedProps = props ? ` ${SLOT_PROPS_ATTR}='${JSON.stringify(props)}'` : "";
            return `<div ${SLOT_ATTR}="${name}"${encodedProps}></div>`;
          });
        },
      });
    }

    function buildPlainState(input: TInput): IslandState<TStateMap> {
      const state: Record<string, unknown> = {};
      for (const entry of states) {
        const value =
          typeof entry.init === "function"
            ? (entry.init as (i: TInput) => unknown)(input)
            : entry.init;
        const accessor = markSignalAccessor((...args: unknown[]): unknown => {
          if (args.length === 0) return value;
        });
        state[entry.key] = accessor as SignalAccessor<unknown>;
      }
      return state as IslandState<TStateMap>;
    }

    function buildSignalState(
      input: TInput,
      snapshot?: Record<string, unknown>,
    ): IslandState<TStateMap> {
      const state: Record<string, unknown> = {};
      for (const entry of states) {
        // hydration: prefer snapshotted value over computed initial
        const initial =
          snapshot && entry.key in snapshot
            ? snapshot[entry.key]
            : typeof entry.init === "function"
              ? (entry.init as (i: TInput) => unknown)(input)
              : entry.init;
        const s = signal(initial);
        const accessor = markSignalAccessor((...args: unknown[]): unknown => {
          if (args.length === 0) return s();
          s(args[0] as typeof initial);
        });
        state[entry.key] = accessor as SignalAccessor<unknown>;
      }
      return state as IslandState<TStateMap>;
    }

    function renderToString(props?: Partial<TInput>): string {
      const input = resolveInput(props);
      const state = buildPlainState(input);
      const slots = makeSlotsProxy(true);
      // Serialise initial state for hydration
      const stateSnapshot: Record<string, unknown> = {};
      for (const entry of states) {
        stateSnapshot[entry.key] =
          typeof entry.init === "function"
            ? (entry.init as (i: TInput) => unknown)(input)
            : entry.init;
      }
      const rendered = fn({ state, input, slots });
      // Wrap with hydration marker if there is state to preserve
      if (Object.keys(stateSnapshot).length === 0) return rendered;
      return rendered;
    }

    function mountIsland(el: Element, props?: Partial<TInput>): () => void {
      const input = resolveInput(props);

      // ── Hydration: read serialised state from DOM if present ──────────────
      let snapshot: Record<string, unknown> | undefined;
      const rawState = el.getAttribute(STATE_ATTR);
      if (rawState) {
        try {
          snapshot = JSON.parse(rawState) as Record<string, unknown>;
        } catch {
          console.warn("[ilha] Failed to parse data-ilha-state");
        }
      }

      const state = buildSignalState(input, snapshot);
      const cleanups: Array<() => void> = [];

      // ── Enter transition ──────────────────────────────────────────────────
      if (transition?.enter) {
        const result = transition.enter(el);
        if (result instanceof Promise) result.catch(console.error);
      }

      // ── Slot management ───────────────────────────────────────────────────
      const slotEls = new Map<string, Element>();

      function snapshotSlots() {
        slotEls.clear();
        for (const name of Object.keys(slotDefs)) {
          const existing = el.querySelector(`[${SLOT_ATTR}="${name}"]`);
          if (existing) slotEls.set(name, existing);
        }
      }

      function restoreSlots() {
        for (const [name, slotEl] of slotEls) {
          const placeholder = el.querySelector(`[${SLOT_ATTR}="${name}"]`);
          if (placeholder) placeholder.replaceWith(slotEl);
        }
      }

      // ── Event listeners ───────────────────────────────────────────────────
      type ListenerEntry = {
        target: Element;
        type: string;
        fn: EventListener;
        options: AddEventListenerOptions;
        entry: OnEntry<TInput, TStateMap>;
      };
      const listeners: ListenerEntry[] = [];

      const firedOnce = new Set<OnEntry<TInput, TStateMap>>();

      function attachListeners() {
        for (const entry of ons) {
          // skip once-handlers that have already fired
          if (entry.options.once && firedOnce.has(entry)) continue;

          const targets =
            entry.selector === "" ? [el] : Array.from(el.querySelectorAll(entry.selector));

          targets.forEach((target) => {
            const listener = (event: Event) => {
              if (entry.options.once) {
                firedOnce.add(entry);
                // detach all copies of this entry immediately
                for (const l of listeners.filter((l) => l.entry === entry)) {
                  l.target.removeEventListener(l.type, l.fn, l.options);
                }
                listeners.splice(
                  0,
                  listeners.length,
                  ...listeners.filter((l) => l.entry !== entry),
                );
              }
              entry.handler({ state, input, el, event });
            };
            // pass once: false — we manage it manually
            const opts = { ...entry.options, once: false };
            target.addEventListener(entry.event, listener, opts);
            listeners.push({ target, type: entry.event, fn: listener, options: opts, entry });
          });
        }
      }

      function detachListeners() {
        for (const l of listeners) l.target.removeEventListener(l.type, l.fn, l.options);
        listeners.length = 0;
      }

      const slots = makeSlotsProxy(false);

      // ── Initial render ────────────────────────────────────────────────────
      el.innerHTML = fn({ state, input, slots });
      attachListeners();

      // ── Mount child islands into slot anchors ─────────────────────────────
      for (const [name, childIsland] of Object.entries(slotDefs)) {
        const slotEl = el.querySelector(`[${SLOT_ATTR}="${name}"]`);
        if (!slotEl) continue;
        slotEls.set(name, slotEl);

        let slotProps: Record<string, unknown> | undefined;
        const ilhaProps = slotEl.getAttribute(SLOT_PROPS_ATTR);
        const dataProps = slotEl.getAttribute("data-props");
        if (ilhaProps) {
          try {
            slotProps = JSON.parse(ilhaProps) as Record<string, unknown>;
          } catch {
            console.warn(`[ilha] Failed to parse ${SLOT_PROPS_ATTR} on [${SLOT_ATTR}="${name}"]`);
          }
        } else if (dataProps) {
          try {
            slotProps = JSON.parse(dataProps) as Record<string, unknown>;
          } catch {
            console.warn(`[ilha] Failed to parse data-props on [${SLOT_ATTR}="${name}"]`);
          }
        }

        cleanups.push(childIsland.mount(slotEl, slotProps));
      }

      // ── Reactive re-render effect ─────────────────────────────────────────
      let initialized = false;
      const stopRender = effect(() => {
        const html = fn({ state, input, slots });
        if (!initialized) {
          initialized = true;
          return;
        }
        snapshotSlots();
        detachListeners();
        el.innerHTML = html;
        restoreSlots();
        attachListeners();
      });
      cleanups.push(stopRender);
      cleanups.push(detachListeners);

      // ── User effects ──────────────────────────────────────────────────────
      for (const entry of effects) {
        let userCleanup: (() => void) | void;
        const stopEffect = effect(() => {
          if (userCleanup) {
            userCleanup();
            userCleanup = undefined;
          }
          userCleanup = entry.fn({ state, input, el });
        });
        cleanups.push(() => {
          stopEffect();
          if (userCleanup) userCleanup();
        });
      }

      return () => {
        // ── Leave transition then teardown ──────────────────────────────────
        if (transition?.leave) {
          const result = transition.leave(el);
          if (result instanceof Promise) {
            result.then(() => cleanups.forEach((c) => c())).catch(console.error);
            return;
          }
        }
        cleanups.forEach((c) => c());
      };
    }

    const island = function (props?: Partial<TInput>): string {
      return renderToString(props);
    } as Island<TInput, TStateMap>;

    island.toString = (props?: Partial<TInput>) => renderToString(props);
    island.mount = (el: Element, props?: Partial<TInput>) => mountIsland(el, props);

    return island;
  }
}

// ─────────────────────────────────────────────
// ilha.from — typed mount from CSS selector
// ─────────────────────────────────────────────

function ilhaFrom<TInput, TStateMap extends Record<string, unknown>>(
  selector: string | Element,
  island: Island<TInput, TStateMap>,
  props?: Partial<TInput>,
): (() => void) | null {
  const el = typeof selector === "string" ? document.querySelector(selector) : selector;
  if (!el) {
    console.warn(`[ilha] from(): element not found: ${selector}`);
    return null;
  }
  return island.mount(el, props);
}

// ─────────────────────────────────────────────
// ilha.mount — auto-discovery
// ─────────────────────────────────────────────

type IslandRegistry = Record<string, AnyIsland>;

function mountAll(registry: IslandRegistry, options: MountOptions = {}): MountResult {
  const root = options.root ?? document.body;
  const lazy = options.lazy ?? false;
  const hydrate = options.hydrate ?? false;
  const unmounts: Array<() => void> = [];

  function activateEl(el: Element) {
    const name = el.getAttribute("data-ilha");
    if (!name) return;
    const island = registry[name];
    if (!island) return;

    let props: Record<string, unknown> = {};
    const rawProps = el.getAttribute("data-props");
    if (rawProps) {
      try {
        props = JSON.parse(rawProps) as Record<string, unknown>;
      } catch {
        console.warn(`[ilha] Failed to parse data-props on [data-ilha="${name}"]`);
      }
    }

    if (hydrate) {
      // Preserve existing SSR HTML until the island renders
      const snapshot = el.innerHTML;
      const unmount = island.mount(el, props);
      if (!el.innerHTML) el.innerHTML = snapshot;
      unmounts.push(unmount);
    } else {
      unmounts.push(island.mount(el, props));
    }
  }

  const els = Array.from(root.querySelectorAll("[data-ilha]"));

  if (lazy && typeof IntersectionObserver !== "undefined") {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          activateEl(entry.target);
          io.unobserve(entry.target);
        }
      }
    });
    els.forEach((el) => io.observe(el));
    unmounts.push(() => io.disconnect());
  } else {
    els.forEach(activateEl);
  }

  return { unmount: () => unmounts.forEach((u) => u()) };
}

// ─────────────────────────────────────────────
// Default export
// ─────────────────────────────────────────────

const rootBuilder = new IlhaBuilder<
  Record<string, unknown>,
  Record<string, never>,
  Record<string, never>
>(null, [], [], [], {}, null);

const ilha = Object.assign(rootBuilder, {
  html: ilhaHtml,
  raw: ilhaRaw,
  mount: mountAll,
  from: ilhaFrom,
  context: ilhaContext,
});

export const html = ilhaHtml;
export const raw = ilhaRaw;
export const mount = mountAll;
export const from = ilhaFrom;
export const context = ilhaContext;
export default ilha;

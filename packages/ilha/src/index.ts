import { signal, effect, setActiveSub } from "alien-signals";

// ─────────────────────────────────────────────
// Standard Schema V1 (inlined, type-only)
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
// Inlined morphlex (browser-only, subset used by ilha)
// ─────────────────────────────────────────────

const SUPPORTS_MOVE_BEFORE = typeof Element !== "undefined" && "moveBefore" in Element.prototype;
const ELEMENT_NODE_TYPE = 1;
const TEXT_NODE_TYPE = 3;
const TREE_WALKER_SHOW_ELEMENT = 1;

const Operation = { EqualNode: 0, SameElement: 1, SameNode: 2 } as const;
type MorphOperation = (typeof Operation)[keyof typeof Operation];

type IdSetMap = WeakMap<Node, Set<string>>;
type IdArrayMap = WeakMap<Node, Array<string>>;
type CandidateIdBucket = number | Array<number>;

function morphMoveBefore(
  parent: ParentNode,
  node: ChildNode,
  insertionPoint: ChildNode | null,
): void {
  if (node === insertionPoint) return;
  if (node.parentNode === parent) {
    if (node.nextSibling === insertionPoint) return;
    if (SUPPORTS_MOVE_BEFORE) {
      (parent as ParentNode & { moveBefore(n: ChildNode, b: ChildNode | null): void }).moveBefore(
        node,
        insertionPoint,
      );
      return;
    }
  }
  parent.insertBefore(node, insertionPoint);
}

function morphIsWhitespaceTextNode(node: Node): boolean {
  if (node.nodeType !== TEXT_NODE_TYPE) return false;
  const value = node.nodeValue;
  if (!value) return true;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 32 || code === 9 || code === 10 || code === 13 || code === 12) continue;
    if (code <= 127) return false;
    return value.trim() === "";
  }
  return true;
}

function morphCanMorphInPlace(from: Element, to: Element): boolean {
  if (from.localName !== to.localName || from.namespaceURI !== to.namespaceURI) return false;
  if (
    from.localName === "input" &&
    (from as HTMLInputElement).type !== (to as HTMLInputElement).type
  )
    return false;
  return true;
}

function morphCanSoftMatchByTagName(el: Element, hasDescIdMarker: boolean): boolean {
  if (el.id !== "") return false;
  const ln = el.localName;
  if (ln === "input" || ln === "textarea" || ln === "select") return false;
  if (el.hasAttribute("name") || el.hasAttribute("href") || el.hasAttribute("src")) return false;
  if (hasDescIdMarker) return false;
  return true;
}

function morphForEachDescendantWithId(node: ParentNode, cb: (el: Element) => void): void {
  const walker = (node as Node).ownerDocument!.createTreeWalker(
    node as Node,
    TREE_WALKER_SHOW_ELEMENT,
  );
  let cur = walker.nextNode();
  while (cur) {
    const el = cur as Element;
    if (el.id !== "") cb(el);
    cur = walker.nextNode();
  }
}

function morphLIS(seq: Array<number | undefined>): Array<number> {
  const n = seq.length;
  if (n === 0) return [];
  const smallestEnding = new Array<number>(n);
  const indices = new Array<number>(n);
  const prev = new Int32Array(n);
  prev.fill(-1);
  let lisLength = 0;
  for (let i = 0; i < n; i++) {
    const val = seq[i];
    if (val === undefined) continue;
    let left = 0,
      right = lisLength;
    while (left < right) {
      const mid = (left + right) >> 1;
      if (smallestEnding[mid]! < val) left = mid + 1;
      else right = mid;
    }
    prev[i] = left > 0 ? indices[left - 1]! : -1;
    smallestEnding[left] = val;
    indices[left] = i;
    if (left === lisLength) lisLength++;
  }
  const result = new Array<number>(lisLength);
  let curr = indices[lisLength - 1]!;
  for (let i = lisLength - 1; i >= 0; i--) {
    result[i] = curr;
    curr = prev[curr]!;
  }
  return result;
}

class MorphEngine {
  readonly #idArrayMap: IdArrayMap = new WeakMap();
  readonly #idSetMap: IdSetMap = new WeakMap();

  visitChildNodes(from: Element, to: Element): void {
    const parent = from;
    const fromChildren = Array.from(from.childNodes) as ChildNode[];
    const toChildren = Array.from(to.childNodes) as ChildNode[];

    const candidateNodeIndices: number[] = [];
    const candidateElIndices: number[] = [];
    const candidateElWithIdIndices: number[] = [];
    const candidateElIndicesById = new Map<string, CandidateIdBucket>();
    const unmatchedNodeIndices: number[] = [];
    const unmatchedElIndices: number[] = [];
    const whitespaceIndices: number[] = [];

    const candidateNodeActive = new Uint8Array(fromChildren.length);
    const candidateElActive = new Uint8Array(fromChildren.length);
    const candidateElWithIdActive = new Uint8Array(fromChildren.length);
    const unmatchedNodeActive = new Uint8Array(toChildren.length);
    const unmatchedElActive = new Uint8Array(toChildren.length);

    const matches: number[] = [];
    const op: MorphOperation[] = [];
    const toNodeType: number[] = [];
    const fromNodeType: number[] = [];
    const toLocalName: string[] = [];
    const fromLocalName: string[] = [];
    const toNS: (string | null)[] = [];
    const fromNS: (string | null)[] = [];

    for (let i = 0; i < fromChildren.length; i++) {
      const c = fromChildren[i]!;
      const t = c.nodeType;
      fromNodeType[i] = t;
      if (t === ELEMENT_NODE_TYPE) {
        const el = c as Element;
        fromLocalName[i] = el.localName;
        fromNS[i] = el.namespaceURI;
        if (el.id !== "") {
          candidateElWithIdActive[i] = 1;
          candidateElWithIdIndices.push(i);
          const b = candidateElIndicesById.get(el.id);
          if (b === undefined) candidateElIndicesById.set(el.id, i);
          else if (Array.isArray(b)) b.push(i);
          else candidateElIndicesById.set(el.id, [b, i]);
        } else {
          candidateElActive[i] = 1;
          candidateElIndices.push(i);
        }
      } else if (morphIsWhitespaceTextNode(c)) {
        whitespaceIndices.push(i);
      } else {
        candidateNodeActive[i] = 1;
        candidateNodeIndices.push(i);
      }
    }

    for (let i = 0; i < toChildren.length; i++) {
      const n = toChildren[i]!;
      const t = n.nodeType;
      toNodeType[i] = t;
      if (t === ELEMENT_NODE_TYPE) {
        const el = n as Element;
        toLocalName[i] = el.localName;
        toNS[i] = el.namespaceURI;
        unmatchedElActive[i] = 1;
        unmatchedElIndices.push(i);
      } else if (!morphIsWhitespaceTextNode(n)) {
        unmatchedNodeActive[i] = 1;
        unmatchedNodeIndices.push(i);
      }
    }

    // Match by isEqualNode
    for (const ui of unmatchedElIndices) {
      const ln = toLocalName[ui],
        el = toChildren[ui] as Element;
      for (const ci of candidateElIndices) {
        if (!candidateElActive[ci]) continue;
        if (ln !== fromLocalName[ci] || toNS[ui] !== fromNS[ci]) continue;
        if ((fromChildren[ci] as Element).isEqualNode(el)) {
          matches[ui] = ci;
          op[ui] = Operation.EqualNode;
          candidateElActive[ci] = 0;
          unmatchedElActive[ui] = 0;
          break;
        }
      }
    }

    // Match by exact id
    for (const ui of unmatchedElIndices) {
      if (!unmatchedElActive[ui]) continue;
      const el = toChildren[ui] as Element;
      if (el.id === "") continue;
      const bucket = candidateElIndicesById.get(el.id);
      if (bucket === undefined) continue;
      const indices = Array.isArray(bucket) ? bucket : [bucket];
      for (const ci of indices) {
        if (!candidateElWithIdActive[ci]) continue;
        if (toLocalName[ui] === fromLocalName[ci] && toNS[ui] === fromNS[ci]) {
          matches[ui] = ci;
          op[ui] = Operation.SameElement;
          candidateElWithIdActive[ci] = 0;
          unmatchedElActive[ui] = 0;
          break;
        }
      }
    }

    // Match by idArray vs idSet
    for (const ui of unmatchedElIndices) {
      if (!unmatchedElActive[ui]) continue;
      const el = toChildren[ui] as Element;
      const idArray = this.#idArrayMap.get(el);
      if (!idArray) continue;
      outer: for (const ci of candidateElIndices) {
        if (!candidateElActive[ci]) continue;
        const cand = fromChildren[ci] as Element;
        if (toLocalName[ui] !== fromLocalName[ci] || toNS[ui] !== fromNS[ci]) continue;
        const idSet = this.#idSetMap.get(cand);
        if (idSet) {
          for (const id of idArray) {
            if (idSet.has(id)) {
              matches[ui] = ci;
              op[ui] = Operation.SameElement;
              candidateElActive[ci] = 0;
              unmatchedElActive[ui] = 0;
              break outer;
            }
          }
        }
      }
    }

    // Match by heuristics (name/href/src)
    for (const ui of unmatchedElIndices) {
      if (!unmatchedElActive[ui]) continue;
      const el = toChildren[ui] as Element;
      const name = el.getAttribute("name"),
        href = el.getAttribute("href"),
        src = el.getAttribute("src");
      for (const ci of candidateElIndices) {
        if (!candidateElActive[ci]) continue;
        const cand = fromChildren[ci] as Element;
        if (
          toLocalName[ui] === fromLocalName[ci] &&
          toNS[ui] === fromNS[ci] &&
          ((name && name === cand.getAttribute("name")) ||
            (href && href === cand.getAttribute("href")) ||
            (src && src === cand.getAttribute("src")))
        ) {
          matches[ui] = ci;
          op[ui] = Operation.SameElement;
          candidateElActive[ci] = 0;
          unmatchedElActive[ui] = 0;
          break;
        }
      }
    }

    // Match by tagName (soft)
    for (const ui of unmatchedElIndices) {
      if (!unmatchedElActive[ui]) continue;
      const el = toChildren[ui] as Element;
      if (!morphCanSoftMatchByTagName(el, this.#idArrayMap.has(el))) continue;
      for (const ci of candidateElIndices) {
        if (!candidateElActive[ci]) continue;
        const cand = fromChildren[ci] as Element;
        if (!morphCanSoftMatchByTagName(cand, this.#idSetMap.has(cand))) continue;
        if (toLocalName[ui] === fromLocalName[ci] && toNS[ui] === fromNS[ci]) {
          matches[ui] = ci;
          op[ui] = Operation.SameElement;
          candidateElActive[ci] = 0;
          unmatchedElActive[ui] = 0;
          break;
        }
      }
    }

    // Match nodes by isEqualNode
    for (const ui of unmatchedNodeIndices) {
      const node = toChildren[ui]!;
      for (const ci of candidateNodeIndices) {
        if (!candidateNodeActive[ci]) continue;
        if (fromChildren[ci]!.isEqualNode(node)) {
          matches[ui] = ci;
          op[ui] = Operation.EqualNode;
          candidateNodeActive[ci] = 0;
          unmatchedNodeActive[ui] = 0;
          break;
        }
      }
    }

    // Match nodes by nodeType
    for (const ui of unmatchedNodeIndices) {
      if (!unmatchedNodeActive[ui]) continue;
      for (const ci of candidateNodeIndices) {
        if (!candidateNodeActive[ci]) continue;
        if (toNodeType[ui] === fromNodeType[ci]) {
          matches[ui] = ci;
          op[ui] = Operation.SameNode;
          candidateNodeActive[ci] = 0;
          unmatchedNodeActive[ui] = 0;
          break;
        }
      }
    }

    // Remove unmatched candidates
    for (const ci of candidateNodeIndices) if (candidateNodeActive[ci]) fromChildren[ci]!.remove();
    for (const ci of whitespaceIndices) fromChildren[ci]!.remove();
    for (const ci of candidateElIndices) if (candidateElActive[ci]) fromChildren[ci]!.remove();
    for (const ci of candidateElWithIdIndices)
      if (candidateElWithIdActive[ci]) fromChildren[ci]!.remove();

    // LIS — nodes that don't need to move
    const lisIndices = morphLIS(matches);
    const shouldNotMove: boolean[] = new Array(fromChildren.length);
    for (const li of lisIndices) shouldNotMove[matches[li]!] = true;

    let insertionPoint: ChildNode | null = parent.firstChild;
    for (let i = 0; i < toChildren.length; i++) {
      const node = toChildren[i]!;
      const mi = matches[i];
      if (mi !== undefined) {
        const match = fromChildren[mi]!;
        if (!shouldNotMove[mi]) morphMoveBefore(parent, match, insertionPoint);
        const operation = op[i]!;
        if (operation === Operation.SameElement || operation === Operation.SameNode) {
          this.#morphOneToOne(match, node);
        }
        // EqualNode: nodes are identical, no further work needed
        insertionPoint = match.nextSibling;
      } else {
        parent.insertBefore(node, insertionPoint);
        insertionPoint = node.nextSibling;
      }
    }
  }

  #morphOneToOne(from: ChildNode, to: ChildNode): void {
    if (from === to || from.isEqualNode(to)) return;
    if (from.nodeType === ELEMENT_NODE_TYPE && to.nodeType === ELEMENT_NODE_TYPE) {
      if (morphCanMorphInPlace(from as Element, to as Element)) {
        this.#morphMatchingElements(from as Element, to as Element);
      } else {
        from.replaceWith(to);
      }
    } else {
      const fv = from.nodeValue,
        tv = to.nodeValue;
      if (from.nodeType === to.nodeType && fv !== null && tv !== null) from.nodeValue = tv;
      else from.replaceWith(to);
    }
  }

  prepare(from: ParentNode, to: ParentNode): void {
    this.#mapIdSets(from);
    this.#mapIdArrays(to);
  }

  #morphMatchingElements(from: Element, to: Element): void {
    this.#visitAttributes(from, to);
    if (from.localName === "textarea") {
      const newText = to.textContent ?? "";
      if (from.textContent !== newText) from.textContent = newText;
      (from as HTMLTextAreaElement).value = (from as HTMLTextAreaElement).defaultValue;
    } else if (from.hasChildNodes() || to.hasChildNodes()) {
      this.visitChildNodes(from, to);
    }
  }

  #visitAttributes(from: Element, to: Element): void {
    from.removeAttribute("morphlex-dirty");
    for (const { name, value } of to.attributes) {
      if (from.getAttribute(name) !== value) from.setAttribute(name, value);
    }
    for (const { name } of Array.from(from.attributes)) {
      if (!to.hasAttribute(name)) from.removeAttribute(name);
    }
  }

  #mapIdArrays(node: ParentNode): void {
    morphForEachDescendantWithId(node, (el) => {
      let cur: Element | null = el;
      while (cur) {
        const arr = this.#idArrayMap.get(cur);
        if (arr) arr.push(el.id);
        else this.#idArrayMap.set(cur, [el.id]);
        if (cur === node) break;
        cur = cur.parentElement;
      }
    });
  }

  #mapIdSets(node: ParentNode): void {
    morphForEachDescendantWithId(node, (el) => {
      let cur: Element | null = el;
      while (cur) {
        const s = this.#idSetMap.get(cur);
        if (s) s.add(el.id);
        else this.#idSetMap.set(cur, new Set([el.id]));
        if (cur === node) break;
        cur = cur.parentElement;
      }
    });
  }
}

function morphInner(from: Element, to: Element): void {
  if (from.localName !== to.localName || from.namespaceURI !== to.namespaceURI)
    throw new Error("[ilha] morph: elements must match");
  for (const input of from.querySelectorAll("input")) {
    if (input.value !== input.defaultValue || input.checked !== input.defaultChecked)
      input.setAttribute("morphlex-dirty", "");
  }
  const engine = new MorphEngine();
  engine.prepare(from, to);
  engine.visitChildNodes(from, to);
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
// Symbols & constants
// ─────────────────────────────────────────────

const RAW = Symbol("ilha.raw");
const SLOT_ACCESSOR = Symbol("ilha.slotAccessor");
const SIGNAL_ACCESSOR = Symbol("ilha.signalAccessor");

const SLOT_ATTR = "data-ilha-slot";
const PROPS_ATTR = "data-ilha-props";
const STATE_ATTR = "data-ilha-state";

interface RawHtml {
  [RAW]: true;
  value: string;
}

// ─────────────────────────────────────────────
// Slot accessor
// ─────────────────────────────────────────────

export interface SlotAccessor {
  (props?: Record<string, unknown>): RawHtml;
  toString(): string;
  [SLOT_ACCESSOR]: true;
}

function makeSlotAccessor(render: (props?: Record<string, unknown>) => string): SlotAccessor {
  const fn = (props?: Record<string, unknown>): RawHtml => ({ [RAW]: true, value: render(props) });
  fn.toString = () => render(undefined);
  (fn as unknown as Record<symbol, boolean>)[SLOT_ACCESSOR] = true;
  return fn as unknown as SlotAccessor;
}

function isSlotAccessor(v: unknown): v is SlotAccessor {
  return typeof v === "function" && SLOT_ACCESSOR in (v as object);
}

// ─────────────────────────────────────────────
// Signal accessor
//
// Uses (...args: [value: T]): void for the setter to prevent TS from
// intersecting the two call signatures into (value: never): void
// when T contains undefined.
// ─────────────────────────────────────────────

interface MarkedSignalAccessor<T> {
  (): T;
  (...args: [value: T]): void;
  [SIGNAL_ACCESSOR]: true;
}

function markSignalAccessor<T>(fn: { (): T; (value: T): void }): MarkedSignalAccessor<T> {
  (fn as unknown as Record<symbol, boolean>)[SIGNAL_ACCESSOR] = true;
  return fn as unknown as MarkedSignalAccessor<T>;
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
        result += escapeHtml(v());
      } else if (typeof v === "function") {
        result += escapeHtml((v as () => unknown)());
      } else {
        result += escapeHtml(v);
      }
    }
  }
  return dedentString(result);
}

// ─────────────────────────────────────────────
// Context registry
// ─────────────────────────────────────────────

type ContextSignal<T> = { (): T; (value: T): void };
const contextRegistry = new Map<string, ContextSignal<unknown>>();

function ilhaContext<T>(key: string, initial: T): ContextSignal<T> {
  if (contextRegistry.has(key)) return contextRegistry.get(key) as ContextSignal<T>;
  const s = signal(initial);
  const accessor = (...args: unknown[]): unknown => {
    if (args.length === 0) return s();
    s(args[0] as T);
  };
  contextRegistry.set(key, accessor as ContextSignal<unknown>);
  return accessor as ContextSignal<T>;
}

// ─────────────────────────────────────────────
// Derived
// ─────────────────────────────────────────────

export interface DerivedValue<T> {
  loading: boolean;
  value: T | undefined;
  error: Error | undefined;
}

type DerivedFnContext<TInput, TStateMap extends Record<string, unknown>> = {
  state: IslandState<TStateMap>;
  input: TInput;
  signal: AbortSignal;
};

type DerivedFn<TInput, TStateMap extends Record<string, unknown>, V> = (
  ctx: DerivedFnContext<TInput, TStateMap>,
) => V | Promise<V>;

interface DerivedEntry<TInput, TStateMap extends Record<string, unknown>> {
  key: string;
  fn: DerivedFn<TInput, TStateMap, unknown>;
}

export type IslandDerived<TDerivedMap extends Record<string, unknown>> = {
  readonly [K in keyof TDerivedMap]: DerivedValue<TDerivedMap[K]>;
};

function makePlainDerived<TDerivedMap extends Record<string, unknown>>(
  entries: DerivedEntry<unknown, Record<string, unknown>>[],
  state: Record<string, unknown>,
  input: unknown,
): IslandDerived<TDerivedMap> {
  const derived: Record<string, DerivedValue<unknown>> = {};
  for (const entry of entries) {
    const result = entry.fn({ state: state as never, input, signal: new AbortController().signal });
    if (result instanceof Promise) {
      derived[entry.key] = { loading: true, value: undefined, error: undefined };
    } else {
      derived[entry.key] = { loading: false, value: result, error: undefined };
    }
  }
  return derived as IslandDerived<TDerivedMap>;
}

function buildDerivedSignals<
  TInput,
  TStateMap extends Record<string, unknown>,
  TDerivedMap extends Record<string, unknown>,
>(
  entries: DerivedEntry<TInput, TStateMap>[],
  state: IslandState<TStateMap>,
  input: TInput,
  derivedSnapshot?: Record<string, DerivedValue<unknown>>,
): { proxy: IslandDerived<TDerivedMap>; stop: () => void } {
  const envelopes = new Map<string, ReturnType<typeof signal<DerivedValue<unknown>>>>();
  const stops: Array<() => void> = [];

  for (const entry of entries) {
    const initialEnvelope: DerivedValue<unknown> = derivedSnapshot?.[entry.key] ?? {
      loading: true,
      value: undefined,
      error: undefined,
    };
    const env = signal<DerivedValue<unknown>>(initialEnvelope);
    envelopes.set(entry.key, env);
    let ac = new AbortController();

    // If we restored from a snapshot, skip the very first run of the effect
    // (the server already computed this value). The effect will still fire on
    // subsequent reactive state changes.
    let skipFirst = derivedSnapshot != null && entry.key in derivedSnapshot;

    const stopEffect = effect(() => {
      if (skipFirst) {
        skipFirst = false;
        return;
      }

      ac.abort();
      ac = new AbortController();
      const currentAc = ac;
      const result = entry.fn({ state, input, signal: currentAc.signal });

      if (!(result instanceof Promise)) {
        const prevSub = setActiveSub(undefined);
        env({ loading: false, value: result as unknown, error: undefined });
        setActiveSub(prevSub);
        return;
      }

      const prevSub = setActiveSub(undefined);
      const prevVal = env();
      env({ loading: true, value: prevVal.value, error: undefined });
      setActiveSub(prevSub);

      result
        .then((value) => {
          if (currentAc.signal.aborted) return;
          env({ loading: false, value, error: undefined });
        })
        .catch((err: unknown) => {
          if (currentAc.signal.aborted) return;
          env({
            loading: false,
            value: undefined,
            error: err instanceof Error ? err : new Error(String(err)),
          });
        });
    });

    stops.push(() => {
      stopEffect();
      ac.abort();
    });
  }

  const proxy = new Proxy({} as IslandDerived<TDerivedMap>, {
    get(_, key: string) {
      const env = envelopes.get(key);
      if (!env) return { loading: false, value: undefined, error: undefined };
      return env();
    },
  });

  return { proxy, stop: () => stops.forEach((s) => s()) };
}

// ─────────────────────────────────────────────
// Bind
// ─────────────────────────────────────────────

type ExternalSignal<T = unknown> = { (): T; (value: T): void };

interface BindEntry<TStateMap extends Record<string, unknown>> {
  selector: string;
  target: (keyof TStateMap & string) | ExternalSignal;
}

function resolveBindConfig(el: Element): {
  prop: "value" | "checked" | "valueAsNumber";
  event: string;
  read: (el: Element) => unknown;
  write: (el: Element, value: unknown) => void;
} {
  const tag = el.tagName.toLowerCase();
  const type = (el as HTMLInputElement).type?.toLowerCase() ?? "";

  if (tag === "input" && type === "checkbox") {
    return {
      prop: "checked",
      event: "change",
      read: (el) => (el as HTMLInputElement).checked,
      write: (el, v) => ((el as HTMLInputElement).checked = Boolean(v)),
    };
  }
  if (tag === "input" && type === "radio") {
    return {
      prop: "checked",
      event: "change",
      read: (el) => {
        const input = el as HTMLInputElement;
        return input.checked ? input.value : undefined;
      },
      write: (el, v) => {
        (el as HTMLInputElement).checked = String(v ?? "") === (el as HTMLInputElement).value;
      },
    };
  }
  if (tag === "input" && type === "number") {
    return {
      prop: "valueAsNumber",
      event: "input",
      read: (el) => (el as HTMLInputElement).valueAsNumber,
      write: (el, v) => ((el as HTMLInputElement).value = String(v ?? "")),
    };
  }
  return {
    prop: "value",
    event: tag === "select" ? "change" : "input",
    read: (el) => (el as HTMLInputElement).value,
    write: (el, v) => ((el as HTMLInputElement).value = String(v ?? "")),
  };
}

function applyBindings<TStateMap extends Record<string, unknown>>(
  host: Element,
  bindings: BindEntry<TStateMap>[],
  state: IslandState<TStateMap>,
): () => void {
  const cleanups: Array<() => void> = [];
  for (const binding of bindings) {
    const accessor: ExternalSignal =
      typeof binding.target === "function"
        ? binding.target
        : (state[binding.target as keyof TStateMap] as ExternalSignal);

    const targets =
      binding.selector === ""
        ? [host]
        : Array.from(host.querySelectorAll<Element>(binding.selector));

    for (const target of targets) {
      const { event, read, write } = resolveBindConfig(target);
      const isRadio =
        (target as HTMLInputElement).tagName.toLowerCase() === "input" &&
        (target as HTMLInputElement).type?.toLowerCase() === "radio";
      write(target, accessor());

      const listener = () => {
        const raw = read(target);
        if (isRadio && raw === undefined) return;
        const currentVal = accessor();
        let value: unknown;
        if (typeof currentVal === "number") {
          const n = Number(raw);
          value = isNaN(n) ? 0 : n;
        } else if (typeof currentVal === "boolean") {
          value = Boolean(raw);
        } else {
          value = raw;
        }
        (accessor as (v: unknown) => void)(value);
      };

      target.addEventListener(event, listener);
      cleanups.push(() => target.removeEventListener(event, listener));
    }
  }
  return () => cleanups.forEach((c) => c());
}

// ─────────────────────────────────────────────
// Core types
// ─────────────────────────────────────────────

export type SignalAccessor<T> = MarkedSignalAccessor<T>;

type MergeState<TStateMap extends Record<string, unknown>, K extends string, V> = {
  [P in keyof TStateMap as P extends K ? never : P]-?: TStateMap[P];
} & Record<K, V>;

export type IslandState<TStateMap extends Record<string, unknown>> = {
  readonly [K in keyof TStateMap]-?: SignalAccessor<TStateMap[K]>;
};

// ─────────────────────────────────────────────
// Hydratable options
// ─────────────────────────────────────────────

export interface HydratableOptions {
  /** Value for data-ilha — used by ilha.mount() registry on the client. */
  name: string;
  /** Wrapper element tag. Default: "div". */
  as?: string;
  /**
   * Serialize resolved state and/or derived values into data-ilha-state so the
   * client can skip redundant initialisation work.
   *
   * - true              → snapshot both state signals and derived envelopes
   * - { state }         → snapshot only signal values
   * - { derived }       → snapshot only derived envelopes (skip first fetch)
   * - false / omitted   → no snapshot (default)
   */
  snapshot?: boolean | { state?: boolean; derived?: boolean };
  /**
   * When a snapshot is present, suppress the onMount handlers on the client.
   * Default: true when any snapshot is active.
   */
  skipOnMount?: boolean;
}

export interface Island<
  TInput = Record<string, unknown>,
  _TStateMap extends Record<string, unknown> = Record<string, unknown>,
> {
  (props?: Partial<TInput>): string | Promise<string>;
  toString(props?: Partial<TInput>): string;
  mount(host: Element, props?: Partial<TInput>): () => void;
  hydratable(props: Partial<TInput>, options: HydratableOptions): Promise<string>;
}

type AnyIsland = Island<Record<string, unknown>, Record<string, unknown>>;
type SlotMap = Record<string, AnyIsland>;

type SlotsProxy<TSlots extends SlotMap> = {
  readonly [K in keyof TSlots]: SlotAccessor;
};

type RenderContext<
  TInput,
  TStateMap extends Record<string, unknown>,
  TDerivedMap extends Record<string, unknown>,
  TSlots extends SlotMap,
> = {
  state: IslandState<TStateMap>;
  derived: IslandDerived<TDerivedMap>;
  input: TInput;
  slots: SlotsProxy<TSlots>;
};

type EffectContext<TInput, TStateMap extends Record<string, unknown>> = {
  state: IslandState<TStateMap>;
  input: TInput;
  host: Element;
};

export type OnMountContext<
  TInput,
  TStateMap extends Record<string, unknown>,
  TDerivedMap extends Record<string, unknown> = Record<string, never>,
> = {
  state: IslandState<TStateMap>;
  derived: IslandDerived<TDerivedMap>;
  input: TInput;
  host: Element;
  /** True when the island was restored from a server-side snapshot. */
  hydrated: boolean;
};

export type HandlerContext<TInput, TStateMap extends Record<string, unknown>> = {
  state: IslandState<TStateMap>;
  input: TInput;
  host: Element;
  target: Element;
  event: Event;
};

// ─────────────────────────────────────────────
// .on() event autocomplete types
// ─────────────────────────────────────────────

type HTMLEventName = keyof HTMLElementEventMap & string;
type Modifier = "once" | "capture" | "passive";
type WithModifiers<E extends string> =
  | E
  | `${E}:${Modifier}`
  | `${E}:${Modifier}:${Modifier}`
  | `${E}:${Modifier}:${Modifier}:${Modifier}`;

type OnSelectorString =
  | `@${WithModifiers<HTMLEventName>}`
  | `${string}@${WithModifiers<HTMLEventName>}`;

export type HandlerContextFor<
  TInput,
  TStateMap extends Record<string, unknown>,
  TEventName extends string,
> = {
  state: IslandState<TStateMap>;
  input: TInput;
  host: Element;
  target: TEventName extends keyof HTMLElementEventMap
    ? HTMLElementEventMap[TEventName]["target"] extends Element | null
      ? NonNullable<HTMLElementEventMap[TEventName]["target"]>
      : Element
    : Element;
  event: TEventName extends keyof HTMLElementEventMap ? HTMLElementEventMap[TEventName] : Event;
};

// ─────────────────────────────────────────────
// State init type
// ─────────────────────────────────────────────

type StateInit<TInput, V> = V | ((input: TInput) => V);

interface StateEntry<TInput> {
  key: string;
  init: StateInit<TInput, unknown>;
}

// ─────────────────────────────────────────────
// Event modifier parsing
// ─────────────────────────────────────────────

interface ParsedOn {
  selector: string;
  eventType: string;
  options: AddEventListenerOptions;
}

function parseOnArgs(selectorOrCombined: string): ParsedOn {
  const atIdx = selectorOrCombined.lastIndexOf("@");
  const selector = atIdx === -1 ? "" : selectorOrCombined.slice(0, atIdx);
  const rawEvent = atIdx === -1 ? selectorOrCombined : selectorOrCombined.slice(atIdx + 1);
  const parts = rawEvent.split(":");
  const eventType = parts[0]!;
  const modifiers = new Set(parts.slice(1));
  return {
    selector,
    eventType,
    options: {
      once: modifiers.has("once"),
      capture: modifiers.has("capture"),
      passive: modifiers.has("passive"),
    },
  };
}

interface OnEntry<TInput, TStateMap extends Record<string, unknown>> {
  selector: string;
  event: string;
  options: AddEventListenerOptions;
  handler: (ctx: HandlerContext<TInput, TStateMap>) => void | Promise<void>;
}

interface EffectEntry<TInput, TStateMap extends Record<string, unknown>> {
  fn: (ctx: EffectContext<TInput, TStateMap>) => (() => void) | void;
}

interface OnMountEntry<
  TInput,
  TStateMap extends Record<string, unknown>,
  TDerivedMap extends Record<string, unknown>,
> {
  fn: (ctx: OnMountContext<TInput, TStateMap, TDerivedMap>) => (() => void) | void;
}

interface TransitionOptions {
  enter?: (host: Element) => Promise<void> | void;
  leave?: (host: Element) => Promise<void> | void;
}

export interface MountOptions {
  root?: Element;
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
  TDerivedMap extends Record<string, unknown> = Record<string, never>,
  TSlots extends SlotMap = Record<string, never>,
> {
  readonly _schema: StandardSchemaV1 | null;
  readonly _states: StateEntry<TInput>[];
  readonly _deriveds: DerivedEntry<TInput, TStateMap>[];
  readonly _ons: OnEntry<TInput, TStateMap>[];
  readonly _effects: EffectEntry<TInput, TStateMap>[];
  readonly _onMounts: OnMountEntry<TInput, TStateMap, TDerivedMap>[];
  readonly _slots: Record<string, AnyIsland>;
  readonly _transition: TransitionOptions | null;
  readonly _binds: BindEntry<TStateMap>[];

  constructor(
    schema: StandardSchemaV1 | null,
    states: StateEntry<TInput>[],
    deriveds: DerivedEntry<TInput, TStateMap>[],
    ons: OnEntry<TInput, TStateMap>[],
    effects: EffectEntry<TInput, TStateMap>[],
    onMounts: OnMountEntry<TInput, TStateMap, TDerivedMap>[],
    slots: Record<string, AnyIsland>,
    transition: TransitionOptions | null,
    binds: BindEntry<TStateMap>[],
  ) {
    this._schema = schema;
    this._states = states;
    this._deriveds = deriveds;
    this._ons = ons;
    this._effects = effects;
    this._onMounts = onMounts;
    this._slots = slots;
    this._transition = transition;
    this._binds = binds;
  }

  input<S extends StandardSchemaV1>(
    schema: S,
  ): IlhaBuilder<
    StandardSchemaV1.InferOutput<S> & Record<string, unknown>,
    Record<string, never>,
    Record<string, never>,
    Record<string, never>
  > {
    return new IlhaBuilder<
      StandardSchemaV1.InferOutput<S> & Record<string, unknown>,
      Record<string, never>,
      Record<string, never>,
      Record<string, never>
    >(schema, [], [], [], [], [], {}, null, []);
  }

  state<V = undefined, K extends string = string>(
    key: K,
    init?: StateInit<TInput, V> | undefined,
  ): IlhaBuilder<TInput, MergeState<TStateMap, K, V>, TDerivedMap, TSlots> {
    return new IlhaBuilder<TInput, MergeState<TStateMap, K, V>, TDerivedMap, TSlots>(
      this._schema,
      [...this._states, { key, init: init as StateInit<TInput, unknown> }],
      this._deriveds as unknown as DerivedEntry<TInput, MergeState<TStateMap, K, V>>[],
      this._ons as unknown as OnEntry<TInput, MergeState<TStateMap, K, V>>[],
      this._effects as unknown as EffectEntry<TInput, MergeState<TStateMap, K, V>>[],
      this._onMounts as unknown as OnMountEntry<TInput, MergeState<TStateMap, K, V>, TDerivedMap>[],
      this._slots,
      this._transition,
      this._binds as unknown as BindEntry<MergeState<TStateMap, K, V>>[],
    );
  }

  derived<K extends string, V>(
    key: K,
    fn: DerivedFn<TInput, TStateMap, V>,
  ): IlhaBuilder<TInput, TStateMap, TDerivedMap & Record<K, V>, TSlots> {
    return new IlhaBuilder<TInput, TStateMap, TDerivedMap & Record<K, V>, TSlots>(
      this._schema,
      this._states,
      [...this._deriveds, { key, fn: fn as DerivedFn<TInput, TStateMap, unknown> }],
      this._ons,
      this._effects,
      this._onMounts as unknown as OnMountEntry<TInput, TStateMap, TDerivedMap & Record<K, V>>[],
      this._slots,
      this._transition,
      this._binds,
    );
  }

  bind(
    selector: string,
    stateKey: keyof TStateMap & string,
  ): IlhaBuilder<TInput, TStateMap, TDerivedMap, TSlots>;
  bind<T>(
    selector: string,
    externalSignal: ExternalSignal<T>,
  ): IlhaBuilder<TInput, TStateMap, TDerivedMap, TSlots>;
  bind(
    selector: string,
    target: (keyof TStateMap & string) | ExternalSignal,
  ): IlhaBuilder<TInput, TStateMap, TDerivedMap, TSlots> {
    return new IlhaBuilder<TInput, TStateMap, TDerivedMap, TSlots>(
      this._schema,
      this._states,
      this._deriveds,
      this._ons,
      this._effects,
      this._onMounts,
      this._slots,
      this._transition,
      [...this._binds, { selector, target }],
    );
  }

  on<S extends OnSelectorString>(
    selectorOrCombined: S,
    handler: (
      ctx: S extends `${string}@${infer E}:${string}`
        ? HandlerContextFor<TInput, TStateMap, E>
        : S extends `${string}@${infer E}`
          ? HandlerContextFor<TInput, TStateMap, E>
          : HandlerContext<TInput, TStateMap>,
    ) => void | Promise<void>,
  ): IlhaBuilder<TInput, TStateMap, TDerivedMap, TSlots>;
  on(
    selectorOrCombined: string,
    handler: (ctx: HandlerContext<TInput, TStateMap>) => void | Promise<void>,
  ): IlhaBuilder<TInput, TStateMap, TDerivedMap, TSlots>;
  on(
    selectorOrCombined: string,
    handler: (ctx: HandlerContext<TInput, TStateMap>) => void | Promise<void>,
  ): IlhaBuilder<TInput, TStateMap, TDerivedMap, TSlots> {
    const parsed = parseOnArgs(selectorOrCombined);
    return new IlhaBuilder<TInput, TStateMap, TDerivedMap, TSlots>(
      this._schema,
      this._states,
      this._deriveds,
      [
        ...this._ons,
        {
          selector: parsed.selector,
          event: parsed.eventType,
          options: parsed.options,
          handler: handler as (ctx: HandlerContext<TInput, TStateMap>) => void | Promise<void>,
        },
      ],
      this._effects,
      this._onMounts,
      this._slots,
      this._transition,
      this._binds,
    );
  }

  effect(
    fn: (ctx: EffectContext<TInput, TStateMap>) => (() => void) | void,
  ): IlhaBuilder<TInput, TStateMap, TDerivedMap, TSlots> {
    return new IlhaBuilder<TInput, TStateMap, TDerivedMap, TSlots>(
      this._schema,
      this._states,
      this._deriveds,
      this._ons,
      [...this._effects, { fn }],
      this._onMounts,
      this._slots,
      this._transition,
      this._binds,
    );
  }

  onMount(
    fn: (ctx: OnMountContext<TInput, TStateMap, TDerivedMap>) => (() => void) | void,
  ): IlhaBuilder<TInput, TStateMap, TDerivedMap, TSlots> {
    return new IlhaBuilder<TInput, TStateMap, TDerivedMap, TSlots>(
      this._schema,
      this._states,
      this._deriveds,
      this._ons,
      this._effects,
      [...this._onMounts, { fn }],
      this._slots,
      this._transition,
      this._binds,
    );
  }

  slot<K extends string>(
    name: K,
    island: AnyIsland,
  ): IlhaBuilder<TInput, TStateMap, TDerivedMap, TSlots & Record<K, AnyIsland>> {
    return new IlhaBuilder<TInput, TStateMap, TDerivedMap, TSlots & Record<K, AnyIsland>>(
      this._schema,
      this._states,
      this._deriveds,
      this._ons,
      this._effects,
      this._onMounts,
      { ...this._slots, [name]: island },
      this._transition,
      this._binds,
    );
  }

  transition(opts: TransitionOptions): IlhaBuilder<TInput, TStateMap, TDerivedMap, TSlots> {
    return new IlhaBuilder<TInput, TStateMap, TDerivedMap, TSlots>(
      this._schema,
      this._states,
      this._deriveds,
      this._ons,
      this._effects,
      this._onMounts,
      this._slots,
      opts,
      this._binds,
    );
  }

  render(
    fn: (ctx: RenderContext<TInput, TStateMap, TDerivedMap, TSlots>) => string,
  ): Island<TInput, TStateMap> {
    const schema = this._schema;
    const states = this._states;
    const deriveds = this._deriveds;
    const ons = this._ons;
    const effects = this._effects;
    const onMounts = this._onMounts;
    const slotDefs = this._slots;
    const transition = this._transition;
    const binds = this._binds;

    function resolveInput(props?: Partial<TInput>): TInput {
      const value = props ?? {};
      if (!schema) return value as TInput;
      return validateSchema(schema, value) as TInput;
    }

    function makeSlotsProxy(ssr: boolean, host?: Element): SlotsProxy<TSlots> {
      return new Proxy(
        {},
        {
          get(_, prop: string) {
            const name = String(prop);
            if (!slotDefs[name]) return makeSlotAccessor(() => "");
            if (ssr) {
              return makeSlotAccessor((props?: Record<string, unknown>) =>
                slotDefs[name]!.toString(props),
              );
            }
            return makeSlotAccessor((props?: Record<string, unknown>) => {
              // On re-renders, mirror the live slot element's current outerHTML
              // back into the string so morphlex sees no diff and leaves it alone.
              const liveSlot = host?.querySelector(`[${SLOT_ATTR}="${escapeHtml(name)}"]`);
              if (liveSlot) return liveSlot.outerHTML;

              // First render — emit the empty placeholder as before
              const json = props ? ` ${PROPS_ATTR}='${escapeHtml(JSON.stringify(props))}'` : "";
              return `<div ${SLOT_ATTR}="${escapeHtml(name)}"${json}></div>`;
            });
          },
        },
      ) as SlotsProxy<TSlots>;
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

    function renderToString(props?: Partial<TInput>): string | Promise<string> {
      const input = resolveInput(props);
      const state = buildPlainState(input);
      const slots = makeSlotsProxy(true);

      const results = deriveds.map((entry) => {
        try {
          return {
            key: entry.key,
            result: entry.fn({
              state: state as never,
              input,
              signal: new AbortController().signal,
            }),
          };
        } catch (err) {
          return { key: entry.key, result: Promise.reject(err) };
        }
      });

      const hasAsync = results.some((r) => r.result instanceof Promise);

      if (!hasAsync) {
        const derived: Record<string, DerivedValue<unknown>> = {};
        for (const r of results)
          derived[r.key] = { loading: false, value: r.result as unknown, error: undefined };
        return fn({ state, derived: derived as IslandDerived<TDerivedMap>, input, slots });
      }

      return Promise.all(
        results.map(async (r) => {
          try {
            return {
              key: r.key,
              envelope: {
                loading: false,
                value: await Promise.resolve(r.result),
                error: undefined,
              } satisfies DerivedValue<unknown>,
            };
          } catch (err) {
            return {
              key: r.key,
              envelope: {
                loading: false,
                value: undefined,
                error: err instanceof Error ? err : new Error(String(err)),
              } satisfies DerivedValue<unknown>,
            };
          }
        }),
      ).then((resolved) => {
        const derived: Record<string, DerivedValue<unknown>> = {};
        for (const r of resolved) derived[r.key] = r.envelope;
        return fn({ state, derived: derived as IslandDerived<TDerivedMap>, input, slots });
      });
    }

    function renderToStringSyncOnly(props?: Partial<TInput>): string {
      const input = resolveInput(props);
      const state = buildPlainState(input);
      const slots = makeSlotsProxy(true);
      const derived = makePlainDerived<TDerivedMap>(
        deriveds as DerivedEntry<unknown, Record<string, unknown>>[],
        state as unknown as Record<string, unknown>,
        input,
      );
      return fn({ state, derived, input, slots });
    }

    function mountIsland(host: Element, props?: Partial<TInput>): () => void {
      if (props === undefined) {
        const rawProps = host.getAttribute(PROPS_ATTR);
        if (rawProps) {
          try {
            props = JSON.parse(rawProps) as Partial<TInput>;
          } catch {
            console.warn("[ilha] Failed to parse data-ilha-props");
          }
        }
      }

      const input = resolveInput(props);

      let snapshotRaw: Record<string, unknown> | undefined;
      const rawState = host.getAttribute(STATE_ATTR);
      if (rawState) {
        try {
          snapshotRaw = JSON.parse(rawState) as Record<string, unknown>;
        } catch {
          console.warn("[ilha] Failed to parse data-ilha-state");
        }
      }

      const stateSnapshot = snapshotRaw
        ? (Object.fromEntries(
            Object.entries(snapshotRaw).filter(([k]) => k !== "_derived" && k !== "_skipOnMount"),
          ) as Record<string, unknown>)
        : undefined;

      const derivedSnapshot = snapshotRaw?._derived as
        | Record<string, DerivedValue<unknown>>
        | undefined;

      const hydrated = snapshotRaw != null;
      const state = buildSignalState(input, stateSnapshot);
      const cleanups: Array<() => void> = [];

      if (transition?.enter) {
        const result = transition.enter(host);
        if (result instanceof Promise) result.catch(console.error);
      }

      const { proxy: derived, stop: stopDerived } = buildDerivedSignals<
        TInput,
        TStateMap,
        TDerivedMap
      >(deriveds as DerivedEntry<TInput, TStateMap>[], state, input, derivedSnapshot);
      cleanups.push(stopDerived);

      // ─── slot bookkeeping ───────────────────────────────────────────────
      // Idiomorph morphs slot placeholder divs in-place, so we no longer need
      // to snapshot/restore them manually — morph preserves existing DOM nodes
      // that match by identity. We still track mounted child islands so we can
      // unmount them on cleanup.
      const slotCleanups = new Map<string, () => void>();
      const slotEls = new Map<string, Element>(); // ← track live element refs

      function mountSlots() {
        for (const [name, childIsland] of Object.entries(slotDefs)) {
          const slotEl = host.querySelector(`[${SLOT_ATTR}="${name}"]`);
          if (!slotEl) continue;

          // If morphlex kept the same node alive, the child island is still
          // running — don't remount it.
          if (slotEls.get(name) === slotEl) continue;

          slotEls.set(name, slotEl);
          slotCleanups.get(name)?.();

          let slotProps: Record<string, unknown> | undefined;
          const rawProps = slotEl.getAttribute(PROPS_ATTR) ?? slotEl.getAttribute("data-props");
          if (rawProps) {
            try {
              slotProps = JSON.parse(rawProps) as Record<string, unknown>;
            } catch {
              console.warn(`[ilha] Failed to parse props on [${SLOT_ATTR}="${name}"]`);
            }
          }

          slotCleanups.set(name, childIsland.mount(slotEl, slotProps));
        }
      }

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
          if (entry.options.once && firedOnce.has(entry)) continue;
          const targets =
            entry.selector === "" ? [host] : Array.from(host.querySelectorAll(entry.selector));
          targets.forEach((listenerTarget) => {
            const listener = (event: Event) => {
              if (entry.options.once) {
                firedOnce.add(entry);
                for (const l of listeners.filter((l) => l.entry === entry)) {
                  l.target.removeEventListener(l.type, l.fn, l.options);
                }
                listeners.splice(
                  0,
                  listeners.length,
                  ...listeners.filter((l) => l.entry !== entry),
                );
              }
              const eventTarget = (
                event.target instanceof Element ? event.target : listenerTarget
              ) as Element;
              const result = entry.handler({ state, input, host, target: eventTarget, event });
              if (result instanceof Promise) result.catch(console.error);
            };
            const opts = { ...entry.options, once: false };
            listenerTarget.addEventListener(entry.event, listener, opts);
            listeners.push({
              target: listenerTarget,
              type: entry.event,
              fn: listener,
              options: opts,
              entry,
            });
          });
        }
      }

      function detachListeners() {
        for (const l of listeners) l.target.removeEventListener(l.type, l.fn, l.options);
        listeners.length = 0;
      }

      const slots = makeSlotsProxy(false, host);

      // ─── initial render ─────────────────────────────────────────────────
      // First paint can still use innerHTML — nothing to preserve yet.
      host.innerHTML = fn({ state, derived, input, slots });
      attachListeners();

      let stopBindings = applyBindings(host, binds as BindEntry<TStateMap>[], state);
      cleanups.push(() => stopBindings());

      mountSlots();
      cleanups.push(() => slotCleanups.forEach((unmount) => unmount()));

      // Run onMount callbacks
      for (const entry of onMounts) {
        const prevSub = setActiveSub(undefined);
        let userCleanup: (() => void) | void;
        try {
          userCleanup = entry.fn({ state, derived, input, host, hydrated });
        } finally {
          setActiveSub(prevSub);
        }
        if (userCleanup) cleanups.push(userCleanup);
      }

      // ─── reactive re-render via morph ────────────────────────────────────
      // Idiomorph diffs the new HTML string against the live DOM, patching only
      // what changed. Focused inputs, scroll positions, and child island nodes
      // survive intact. After each morph we re-attach listeners and bindings
      // (same as before) and re-mount any slot children whose placeholder node
      // may have been recreated by the morph.
      let initialized = false;
      const stopRender = effect(() => {
        const html = fn({ state, derived, input, slots });
        if (!initialized) {
          initialized = true;
          return;
        }

        detachListeners();
        stopBindings();

        const tpl = document.createElement("template");
        tpl.innerHTML = `<div>${html}</div>`;
        morphInner(host, tpl.content.firstElementChild as Element);

        attachListeners();
        stopBindings = applyBindings(host, binds as BindEntry<TStateMap>[], state);

        // Re-mount slots whose placeholder may have been morphed away
        mountSlots();
      });
      cleanups.push(stopRender);
      cleanups.push(detachListeners);

      for (const entry of effects) {
        let userCleanup: (() => void) | void;
        const stopEffect = effect(() => {
          if (userCleanup) {
            userCleanup();
            userCleanup = undefined;
          }
          userCleanup = entry.fn({ state, input, host });
        });
        cleanups.push(() => {
          stopEffect();
          if (userCleanup) userCleanup();
        });
      }

      return () => {
        if (transition?.leave) {
          const result = transition.leave(host);
          if (result instanceof Promise) {
            result.then(() => cleanups.forEach((c) => c())).catch(console.error);
            return;
          }
        }
        cleanups.forEach((c) => c());
      };
    }

    const island = function (props?: Partial<TInput>): string | Promise<string> {
      return renderToString(props);
    } as Island<TInput, TStateMap>;

    island.toString = (props?: Partial<TInput>) => renderToStringSyncOnly(props);
    island.mount = (host: Element, props?: Partial<TInput>) => mountIsland(host, props);

    island.hydratable = async (
      props: Partial<TInput>,
      opts: HydratableOptions,
    ): Promise<string> => {
      const { name, as: tag = "div", snapshot = false, skipOnMount: explicitSkipOnMount } = opts;

      const resolvedProps = props ?? {};
      const inner = await renderToString(resolvedProps);
      const encodedProps = escapeHtml(JSON.stringify(resolvedProps));

      let stateAttr = "";

      if (snapshot !== false) {
        const doState = snapshot === true || (snapshot as { state?: boolean }).state !== false;
        const doDerived =
          snapshot === true || (snapshot as { derived?: boolean }).derived !== false;
        const doSkipOnMount = explicitSkipOnMount ?? (doState || doDerived);

        const snapshotData: Record<string, unknown> = {};
        const input = resolveInput(resolvedProps);
        const plainState = buildPlainState(input);

        if (doState) {
          for (const entry of states) {
            snapshotData[entry.key] = (
              plainState[entry.key as keyof typeof plainState] as () => unknown
            )();
          }
        }

        if (doDerived) {
          const derivedResults: Record<string, unknown> = {};
          for (const entry of deriveds) {
            try {
              const result = await Promise.resolve(
                entry.fn({
                  state: plainState as never,
                  input,
                  signal: new AbortController().signal,
                }),
              );
              derivedResults[entry.key] = { loading: false, value: result, error: undefined };
            } catch (err) {
              derivedResults[entry.key] = {
                loading: false,
                value: undefined,
                error: err instanceof Error ? err.message : String(err),
              };
            }
          }
          snapshotData["_derived"] = derivedResults;
        }

        if (doSkipOnMount) snapshotData["_skipOnMount"] = true;

        stateAttr = ` ${STATE_ATTR}='${escapeHtml(JSON.stringify(snapshotData))}'`;
      }

      return `<${tag} data-ilha="${escapeHtml(name)}" ${PROPS_ATTR}='${encodedProps}'${stateAttr}>${inner}</${tag}>`;
    };

    return island;
  }
}

// ─────────────────────────────────────────────
// ilha.from
// ─────────────────────────────────────────────

function ilhaFrom<TInput, TStateMap extends Record<string, unknown>>(
  selector: string | Element,
  island: Island<TInput, TStateMap>,
  props?: Partial<TInput>,
): (() => void) | null {
  const host = typeof selector === "string" ? document.querySelector(selector) : selector;
  if (!host) {
    console.warn(`[ilha] from(): element not found: ${selector}`);
    return null;
  }
  return island.mount(host, props);
}

// ─────────────────────────────────────────────
// ilha.mount — auto-discovery
// ─────────────────────────────────────────────

type IslandRegistry = Record<string, AnyIsland>;

function mountAll(registry: IslandRegistry, options: MountOptions = {}): MountResult {
  const root = options.root ?? document.body;
  const lazy = options.lazy ?? false;
  const unmounts: Array<() => void> = [];

  function activateEl(host: Element) {
    const name = host.getAttribute("data-ilha");
    if (!name) return;
    const island = registry[name];
    if (!island) return;

    let props: Record<string, unknown> = {};
    const rawProps = host.getAttribute(PROPS_ATTR);
    if (rawProps) {
      try {
        props = JSON.parse(rawProps) as Record<string, unknown>;
      } catch {
        console.warn(`[ilha] Failed to parse ${PROPS_ATTR} on [data-ilha="${name}"]`);
      }
    }

    unmounts.push(island.mount(host, props));
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
  Record<string, never>,
  Record<string, never>
>(null, [], [], [], [], [], {}, null, []);

const ilha = Object.assign(rootBuilder, {
  html: ilhaHtml,
  raw: ilhaRaw,
  mount: mountAll,
  from: ilhaFrom,
  context: ilhaContext,
});

export function type<TInput, TOutput = TInput>(
  coerce?: (input: TInput) => TOutput,
): StandardSchemaV1<TInput, TOutput> {
  return {
    "~standard": {
      version: 1,
      vendor: "ilha",
      validate(value: unknown) {
        return {
          value: coerce ? coerce(value as TInput) : (value as TOutput),
        };
      },
    },
  };
}

export const html = ilhaHtml;
export const raw = ilhaRaw;
export const mount = mountAll;
export const from = ilhaFrom;
export const context = ilhaContext;
export default ilha;

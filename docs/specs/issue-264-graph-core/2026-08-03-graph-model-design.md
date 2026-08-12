# graph-core: Graph Model — Design Spec

**Date:** 2026-08-03
**Issue:** #266 (graph-core: graph model — nodes, edges, containment tree)
**Parent:** #264 (Phase 1A — graph-core)
**Parent spec:** `specs/2026-08-01-visual-diagram-editor-design.md` (§3.1, §3.2)
**Status:** Approved

---

## 1. Scope

Core data model for `@casehubio/graph-core`: typed node and edge
representations with a containment tree for hierarchical layout. This is
issue #266 — the first of five graph-core issues.

The model is domain-agnostic. No CaseHub-specific types. Consumed by
domain adapters (producers) and graph-renderer (consumer → React Flow
conversion).

**Out of scope for this issue:** `NodeDecoration` (generic decoration
model) and `PropertySchema` (JSON Schema type alias) are graph-core
type contracts assigned by the parent spec (§3.1). They are tracked
by #277, not this issue — they support the stencil rendering layer,
not the graph model.

## 2. Decisions

### 2.1 Plain interfaces + standalone functions

The model uses TypeScript interfaces (not classes) with standalone
functions for traversal and queries.

**Rationale:**
- Structural typing — any object matching the shape works. Domain
  adapters return `{ nodes, edges }` directly without constructing a class.
- Tree-shakeable — consumers import only the functions they use.
- No class identity issues across package boundaries.
- Easier testing — test data is a plain object literal.
- Matches the codebase — `pages-data` uses interfaces + functions, not
  classes for data models.

### 2.2 Immutability via readonly + spread-copy

Compile-time `readonly` on all fields and arrays. Edits produce new
instances via the spread operator. No runtime immutability library.

At the expected scale (tens to low hundreds of nodes, user-speed edits),
spread-copy is trivially fast. Structural sharing (Immer, persistent
data structures) adds dependency weight for no measurable benefit.

### 2.3 Array storage, not Maps

Nodes and edges are stored as `readonly` arrays. Lookup indices (by ID)
are built on demand by query functions. Arrays are simpler to serialize,
easier to spread-copy, and convert directly to React Flow arrays.

O(n) scans are acceptable at this scale. If profiling ever shows a
bottleneck, a reference-keyed cache (e.g., `WeakMap<GraphModel,
Index>`) can be added without changing the API — the functions
already return derived data, and immutable spread-copy construction
guarantees each edit produces a distinct model reference suitable
as a cache key.

### 2.4 Zero dependencies

`graph-core` depends on nothing — no `pages-data`, no `lit`, no `zod`.
Pure TypeScript. It serves a dual role in the graph package family:
the data model for this issue (nodes, edges, containment tree), and
the shared contract hub for cross-cutting types that multiple graph
packages consume (StencilGrammar #267, PersistenceBackend #270,
NodeDecoration and PropertySchema #277 — each tracked by its own
issue). The zero-dependency position makes graph-core the natural
home for shared contracts: any package in the family can depend on
graph-core without pulling in transitive dependencies.

## 3. Types

```typescript
interface GraphNode {
  readonly id: string;
  readonly type: string;
  readonly parentId?: string;
  readonly properties: Readonly<Record<string, unknown>>;
}

interface GraphEdge {
  readonly id: string;
  readonly type: string;
  readonly source: string;
  readonly target: string;
  readonly properties?: Readonly<Record<string, unknown>>;
}

interface GraphModel {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}
```

**Field notes:**

- `source`/`target` on edges — standard graph terminology, matches React
  Flow. The `string` type makes it clear these are node IDs.
- `properties` required on nodes (always carry domain data), optional on
  edges (may be pure topology).
- `metadata` optional on model — graph-level info the domain adapter
  passes through (case name, schema version). Untyped because
  graph-core is domain-agnostic.
- No `label`, `position`, or `dimensions` — those are rendering concerns
  owned by graph-renderer.
- No `ports` — port cardinality is a grammar constraint (StencilGrammar,
  issue #267), not a model feature.
- Conversion from `GraphModel` to React Flow `Node[]`/`Edge[]` is
  graph-renderer's responsibility (parent spec §3.2 data flow).
  graph-core's types are deliberately renderer-agnostic — no
  `position`, `data`, or rendering fields. Rendering-specific fields
  (position, style, measured, selected) are excluded by design.
  The mapping is trivial (identity for `id`/`type`/`parentId`,
  rename `properties` → `data`, add layout position from ELK),
  which validates that graph-core's domain-agnostic types compose
  cleanly with React Flow without coupling to it. The conversion
  contract will be defined in graph-renderer's spec (#265).

## 4. Containment Traversal

```typescript
function childrenOf(model: GraphModel, parentId: string): readonly GraphNode[]
function ancestorsOf(model: GraphModel, nodeId: string): readonly GraphNode[]
function subtreeOf(model: GraphModel, nodeId: string): readonly GraphNode[]
function rootNodes(model: GraphModel): readonly GraphNode[]
```

| Function | Behaviour |
|----------|-----------|
| `childrenOf` | Direct children only (nodes whose `parentId` matches). Empty array if none or if `parentId` doesn't exist in the model. |
| `ancestorsOf` | Walks `parentId` chain upward: `[parent, grandparent, ...]` (nearest first). Empty for root nodes. Per-call visited set; throws on cycle (including self-referencing `parentId`). Returns empty if `nodeId` not found. |
| `subtreeOf` | The node itself plus all descendants, breadth-first. Per-call visited set; throws on containment cycle (consistent with `ancestorsOf`). Returns empty array if `nodeId` not found. |
| `rootNodes` | Nodes with no `parentId`. Top-level for ELK layout. |

These functions are the canonical source of containment semantics
for the graph package family. Consumers that currently build their
own containment structures from `parentId` (e.g., `elk-layout.ts`
in graph-renderer) will consolidate onto these functions when
graph-renderer (#265) depends on graph-core.

**"Not found" semantics:** Traversal functions return empty arrays when
the starting `nodeId` doesn't exist in the model. This is intentional —
these are query functions, not existence checks. A query for "what's
related to X" correctly answers "nothing" when X doesn't exist, just as
`Array.filter` returns `[]` when nothing matches. Callers that need to
distinguish "node doesn't exist" from "node exists but has no
relatives" should use `nodeById` first. Note that `subtreeOf` always
includes the node itself when it exists, so `subtreeOf(model,
id).length === 0` is an unambiguous "not found" signal.

## 5. Edge and Lookup Queries

```typescript
function edgesOf(model: GraphModel, nodeId: string): readonly GraphEdge[]
function inboundEdges(model: GraphModel, nodeId: string): readonly GraphEdge[]
function outboundEdges(model: GraphModel, nodeId: string): readonly GraphEdge[]
function nodeById(model: GraphModel, nodeId: string): GraphNode | undefined
function edgeById(model: GraphModel, edgeId: string): GraphEdge | undefined
```

| Function | Behaviour |
|----------|-----------|
| `edgesOf` | All edges where `source === nodeId` OR `target === nodeId` — the union of `inboundEdges` and `outboundEdges`. |
| `inboundEdges` | Edges where `target === nodeId`. |
| `outboundEdges` | Edges where `source === nodeId`. |
| `nodeById` | First node in array order where `id === nodeId`, or `undefined`. |
| `edgeById` | First edge in array order where `id === edgeId`, or `undefined`. |

All functions are pure — take a model, return derived data, never
mutate. All functions assume a structurally valid model (no duplicate
IDs, no dangling edges). On invalid models, behavior is
implementation-defined except for cycle protection — `ancestorsOf` and
`subtreeOf` always guard against cycles via per-call visited sets,
regardless of how the model was constructed.

**`edgesOf` semantics:** Returns all edges incident to the node — edges
where `source === nodeId` or `target === nodeId`. Each edge appears at
most once. A self-loop (where `source === target`) is a single edge
object that matches both conditions but appears once in the result.
Equivalent to the union of `inboundEdges` and `outboundEdges` with
natural deduplication. No ordering guarantee beyond model array order.

**Self-loop edges:** Self-loops are structurally valid at the graph-core
level. `createGraph` does not reject them. Domain-specific constraints
(e.g., "Bindings cannot self-loop") belong in `StencilGrammar` (#267).

## 6. Model Construction

```typescript
function validateGraph(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
): readonly GraphViolation[]

function createGraph(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  metadata?: Readonly<Record<string, unknown>>,
): GraphModel
```

`validateGraph` runs all structural checks and returns every violation
— no short-circuiting. Useful during adapter development when a model
may have multiple simultaneous errors. Does not construct a model.

`createGraph` delegates to `validateGraph`. If any violations are
returned, it throws `GraphValidationError`. If validation passes, it
returns a `GraphModel`.

Structural invariants:

| Check | Failure mode |
|-------|-------------|
| Empty or whitespace-only node/edge ID | Throws |
| Duplicate node IDs | Throws |
| Duplicate edge IDs | Throws |
| Dangling edge source/target | Throws |
| Invalid parentId (references non-existent node) | Throws |
| Self-referencing parentId (`parentId === id`) | Throws — specific message: "Node 'X' references itself as parent" |
| Containment cycle | Throws |

These are data corruption — the domain adapter produced bad data.
Throwing is correct (not error returns) because this is not user input
validation.

**Error format:** Validation failures throw `GraphValidationError`
(extends `Error`) with structured diagnostics:

```typescript
class GraphValidationError extends Error {
  readonly violations: readonly GraphViolation[];
}

interface GraphViolation {
  readonly rule: 'empty_id' | 'duplicate_node_id' | 'duplicate_edge_id'
    | 'dangling_edge' | 'invalid_parent' | 'self_parent' | 'containment_cycle';
  readonly message: string;
  readonly nodeId?: string;
  readonly edgeId?: string;
}
```

`createGraph` collects all violations before throwing (not fail-fast),
so a single call surfaces every structural problem. The `rule` field
is a discriminated union for programmatic matching; `message` is
human-readable with the offending IDs.

**Structural invariant contract:** `createGraph` is the canonical
construction path for production code. All graph-core functions —
traversal (§4), queries (§5), and edit operations (#269) — assume
the input `GraphModel` satisfies the structural invariants listed
above (no duplicate IDs, no dangling edges, no invalid parentIds,
no containment cycles). Edit operations (#269) will maintain these
invariants incrementally: each validates its own edit against a
known-valid base, producing a valid result without full model
re-validation. Together, `createGraph` and the edit operations form
a closed system where every `GraphModel` produced through them
satisfies the invariants.

Plain-object construction remains available for test code and for
adapters that guarantee correctness through other means. Callers
who bypass `createGraph` accept that behavior on structurally
invalid models is implementation-defined (§5). On
models not validated by `createGraph`, only cycle protection in
`ancestorsOf` and `subtreeOf` is guaranteed; other functions operate
on the arrays as given.

## 7. Package Structure

```
packages/graph-core/
  package.json          @casehubio/graph-core, version 0.1.0
  tsconfig.json         extends pages-tsconfig, no references
  tsconfig.build.json   outDir: dist, excludes tests
  vitest.config.ts      default node environment (no DOM needed)
  src/
    index.ts            barrel — types + all functions
    model.ts            GraphNode, GraphEdge, GraphModel interfaces
    graph.ts            createGraph, validateGraph, GraphValidationError
    traversal.ts        childrenOf, ancestorsOf, subtreeOf, rootNodes
    query.ts            edgesOf, inboundEdges, outboundEdges, nodeById, edgeById
    model.test.ts       type construction, plain object compliance
    graph.test.ts       createGraph validation (duplicates, dangling, cycles)
    traversal.test.ts   containment traversal (flat, nested, deep, empty, cycles)
    query.test.ts       edge queries, lookup by ID
```

- Zero dependencies.
- `graph-*` namespace (no `pages-` prefix), matching `graph-renderer`.
- Flat `src/` — four source files + four test files.
- Co-located tests (`*.test.ts` next to source).
- Not yet added to `build:packages` — no downstream consumer in the
  build chain until graph-renderer depends on it.

## 8. Test Coverage

| File | What's tested |
|------|--------------|
| `model.test.ts` | Plain object construction satisfies the interfaces. Readonly enforcement (compile-time only — verified by type tests). |
| `graph.test.ts` | `createGraph` happy path. Empty model (`createGraph([], [])`). Single-node, no-edges model. `validateGraph` returns all violations without throwing. Duplicate node ID rejection. Duplicate edge ID rejection. Dangling edge detection. Invalid parentId detection. Self-referencing parentId detection. Containment cycle detection. Empty/whitespace ID rejection. Self-loop edge acceptance. Error format — `GraphValidationError` with structured violations. Multiple violations collected in single throw. |
| `traversal.test.ts` | `childrenOf` — direct children, no children, non-existent parent. `ancestorsOf` — single parent, multi-level, root node, cycle detection, self-referencing parentId. `subtreeOf` — flat, nested, deep hierarchy, breadth-first ordering verified, cycle detection. `rootNodes` — mixed root/child, all roots, all children, empty model returns `[]`. |
| `query.test.ts` | `edgesOf` — node with edges, node without edges, self-loop appears once, empty model. `inboundEdges`/`outboundEdges` — direction filtering, self-loop appears in both. `nodeById`/`edgeById` — found, not found, empty model returns `undefined`. |

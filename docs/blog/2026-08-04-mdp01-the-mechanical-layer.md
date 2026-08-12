---
title: "The Mechanical Layer"
date: 2026-08-04
author: Mark Proctor
tags: [documentation, api-catalogue, jmarkdoc, typedoc, rag]
status: draft
project: casehub
entry_type: note
subtype: diary
---

The CaseHub documentation stack had a gap. The consumer guides (#377) explain
when and why — contextual documentation owned by each repo, updated in the same
session that changes the code. IntelliJ MCP answers cross-repo questions live —
who implements this SPI, who calls it. But there was no mechanical layer: the
precise type signatures, method contracts, and parameter types that an LLM needs
when it's actually writing `implements AgentRoutingStrategy` and needs to know
the exact shape of `RoutingResult`.

The original plan (#359) was per-SPI markdown chunks — 50+ hand-curated files,
each documenting one interface with its contract, default bean, and cross-repo
implementations. We brainstormed that and killed it. The consumer guides already
cover contracts and defaults per-repo. The only unique value was the cross-repo
dimension: "who else implements X?" And for that, 50 files that duplicate what
the guides already say is the wrong shape. A single cross-repo registry is
enough.

Then we killed the custom extractor idea too. I'd been thinking about JavaParser
or a Python script to walk the AST and render markdown. But the question that
changed direction was simpler: isn't there a tool that already does this?

For TypeScript, yes — TypeDoc with typedoc-plugin-markdown is mature, uses the
TS compiler for full type resolution, and generates markdown directly. Solved.

For Java, the landscape is surprisingly barren. We searched. neuhalje's
markdown-doclet uses the pre-JDK 9 API — silently unusable on anything modern.
Marklet, same vintage, same problem. The only tool that generates markdown
output using the current doclet API is Adam Bien's jmarkdoc, and it requires
JDK 25+.

We're on JDK 22 for production. That looked like a blocker until we checked
`/Library/Java/JavaVirtualMachines/` — JDK 26 was already installed. jmarkdoc
needs JDK 25+ to *run*, not to *analyse*. The JDK version constraint is on the
tool, not the source code it reads. Point it at JDK 26's java, feed it JDK 22
source, get 247 types documented from engine-api in clean markdown. Method
signatures with resolved generics, javadoc preservation, deterministic output
(byte-for-byte identical across runs). The warning about "source-only mode" made
it sound degraded — the output was fine.

The architecture landed on the same decentralised pattern as the guides. Each
repo generates its own API docs into `docs/guides/api/` — same directory the
subtree sync already aggregates. No new sync infrastructure. Parent adds the one
thing individual repos can't produce: the cross-repo SPI implementation matrix.
A Python script reads the aggregated docs, greps source for `implements
InterfaceName`, and renders the matrix. Ten cross-repo SPIs found on the first
run — `RoutingSignalProvider` alone has implementations across four modules.

What shipped: the overlay script with tests, the CI workflow, the sync-guides
gate fix (previously repos with only generated API docs and no hand-written
guides were silently skipped), the platform index linking everything together.
The engine pilot proved the pipeline. TypeScript and the remaining Java repos
are mechanical rollout.

The design review flagged twelve issues — the serious ones were a regex/AST
contradiction in the overlay approach, a CI commit loop risk, and the
centralised-config-consumed-by-decentralised-CI problem. All addressed in the
spec revision. The core insight from the review: each repo should own its own
filtering config in its build tooling (pom.xml, typedoc.json), not read a
centralised config from parent. Parent just aggregates whatever each repo
generates.

Three things I didn't expect going in. First, that no Java→markdown doclet
works on JDK 21/22 — this is an ecosystem gap that most teams on LTS releases
haven't hit yet because they haven't tried to generate LLM-friendly API docs.
Second, that the dual-JDK approach (tool on 26, source on 22) works without
friction. Third, that jmarkdoc's "fallback" mode produces output good enough
to ship — the assumption that you need full dependency resolution for
documentation turns out to be wrong for this use case.

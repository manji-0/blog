---
title: manj.io
description: profile/blog by Wataru Manji
type: website
tableOfContents: false
head:
  - tag: script
    attrs:
      src: /manj-fediverse-statuses.js
      defer: true
---

## Recent Notes

### [RustとTypeScriptで答えが変わる18問](/blog/2026/purecrate-rust-ts-quiz/)

Eighteen pure functions that look the same in Rust and TypeScript and return
different values, from `-7 / 2` to `trim` and `sort`, each run on both sides,
with what `purecrate-ts` prints to make them agree or why it refuses them.

`rust` `typescript` `javascript` `unicode` `quiz`

### [出力を1バイトも変えずに変換器をリファクタする](/blog/2026/purecrate-byte-identical-refactor/)

Two large refactors of `purecrate-ts` were gated on one condition: every
generated file stays byte for byte the same. What the gate caught, the bugs
that duplicated code had already grown, and what was left unmerged on purpose.

`rust` `typescript` `refactoring` `testing`

### [serde_jsonとzod・valibot・arktypeに同じJSONを同じように読ませる](/blog/2026/purecrate-wire-serde-json/)

`purecrate-ts` generates schemas that read and write JSON exactly as the
server's serde_json does. Its rules were measured against serde_json itself,
and `parseJson` recovers what `JSON.parse` throws away.

`rust` `typescript` `serde` `zod` `json`

### [RustのドメインロジックをTypeScriptへ「意味ごと」移す](/blog/2026/purecrate-semantics-preservation/)

`purecrate-ts` translates pure Rust domain logic into plain TypeScript and
checks that both return the same results. How it defines equivalence, refuses
what cannot keep its meaning, and writes TS that narrows as the Rust types do.

`rust` `typescript` `semantics` `type-narrowing`

### [Hono Conference Tokyo 2026を受けて](/blog/2026/hono-conference-tokyo-2026/)

Notes after Hono Conference Tokyo 2026: why server-side TS/JS is fast enough
for production, where it still falls short against Python and Rust, and how
AI coding agents may shift the trade-off.

`typescript` `hono` `conference` `ai`

### [エージェントを迷子にさせない、trackとdagaynの合わせ技](/blog/2026/dagayn-and-track-dev-experience/)

`track` decides where an agent works; `dagayn` keeps a code graph for that
workspace. Together they let parallel AI agents work in the right place with
the right context, shown end to end on a fictional monorepo.

`workflow` `ai` `knowledge-graph` `jj`

### [すべてを有向グラフにする、俺とAI以外のやつが](/blog/2026/dagayn-knowledge-graph-for-code-review/)

`dagayn` is a local knowledge graph for repositories: Tree-sitter parsing,
SQLite storage, dependency edges, communities, flows, and MCP tools for AI
coding agents. DAG is All You Need.

`knowledge-graph` `ai` `architecture` `code-review`

## Projects

<!-- project-list -->

## Latest Statuses

<div class="fediverse-statuses" data-fediverse-statuses>
  <p class="fediverse-statuses__loading">Loading statuses...</p>
</div>

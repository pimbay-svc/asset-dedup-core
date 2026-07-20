# Decisions

> Append-only log of decisions specific to _this_ project.
> Never edit or delete a past entry — if a decision changes, add a new entry that supersedes it and says so.
>
> **What belongs here** (test): would changing this silently break correctness, compatibility, or behavior if someone didn't know why it was done this way?
> If yes → here.
> If it's a cheap/local implementation detail → docs/context.md instead.
> If it's a pattern repeated across multiple repos → AGENTS.md instead, not here.

## `core` becomes a pipeline orchestrator, not a single-hash service

**Date:** 2026-07-28

**Decision:** Pipeline orchestrator — one asset in, every configured recipe's result out. A single `/hash` call drives an ordered `pipelines.<mime_group>[]` list, with each step being a plain `algorithm`, an `extractor` + `algorithm`, or an `extractor` + `algorithm` + `pooling: mean`.

**Why:** callers (`asset-dedup-registry` chief among them) almost always want every recipe for an asset's mime group at once (`sha256` for exact dedup plus one or more perceptual hashes), not one algorithm selected per call.

**Alternatives considered:** keep the one-algorithm-per-request `POST /hash` shape and add more delegate codes as new mime types need coverage.

## Unix sockets to subservices, HTTP stays between `core` and `registry`

**Date:** 2026-07-28

**Decision:** Unix sockets for `core` ↔ subservices; `core` ↔ `registry` stays HTTP.

**Why:** `core` and its subservices (`image-hash`, `video-frame-extract`, `pdf-page-extract`) are deployed as a tightly-coupled unit sharing one asset volume — a socket avoids HTTP's per-request overhead for what's effectively a local IPC call, and forces the coupling to be explicit (a missing socket fails startup, not a silent 5xx later).
`core` ↔ `registry` stays HTTP deliberately — that's a real network boundary between independently-scaled, independently-deployed services, where HTTP's operational tooling (load balancing, standard observability) earns its overhead.

**Alternatives considered:** keep the old HTTP delegate transport for `core` → extension calls.

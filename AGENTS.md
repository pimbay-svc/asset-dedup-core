# AGENTS.md — asset-dedup-core

## Project Overview

Pipeline-orchestrating asset hashing/embedding service, part of the `asset-dedup` ecosystem.
Single entry point for callers — receives a file + a mime hint (`mime_hint: { type: "mime" | "extension", value: string }`), resolves and verifies it against the file's actual content, runs that mime group's named pipelines (all, or a caller-selected subset via `recipes`), and returns every selected pipeline's result.
`sha256` runs natively in-process; every other algorithm and every extractor (video frame sampling, PDF page rendering) is delegated to a subservice over a persistent unix socket.
Called by `asset-dedup-registry` (which persists results and groups near-duplicates) and usable standalone.
License: Unlicense. Runtime: Node.js >=24.

## Commands

```bash
npm install
npm run dev              # tsx watch --env-file-if-exists=.env
npm run js:build         # tsc -p tsconfig.build.json
npm run js:lint          # eslint src test — check only
npm run js:lint:fix      # eslint src test --fix
npm run js:format        # prettier --check . — check only
npm run js:format:fix    # prettier --write .
npm run js:typecheck     # tsc --noEmit
npm run start            # run compiled dist/
npm run test:unit        # vitest run test/unit
npm run test:integration # vitest run test/integration
npm run test:all         # both
npm run test:coverage    # both, --coverage
npm run test:mutation    # stryker run — MSI 100 gate
```

`js:typecheck` exists because `js:build` excludes `test/` and ESLint doesn't reliably catch every type error — it's the authoritative compile gate, always run alongside `js:lint`/`test`.

## Code Style

- **TS strict**, no unexplained `any` — prefer `unknown` + narrowing.
- **Named exports only.**
- **Interfaces for public contracts**, `type` for unions/internal shapes.
- **Explicit return types** on public functions/methods.
- **Small files**, one responsibility each.
- **No blind barrels** (`export * from`) — re-export explicitly.
- **No raw `enum`, ever — including `const enum`** — use `export const AnyType = {...} as const; export type AnyType = (typeof AnyType)[keyof typeof AnyType];`.
- **Named-constructor exceptions** — no inline `new SomeError(...)`.
- **Log/console message text lives in a `messages.ts` next to its module**, not inline at the call site.
- **Zod for config/env boundary validation** — never hand-rolled.
  HTTP request/response validation uses Fastify's native JSON Schema (`as const` objects) instead of zod — see `presentation/http/route/schema/`.
- **HTTP wire format is `snake_case`**, internal TS is `camelCase` — map at the route handler boundary. `config.yaml` keys are `snake_case` too, matching.
- **Config**: YAML via `yaml` (not `js-yaml`), zod-validated before use (`infrastructure/config/types.ts`, `config.ts`).
- **Logging**: `pino`, structured, no `console.log`. Pretty-print only in dev — a `NODE_ENV` typo enabling it in prod has bitten us before (see `docs/context.md`).
- **Comments** only where they explain a non-trivial decision or _why_ — never restate _what_ the code already says. Don't comment obvious lines. Keep to 1-2 lines; more only for genuinely complex logic. Always in English.
- **Caret-pin to the tested patch** (`^13.0.5`, not `^13.0`).
- **Markdown**: semantic linebreaks (one sentence/clause per line).
- **Docs discipline**: no "Project Layout" section in READMEs — the tree speaks for itself.

## Architecture

### Core — always applies

```
domain/
  model/*.model.ts     — domain vocabulary that isn't a plain entity (see "Domain vocabulary vs DTO" below)
  provider/*.provider.ts — non-repository port interfaces
application/
  command/*.command.ts  — Command data classes dispatched through CommandGateway
  handler/*.handler.ts  — CommandHandler implementations, exposed via asHandlers()
  service/*.service.ts — orchestration/business logic
  No separate model/ dir — a type used by one file lives in that file; promote to domain/model/ only if genuine domain vocabulary
infrastructure/
  container.ts          — awilix container, CLASSIC mode
  config/, logger.ts, env.ts, <adapter>/*.ts — mechanism-named adapters implementing domain/provider interfaces
presentation/
  cli/cli.ts                      — CLI entrypoint (bootstrap wrapper, excluded from coverage like server.ts)
  cli/command/*.command.ts        — one Commander subcommand each, dispatches through commandGateway
  http/server.ts                  — buildServer(): Fastify instance, swagger, error handler, route registration
  http/errorResponse.ts           — sendErrorResponse(): domain error → HTTP status mapping
  http/route/*.route.ts, http/route/schema/*.schema.ts — Fastify routes + validation schemas
```

- **DI**: awilix, CLASSIC mode — constructor param names must match cradle keys exactly, and it calls resolvers with positional args (not a merged cradle object) — destructured params silently break. See `docs/context.md` before adding a new registration.
- **Singletons**: every adapter in `container.ts` is a container singleton — no per-request instantiation.
- **Domain vocabulary vs DTO**: would this type mean the same thing if the wire format changed?
  Yes → domain; no (shapes only a boundary) → DTO, lives where consumed.
- **`algorithms.<code>.kind`** (`"native"` \| `"subservice"`) is a real discriminated-union tag on `AlgorithmEntrySchema`, not a plain flag.
- No persistence layer — core is stateless, no Drizzle/DB section applies here.
- **CQRS command-dispatch**: `application/command.gateway.ts`'s `CommandGateway` — one `Command` class + one `CommandHandler` per use case, registered in `container.ts` via `commandGateway.registerAll([...xHandlers.asHandlers()])`.
- **CLI**: `presentation/cli/`, Commander-based, one file per subcommand under `cli/command/`. Every subcommand dispatches through `commandGateway`, same as HTTP — never calls a `*.service.ts` directly, and never duplicates a route's logic.

## Testing

- **Vitest**, `test/unit/` + `test/integration/`, mirroring `src/` 1:1.
- Split is not mock-vs-real-I/O — a unit test can touch real I/O if that's a detail of the one module under test.
  - **unit/** — exercises exactly one module; its external boundaries are mocked or are its own implementation detail.
  - **integration/** — composes ≥2 modules, or crosses a framework boundary (DI container wiring real classes; Fastify routes via `app.inject`).
- Isolated route tests build a bare `Fastify()` instance and never see `buildServer()`'s `setErrorHandler` — they get Fastify's raw validation-error shape, not the documented `{ error }` shape. Only `test/integration/presentation/http/server.test.ts` (built via `buildServer()`) exercises the real wire shape end to end.
- Coverage target is **100% across the board** — `vitest.config.ts`'s `coverage.exclude` list is intentionally short and each entry is justified there; a change that drops coverage needs new tests, not a new exclusion.
- **Mutation score target is 100% (MSI)** — `stryker.config.mjs`, `test:mutation`.
- Every bug fix gets a regression test, ideally added after reproducing against the real running service.

## Guardrails

- No new deps without proposing them explicitly.
- Targeted diffs — don't rewrite a file for a small fix.
- No unrequested docs/test scaffolding.
- Don't reintroduce `js-yaml`, raw `enum`, or `console.log` — flag if an exception seems warranted, don't revert silently.
- Ask before changing a DI registration's lifetime.
- Domain vs application vs infrastructure placement unclear → ask, don't guess.
- `/hash`, `/algorithms`, `/healthz` have no auth of any kind by design — don't add a security scheme to the swagger doc without a matching real check, and don't add one silently.
- Fastify's default AJV `coerceTypes: true` silently coerces mismatched primitive types (number → string, etc.) — don't assume a `{ type: 'string' }` schema rejects a number; see `docs/context.md`.

# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-09-15

### Added

- `POST /hash` — resolves a file's mime type to a `mime_group` and runs that group's named pipelines — all of them, or a caller-picked subset via the request's `recipes` field — returning all selected results in one response: `{ "results": [{ "recipe": "...", "hashes"/"vectors": [...] }] }`.
  `sha256` runs natively in-process; every other algorithm and every extractor (video frame sampling, PDF page rendering) is delegated to a subservice over a persistent unix socket.
- `GET /algorithms` — lists every `{ recipe, comparison }` derived from the current config's `pipelines` + `algorithms[*].comparison`.
- `GET /healthz` — shallow liveness check; `?deep=true` additionally probes every configured subservice socket.
- YAML configuration (`config/config.example.yaml`) with fail-fast startup validation: zod schema plus cross-reference checks (`mime_to_group` references, algorithm/extractor/subservice registration, pooling/comparison-type consistency). Every configured subservice socket is also connect-tested at startup.
- CQRS command-dispatch (`application/command.gateway.ts`) and a CLI (`presentation/cli/`) alongside HTTP — both dispatch the same `CalculateHash` command.

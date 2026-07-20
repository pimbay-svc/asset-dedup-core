# asset-dedup-core

[![Docker Image](https://img.shields.io/badge/docker.io-pimbay%2Fasset--dedup--core-blue?style=flat-square&logo=docker)](https://hub.docker.com/r/pimbay/asset-dedup-core)
[![Node Version](https://img.shields.io/badge/node-%3E%3D24-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-Unlicense-green?style=flat-square)](LICENSE)
[![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen?style=flat-square)](https://codeberg.org/pimbay-svc/asset-dedup-core)
[![Mutation Score](https://img.shields.io/badge/MSI-100%25-brightgreen?style=flat-square)](https://codeberg.org/pimbay-svc/asset-dedup-core)

Pipeline-orchestrating asset hashing/embedding service, part of the `asset-dedup` ecosystem.
Given a file and a mime hint (a claimed mime type, or just a filename extension), it resolves and verifies the actual mime against the file's content, then runs that mime's named pipelines — all of them, or a caller-picked subset — computing `sha256` in-process and delegating every other algorithm and extractor (video frame sampling, PDF page rendering) to a subservice over a unix socket, returning all results in one response.

## Quick Start (Local)

```bash
npm install
cp .env.example .env
npm run dev
```

Also copy `config/config.example.yaml` to `config/config.yaml` first (the default `CONFIG_PATH`) — `npm run dev` fails fast otherwise.
`core` refuses to start unless every configured subservice socket (`image-hash`, `video-frame-extract`, `pdf-page-extract`) is reachable — run those first, or use `asset-dedup-stack` to bring up the whole ecosystem locally in one go.

## Quick Start (Docker)

```bash
docker compose up --build
```

Exposes port `3000`, mounts `config/config.yaml` read-only, and declares the `shared-assets`/`sockets` volumes the extension services publish into under the same names.
Run standalone like this, they're a private, unshared pair — bring `core` up as one Compose project together with the subservices (or via `asset-dedup-stack`) for the volumes to actually be shared; see `docker/README.md`'s "Docker Compose" section for the details.

## Configuration

| Variable        | Required | Description                                                                              |
| --------------- | -------- | ---------------------------------------------------------------------------------------- |
| `CONFIG_PATH`   | yes      | Path to `config.yaml` — no default, the app fails fast if unset.                         |
| `PORT`          | no       | HTTP port to listen on. Defaults to `3000`.                                              |
| `ASSET_WORKDIR` | no       | Shared volume `core` and every subservice can reach by path. Defaults to `./var/assets`. |

Full reference (all env vars, all `config.yaml` keys): **[docs/configuration.md](docs/configuration.md)**.

## Usage

The smallest useful thing this service does: hash one local file and see its recipe results — `sha256` always runs natively, no subservice required for that part.

```bash
curl -X POST http://localhost:3000/hash \
  -H "Content-Type: application/json" \
  -d '{"mime_hint": {"type": "mime", "value": "image/jpeg"}, "file_content": "'"$(base64 -w0 photo.jpg)"'", "recipes": null}'
```

```json
{
  "results": [
    { "recipe": "image.sha256", "hashes": ["e3b0c4..."] },
    { "recipe": "image.phash8", "hashes": ["a1b2c3d4e5f6a7b8"] }
  ]
}
```

The same operation from the CLI — no server needed, mime resolved from the filename extension instead:

```bash
npm run cli -- hash file ./photo.jpg
```

```
recipe          hashes
--------------  --------
image.sha256    e3b0c44298fc1c14...
image.phash8    a1b2c3d4e5f6a7b8
```

A full end-to-end workflow (recipe filtering, the fallback path, mime-mismatch behavior), plus edge cases worth knowing about: **[docs/usage.md](docs/usage.md)**.

## API

No authentication — core has no auth of its own (a network/gateway concern, not enforced here; see `docs/DECISIONS.md`).

| Method | Path          | Description                                                                                            | Success response                                          |
| ------ | ------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `POST` | `/hash`       | Runs one asset through its mime group's named pipelines (all, or a caller-picked subset via `recipes`) | `{ "results": [{ "recipe": "...", "hashes": ["..."] }] }` |
| `GET`  | `/algorithms` | Lists every `{ recipe, comparison }` derivable from the current config                                 | `{ "algorithms": [...] }`                                 |
| `GET`  | `/healthz`    | Liveness check; `?deep=true` also probes every configured subservice socket                            | `{ "status": "ok" }`                                      |

Full request/response shapes, error codes, and `curl` examples: **[docs/api.md](docs/api.md)**.

## CLI

```bash
npm run cli -- hash file --help
```

| Command     | Description                                                                      |
| ----------- | -------------------------------------------------------------------------------- |
| `hash file` | Runs a local file through the same pipeline `POST /hash` uses, no server needed. |

Full option reference and example output: **[docs/cli.md](docs/cli.md)**.

## Testing

```bash
npm run test:unit
npm run test:integration
npm run test:all
npm run test:coverage
```

## Development Helpers

```bash
npm run js:lint       # check
npm run js:lint:fix   # fix
npm run js:format     # check
npm run js:format:fix # fix
npm run js:typecheck  # tsc --noEmit
```

`npm run dev` already runs in watch mode (`tsx watch --env-file=.env`) — no separate watch command.

## Architecture & Decisions

- **[docs/context.md](docs/context.md)** — current working state: what's in progress, what's next.
- **[docs/DECISIONS.md](docs/DECISIONS.md)** — why things are built the way they are, in the order the decisions were made.
- **[docs/CHANGELOG.md](docs/CHANGELOG.md)** — version history.

## License

Public domain — [Unlicense](LICENSE)

Created by [Jan Sarmir](https://pimbay.dev) · No conditions · No copyright

Bundled third-party dependencies and their licenses: **[docs/THIRD-PARTY-NOTICES.md](docs/THIRD-PARTY-NOTICES.md)**.

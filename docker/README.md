# asset-dedup-core

Pipeline-orchestrating asset hashing/embedding service, part of the `asset-dedup` ecosystem.
Given a file and a mime hint, it resolves and verifies the actual mime against the file's content, then runs that mime's named pipelines —
computing `sha256` in-process and delegating every other algorithm and extractor (video frame sampling, PDF page rendering) to a subservice over a unix socket.

This image is not useful standalone.
`core` refuses to start unless every subservice socket configured in `config.yaml` (`image-hash`, `video-frame-extract`, `pdf-page-extract`) is reachable at startup — it's meant to be deployed alongside those, sharing the same `shared-assets`/`sockets` volumes.
See `asset-dedup-stack` for the full orchestrated setup; the example below is for local testing against subservices you've already brought up some other way, sharing the same two volumes.

## Quick Start

```bash
docker run --rm \
  -p 127.0.0.1:3000:3000 \
  -v $(pwd)/config/config.yaml:/etc/asset-dedup-core/config.yaml:ro \
  -v shared-assets:/shared \
  -v sockets:/sockets:ro \
  -e CONFIG_PATH=/etc/asset-dedup-core/config.yaml \
  pimbay/asset-dedup-core:latest
```

`shared-assets` and `sockets` must be the _same_ volumes every subservice's own container mounts, at the same `/shared`/`/sockets` container paths — see [Volumes](#volumes) below.

## Docker Compose

```yaml
services:
  core:
    image: pimbay/asset-dedup-core:latest
    ports:
      - '127.0.0.1:3000:3000'
    environment:
      CONFIG_PATH: /etc/asset-dedup-core/config.yaml
    volumes:
      - ./config/config.yaml:/etc/asset-dedup-core/config.yaml:ro
      - shared-assets:/shared
      - sockets:/sockets:ro
    restart: unless-stopped

volumes:
  shared-assets:
  sockets:
```

`shared-assets`/`sockets` only end up _shared_ with the subservices when everything is brought up as one Compose project — e.g. `docker compose -f core/docker-compose.yml -f image-hash/docker-compose.yml -f video-frame-extract/docker-compose.yml -f pdf-page-extract/docker-compose.yml up`, or via `asset-dedup-stack` —
since Compose merges matching top-level volume names within a single project run.
Running `core`'s compose file as its own separate `docker compose up` gives it a private, unshared pair instead; in that case declare both as `external: true` pointing at volumes you created once (`docker volume create shared-assets sockets`).
Raw filesystem paths are exchanged over the socket protocol with no translation layer either way, so `/shared` and `/sockets` must resolve to the same files in every container, not just share a volume name.

## Environment Variables

| Variable                     | Required | Default              | Description                                                                                                                          |
| ---------------------------- | -------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `CONFIG_PATH`                | Yes      | —                    | Path to `config.yaml` inside the container. No default — the app fails fast if unset.                                                |
| `NODE_ENV`                   | No       | `production` (image) | `development` \| `production` \| `test`. Controls pino's pretty-printing.                                                            |
| `PORT`                       | No       | `3000`               | HTTP port to listen on.                                                                                                              |
| `LOG_LEVEL`                  | No       | `info`               | pino level: `trace`\|`debug`\|`info`\|`warn`\|`error`\|`fatal`\|`silent`.                                                            |
| `ASSET_WORKDIR`              | No       | `/shared` (image)    | Shared volume `core` and every subservice can reach by path. Written to per request, cleaned up when each request finishes or fails. |
| `SUBSERVICE_CALL_TIMEOUT_MS` | No       | `30000`              | Timeout for a single subservice socket batch call (an algorithm or an extractor call).                                               |

Full reference, including `config.yaml`'s own keys: [`docs/configuration.md`](https://codeberg.org/pimbay-svc/asset-dedup-core/src/branch/main/docs/configuration.md) in the source repo.

## Volumes

| Container path                      | Description                                                                                                                                                                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/etc/asset-dedup-core/config.yaml` | `config.yaml`, mounted read-only. Required — the container fails to start without a valid config here.                                                                                                                        |
| `/shared`                           | `ASSET_WORKDIR`. Shared with every subservice, at the same path — `core` decodes each uploaded asset here and reads back extracted sub-item files from the same tree. Must be writable by uid `1001` (the image's `appuser`). |
| `/sockets`                          | Directory of subservice unix sockets, mounted read-only. One `<name>.sock` per entry in `config.yaml`'s `subservices` map (each subservice publishes into this same volume at the same path).                                 |

A private, unshared volume at either path will make `core` fail its startup socket check (`/sockets`) or make every `kind: subservice` pipeline step fail at request time (`/shared`).

## Ports / Sockets

| Port / Path | Protocol | Description                                                                                                                                        |
| ----------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `3000`      | HTTP     | `POST /hash`, `GET /algorithms`, `GET /healthz`, Swagger UI at `/docs`. No authentication of its own — see `docs/DECISIONS.md` in the source repo. |

`core` does not expose a unix socket itself; it's a client of the subservices' sockets mounted read-only under `/sockets`.

## Tags

| Tag      | Description                         |
| -------- | ----------------------------------- |
| `latest` | latest stable release               |
| `1.0`    | major.minor — updated on each patch |
| `1.0.0`  | exact version                       |

Images are published to both registries on each release:

```bash
docker pull pimbay/asset-dedup-core:latest
docker pull ghcr.io/pimbay-svc/asset-dedup-core:latest
```

## License

Public domain — Unlicense

Created by Jan Sarmir · No conditions · No copyright

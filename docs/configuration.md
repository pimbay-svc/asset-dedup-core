# Configuration Reference

Two layers: **env vars** (bootstrap only — where to find the config file, timeouts that shouldn't sit in a YAML file on disk) and **`config.yaml`** (everything else, validated by a zod schema at startup — see `src/infrastructure/config/types.ts`).

## Environment variables

| Variable                     | Required | Description                                                                                                                                                                                                                                |
| ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CONFIG_PATH`                | yes      | Path to `config.yaml`. No default — the app fails fast with a clear error if unset rather than guessing a container-specific path.                                                                                                         |
| `NODE_ENV`                   | no       | `development` \| `production` \| `test`. Controls log pretty-printing — see `AGENTS.md`.                                                                                                                                                   |
| `PORT`                       | no       | HTTP port to listen on. Defaults to `3000`.                                                                                                                                                                                                |
| `LOG_LEVEL`                  | no       | pino level (`trace`\|`debug`\|`info`\|`warn`\|`error`\|`fatal`\|`silent`). Defaults to `info`.                                                                                                                                             |
| `ASSET_WORKDIR`              | no       | Shared volume that `core` and every subservice can reach by path. `core` decodes each uploaded asset here before any subservice call, and cleans the directory up once the asset's pipeline finishes or fails. Defaults to `./var/assets`. |
| `SUBSERVICE_CALL_TIMEOUT_MS` | no       | Timeout for a single subservice socket batch call (an algorithm or an extractor call). Defaults to `30000`.                                                                                                                                |

`config.yaml` does not support `${ENV_VAR}` substitution — it's static YAML only.

## `config.yaml` reference

Schema source of truth: `src/infrastructure/config/types.ts` (`ConfigSchema`).
Every key below is validated at startup — structural (zod) and cross-reference checks (`src/infrastructure/config/config.ts`'s `validateCrossReferences`) both run before the HTTP server starts listening, so a broken config fails the process immediately rather than serving requests with silently wrong behavior.
Every `kind: subservice` algorithm/extractor's socket is also connect-tested at startup (`src/server.ts`) — `core` refuses to start if one is unreachable.

| Key                  | Type                     | Required | Default | Description                                                                                                                                                        |
| -------------------- | ------------------------ | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mime_to_group`      | `Record<string, string>` | yes      | —       | Maps a MIME type to a logical group (`image`, `pdf`, `video`, ...). `"*"` is a **mandatory** fallback entry.                                                       |
| `subservices.<name>` | object (see below)       | no       | `{}`    | Unix socket location for one named subservice.                                                                                                                     |
| `algorithms.<code>`  | object (see below)       | yes      | —       | One entry per algorithm code — `kind: native` (in-process) or `kind: subservice` (delegated over a socket).                                                        |
| `extractors.<name>`  | object (see below)       | no       | `{}`    | One entry per extractor — turns one input file into N sub-items via a subservice; no hashing here.                                                                 |
| `pipelines.<group>`  | object (see below)       | yes      | —       | Named pipelines for a `mime_group`, keyed by pipeline name. Every group referenced by `mime_to_group` must have a matching entry with at least one named pipeline. |

### `subservices.<name>` shape

| Key           | Type     | Required | Description                           |
| ------------- | -------- | -------- | ------------------------------------- |
| `socket_path` | `string` | yes      | Path to the subservice's unix socket. |

### `algorithms.<code>` shape

Two variants, discriminated by `kind`:

| Key          | Type                                   | Required                   | Description                                                                                     |
| ------------ | -------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------- |
| `kind`       | `"native"` \| `"subservice"`           | yes                        | `native`: computed in-process (currently only `sha256`). `subservice`: delegated over a socket. |
| `comparison` | `"exact"` \| `"hamming"` \| `"cosine"` | yes                        | Property of the algorithm itself — same regardless of which pipeline uses it.                   |
| `subservice` | `string`                               | yes for `kind: subservice` | Name of the entry in `subservices` this algorithm calls.                                        |
| `config`     | `Record<string, unknown>`              | no (defaults to `{}`)      | Passed through verbatim to the subservice on every batch call.                                  |

### `extractors.<name>` shape

| Key          | Type                      | Required              | Description                                                    |
| ------------ | ------------------------- | --------------------- | -------------------------------------------------------------- |
| `subservice` | `string`                  | yes                   | Name of the entry in `subservices` this extractor calls.       |
| `config`     | `Record<string, unknown>` | no (defaults to `{}`) | Passed through verbatim to the subservice on every batch call. |

### `pipelines.<group>.<pipeline_name>` shape

Each mime group's `pipelines` entry is a map of **pipeline name → one step** — not a list.
The name is what `POST /hash`'s `recipes` filter addresses (`"{mime_group}.{pipeline_name}"`, e.g. `"image.phash16"`) and what `GET /algorithms` reports as `recipe`.
It's a free-form label, not necessarily an algorithm name — natural to reuse the algorithm's own name when there's no ambiguity (`sha256`, `phash8`), but a distinct label is useful when two named pipelines in the same group use the same algorithm with different extractor settings (e.g. `frame5_phash16` vs `frame10_phash16`).

| Key         | Type     | Required | Description                                                                                                                            |
| ----------- | -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `algorithm` | `string` | yes      | Key into `algorithms`.                                                                                                                 |
| `extractor` | `string` | no       | Key into `extractors`. If present, the algorithm runs against every extracted sub-item instead of the whole asset.                     |
| `pooling`   | `"mean"` | no       | Only valid alongside `extractor`, and only for a `comparison: cosine` algorithm — reduces N vectors to one via element-wise averaging. |

`recipe = "{mime_group}.{pipeline_name}"`, always — `sha256` under `binary` and `image` therefore produces two distinct recipes (`binary.sha256`, `image.sha256`) even though the computation is identical.
Whether a step's result comes back as one value or several isn't configured or reported anywhere — `POST /hash` always returns `hashes`/`vectors` as arrays (length 1 for a plain `algorithm` step or a `pooling: mean` step, length N for `extractor` + `algorithm` with no pooling); see `docs/api.md`.

Every mime group referenced by `mime_to_group` — including whichever group `"*"` maps to — must have **at least one** named pipeline; this is what `POST /hash`'s `recipes` fallback (see `docs/api.md`) always has something to fall back to.

**Example `config.yaml`**

```yaml
mime_to_group:
  image/jpeg: image
  application/pdf: pdf
  video/mp4: video
  '*': binary

subservices:
  image-hash:
    socket_path: /var/run/asset-dedup/image-hash.sock
  video-frame-extract:
    socket_path: /var/run/asset-dedup/video-frame-extract.sock
  pdf-page-extract:
    socket_path: /var/run/asset-dedup/pdf-page-extract.sock

algorithms:
  sha256:
    kind: native
    comparison: exact
  phash8:
    kind: subservice
    subservice: image-hash
    comparison: hamming
    config:
      algorithm: phash
      hash_size: 8

extractors:
  video-frames:
    subservice: video-frame-extract
    config:
      sampling_strategy: uniform
      frame_count: 5
  pdf-pages:
    subservice: pdf-page-extract
    config:
      page_selection: first-middle-last
      dpi: 150

pipelines:
  binary:
    sha256:
      algorithm: sha256
  image:
    sha256:
      algorithm: sha256
    phash8:
      algorithm: phash8
  video:
    sha256:
      algorithm: sha256
    frame5_phash8:
      extractor: video-frames
      algorithm: phash8
  pdf:
    sha256:
      algorithm: sha256
    pages_phash8:
      extractor: pdf-pages
      algorithm: phash8
```

See `config/config.example.yaml` for the complete, always-current reference copy.

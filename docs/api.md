# API Reference

Base URL: `http://localhost:3000` (local dev default — see `.env.example`).

Interactive Swagger UI is served at `/docs` on every running instance (see `src/presentation/http/server.ts`); the raw OpenAPI document is at `/docs/json`.
This file documents the same routes in narrative form — the two should never drift; if a route changes, update both the route's Fastify JSON Schema and this file.

No authentication — core has no auth of its own.
Access control (if any is needed for a given deployment) is a network/gateway concern, not something core enforces itself.

## Error format

Every non-2xx response has the same shape:

```json
{ "error": "human-readable message" }
```

| Status | Meaning                                                                                                                                                                 |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | Validation error — missing/invalid `mime_hint` or `file_content`, invalid base64, or a claimed mime that contradicts the asset's actual content (see `mime_hint` below) |
| 422    | The pipeline failed for this asset (corrupt file, a subservice item error) — fail-closed, no partial results                                                            |
| 502    | A subservice was unreachable mid-pipeline                                                                                                                               |
| 500    | Unexpected internal error                                                                                                                                               |

---

## `POST /hash`

Resolves the asset's mime type from `mime_hint`, maps it to a `mime_group` (`config.yaml`'s `mime_to_group`, falling back to `"*"`'s group if unlisted), then runs either every named pipeline for that group, or a caller-selected subset — see `recipes` below.
Any error anywhere in the pipeline aborts the whole request — no partial results are ever returned for a failed asset.

**Request body**

```json
{ "mime_hint": { "type": "mime", "value": "image/jpeg" }, "file_content": "<base64>", "recipes": null }
```

| Field          | Type               | Required | Description                                                                              |
| -------------- | ------------------ | -------- | ---------------------------------------------------------------------------------------- |
| `mime_hint`    | `object`           | yes      | `{ type: "mime" \| "extension", value: string }` — see below.                            |
| `file_content` | `string`           | yes      | Base64-encoded file bytes.                                                               |
| `recipes`      | `string[] \| null` | yes      | Which named pipelines to run — see below. Always present in the request, even if `null`. |

**`mime_hint` — mime resolution and verification**

core sniffs the actual file content (magic bytes) and reconciles it against the hint, rather than trusting `mime_hint` blindly:

- `{ "type": "mime", "value": "image/jpeg" }` — a **claim**: the caller asserts this is the file's mime type. core always sniffs the content and compares; if the sniff produces a definite result that disagrees with the claim, the request is rejected with **400** (`MimeMismatchError`) rather than silently trusting or silently correcting it — this is what stops a request that labels an executable as `image/jpeg` from being processed as one. If the content can't be sniffed (see the text-format caveat below), the claim is trusted as-is.
- `{ "type": "extension", "value": "jpg" }` — only a **hint**: nobody asserted anything, a filename extension can easily be wrong. core still sniffs the content, but a disagreement silently overrides the hint instead of erroring — this is the shape the [CLI](#cli) uses, since it only has a filename to go on.

Content sniffing only covers binary-signature formats (images, video, PDF, archives, executables, ...) — text-based formats (`.txt`, `.csv`, `.svg`, ...) can't be sniffed this way and fall through to whichever hint was given, unverified.

**`recipes` filtering**

- `null` or `[]` — runs every named pipeline configured for the asset's resolved mime group (the default, "give me everything").
- A non-empty list of `"{mime_group}.{pipeline_name}"` strings (e.g. `["image.phash16", "video.frame5_phash16"]`) — every entry is checked against the _whole_ config first: an entry that matches no known recipe anywhere is always a `400`, regardless of which asset it's attached to. The list is then narrowed to whichever entries are prefixed with this asset's own `"{mime_group}."` and only those run.
- If none of the (already-valid) requested recipes apply to this particular asset's mime group — e.g. a filter built for images and videos gets a PDF upload — `core` falls back to the wildcard (`"*"`) group's first-declared pipeline (typically `binary.sha256`) rather than returning nothing. The reported `recipe` in the result reflects whichever pipeline actually ran.

This lets one `core` deployment host many named pipelines per mime group (different projects wanting different perceptual-hash algorithms, or several variants of the same one) while each caller passes only the `recipes` it actually wants computed.

**Success response — `200`**

Every result entry is either `{ recipe, hashes: string[] }` or `{ recipe, vectors: number[][] }` — always an array, regardless of whether the underlying pipeline step produced one value (a plain `algorithm`, or `extractor` + `algorithm` + `pooling: mean`, both wrapped as a length-1 array) or several (`extractor` + `algorithm`, no `pooling`, ordered to match the extractor's output). There is no separate scalar/singular shape to branch on — a consumer checks `hashes.length`/`vectors.length` if the count matters.

```json
{
  "results": [
    { "recipe": "image.sha256", "hashes": ["e3b0c4..."] },
    { "recipe": "image.phash8", "hashes": ["a1b2c3d4e5f6a7b8"] }
  ]
}
```

```json
{
  "results": [
    { "recipe": "video.sha256", "hashes": ["e3b0c4..."] },
    { "recipe": "video.frame5_phash8", "hashes": ["a1b2...", "b2c3...", "c3d4...", "d4e5...", "e5f6..."] }
  ]
}
```

**Errors**

| Status | Cause                                                                                                                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | Missing/invalid `mime_hint` or `file_content`, `file_content` isn't valid base64, a `recipes` entry matches no known recipe, or the claimed mime (`mime_hint.type: "mime"`) contradicts the asset's sniffed content |
| 422    | The asset couldn't be processed (corrupt file, a subservice reported an item error)                                                                                                                                 |
| 502    | A subservice socket was unreachable or dropped mid-pipeline                                                                                                                                                         |

**Example**

```bash
curl -X POST http://localhost:3000/hash \
  -H "Content-Type: application/json" \
  -d '{"mime_hint": {"type": "mime", "value": "image/jpeg"}, "file_content": "'"$(base64 -w0 photo.jpg)"'", "recipes": null}'
```

```bash
# Only compute image.phash16, whatever else the mime group's pipelines might offer.
curl -X POST http://localhost:3000/hash \
  -H "Content-Type: application/json" \
  -d '{"mime_hint": {"type": "mime", "value": "image/jpeg"}, "file_content": "'"$(base64 -w0 photo.jpg)"'", "recipes": ["image.phash16"]}'
```

---

## `GET /algorithms`

Lists every `{ recipe, comparison }` derived from the current config's `pipelines` + `algorithms[*].comparison` — a pure function of config, never hand-authored.
Diagnostic endpoint; also what `asset-dedup-registry`'s `CodeResolver` fetches (once, cached) to upsert `code`/`comparison` into its own `algorithm` table.

**Success response — `200`**

```json
{
  "algorithms": [
    { "recipe": "binary.sha256", "comparison": "exact" },
    { "recipe": "image.sha256", "comparison": "exact" },
    { "recipe": "image.phash8", "comparison": "hamming" },
    { "recipe": "video.frame5_phash8", "comparison": "hamming" }
  ]
}
```

**Example**

```bash
curl http://localhost:3000/algorithms
```

---

## `GET /healthz`

Shallow liveness check by default.
`?deep=true` additionally probes every configured subservice socket (`config.yaml`'s `subservices`) and reports which are reachable.

**Query parameters**

| Param  | Required | Description                                                 |
| ------ | -------- | ----------------------------------------------------------- |
| `deep` | no       | If `"true"`, also probes every configured subservice socket |

**Success response — `200`**

```json
{ "status": "ok" }
```

```json
{
  "status": "ok",
  "subservices": [{ "subservice": "image-hash", "reachable": true }]
}
```

**Degraded response — `503`** (only possible with `?deep=true`, when at least one subservice is unreachable)

```json
{
  "status": "degraded",
  "subservices": [{ "subservice": "image-hash", "reachable": false }]
}
```

**Example**

```bash
curl http://localhost:3000/healthz
curl "http://localhost:3000/healthz?deep=true"
```

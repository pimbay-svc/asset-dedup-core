# Usage Reference

The README's Usage section is deliberately minimal — one real command and its real output, proving the service works.
This file holds everything that doesn't fit there: a full end-to-end workflow shaped like real usage, advanced options, pagination, and edge cases worth calling out explicitly.

## A full resolve → hash → filter workflow

`core` is stateless — there's no provisioning step, only a sequence a caller actually goes through: discover what recipes exist for the current config, hash an asset against all of them, then narrow to just the ones actually needed. All against `config/config.example.yaml`, over HTTP.

### 1. Discover available recipes

`GET /algorithms` is a pure function of the running config — always check this first against an unfamiliar deployment rather than assuming which recipes exist.

```bash
curl http://localhost:3000/algorithms
```

```json
{
  "algorithms": [
    { "recipe": "binary.sha256", "comparison": "exact" },
    { "recipe": "image.sha256", "comparison": "exact" },
    { "recipe": "image.phash16", "comparison": "hamming" },
    { "recipe": "video.sha256", "comparison": "exact" },
    { "recipe": "video.frame5_phash16", "comparison": "hamming" },
    { "recipe": "pdf.sha256", "comparison": "exact" },
    { "recipe": "pdf.pages_phash16", "comparison": "hamming" }
  ]
}
```

### 2. Hash a JPEG with every recipe for its resolved group

Omitting `recipes` (`null`) runs every named pipeline for the mime group `photo.jpg` resolves to — here, `image`.

```bash
curl -X POST http://localhost:3000/hash \
  -H "Content-Type: application/json" \
  -d '{"mime_hint": {"type": "mime", "value": "image/jpeg"}, "file_content": "'"$(base64 -w0 photo.jpg)"'", "recipes": null}'
```

```json
{
  "results": [
    { "recipe": "image.sha256", "hashes": ["e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"] },
    { "recipe": "image.phash16", "hashes": ["a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"] }
  ]
}
```

### 3. Narrow to a single recipe

Same file, but only `image.phash16` is wanted this time — useful once a caller already has `sha256` on file and just needs the perceptual hash.

```bash
curl -X POST http://localhost:3000/hash \
  -H "Content-Type: application/json" \
  -d '{"mime_hint": {"type": "mime", "value": "image/jpeg"}, "file_content": "'"$(base64 -w0 photo.jpg)"'", "recipes": ["image.phash16"]}'
```

```json
{ "results": [{ "recipe": "image.phash16", "hashes": ["a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"] }] }
```

### 4. The same file, via the CLI

The CLI drives the exact same `CalculateHash` command, with the mime hint taken from the filename extension instead of a caller-supplied claim:

```bash
npm run cli -- hash file ./photo.jpg --recipes image.phash16 --json
```

```json
{ "results": [{ "recipe": "image.phash16", "hashes": ["a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"] }] }
```

## Filtering to a subset that doesn't apply to the asset

`recipes` is validated against the _whole_ config, not just the uploaded asset's mime group — a filter built for one asset shape still has to resolve to something usable when it's applied to a different one, rather than silently returning nothing.

If none of the requested (already-valid) recipes match the asset's own mime group, `core` falls back to the wildcard group's first-declared pipeline — `binary.sha256` in the example config — instead of an empty result:

```bash
# Requesting only image recipes, but uploading a PDF.
curl -X POST http://localhost:3000/hash \
  -H "Content-Type: application/json" \
  -d '{"mime_hint": {"type": "mime", "value": "application/pdf"}, "file_content": "'"$(base64 -w0 doc.pdf)"'", "recipes": ["image.phash16"]}'
```

```json
{
  "results": [
    { "recipe": "binary.sha256", "hashes": ["b5d4045c3f466fa91fe2cc6abe79232a1a57cdf104f7a26e716e0a1e2789df78"] }
  ]
}
```

Note the reported `recipe` in the response — it always reflects whichever pipeline actually ran, not the one that was requested.

## Edge cases

### An unknown recipe is always a 400, regardless of the asset

A `recipes` entry that matches nothing in the whole config is rejected before the asset is even looked at:

```bash
curl -X POST http://localhost:3000/hash \
  -H "Content-Type: application/json" \
  -d '{"mime_hint": {"type": "mime", "value": "image/jpeg"}, "file_content": "'"$(base64 -w0 photo.jpg)"'", "recipes": ["image.does_not_exist"]}'
```

```json
{ "error": "unknown recipe \"image.does_not_exist\"" }
```

### A claimed mime that disagrees with the file's content is rejected, not corrected

`mime_hint: { type: "mime" }` is an assertion the caller is held to. Labeling an executable as `image/jpeg` doesn't get silently routed into the image pipeline — it's a hard `400`:

```bash
curl -X POST http://localhost:3000/hash \
  -H "Content-Type: application/json" \
  -d '{"mime_hint": {"type": "mime", "value": "image/jpeg"}, "file_content": "'"$(base64 -w0 not_actually_a_jpeg.bin)"'", "recipes": null}'
```

```json
{
  "error": "claimed mime \"image/jpeg\" does not match the mime detected from the file's content (\"application/x-executable\")"
}
```

The CLI's `{ type: "extension" }` hint is never held to this standard — a wrong extension is silently overridden by the content sniff instead of erroring, since nobody asserted anything the caller should be held to. See `docs/api.md`'s `mime_hint` section for the full asymmetry.

### `?deep=true` reports per-subservice reachability, not just overall status

```bash
curl "http://localhost:3000/healthz?deep=true"
```

```json
{
  "status": "degraded",
  "subservices": [
    { "subservice": "image-hash", "reachable": true },
    { "subservice": "video-frame-extract", "reachable": false },
    { "subservice": "pdf-page-extract", "reachable": true }
  ]
}
```

`status` is `"degraded"` (HTTP `503`) the moment any single subservice is unreachable — even if the specific recipe a caller cares about doesn't depend on the one that's down.

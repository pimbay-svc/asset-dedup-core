# CLI Reference

```bash
npm run cli -- hash file <path> [options]
```

Runs `dist/presentation/cli/cli.js` — run `npm run js:build` first if `dist/` isn't already up to date.

Errors go to stderr as `Error: <message>` and exit with a non-zero status.
Exit code `0` = success, `1` = error — no other codes are used.

---

## `hash file <path>`

Runs a local file through the same pipeline `POST /hash` uses: resolves a mime hint from the file's extension, verifies it against the file's actual content, resolves the mime group, and runs that group's named pipelines (all, or the requested `--recipes` subset).

The mime hint is always `{ type: "extension", value: <extension from the filename> }` — see `docs/api.md`'s `mime_hint` section for the verification behavior (a disagreeing content sniff silently overrides a wrong extension). A file with no extension at all is rejected before anything is read, with no dispatch to the pipeline.

| Option                            | Required | Description                                                                                                                    |
| --------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `<path>`                          | yes      | Path to the local file to run through the pipeline.                                                                            |
| `--recipes <recipe1,recipe2,...>` | no       | Comma-separated recipes to run. Default: every recipe configured for the resolved mime group.                                  |
| `--json`                          | no       | Print the full `{ "results": [...] }` shape (same as `POST /hash`'s response body, no truncation) instead of formatted tables. |

**Example**

```bash
npm run cli -- hash file ./photo.jpg
```

**Output**

Text mode prints a `hashes` table first (only if at least one result is hash-based), then a `vectors` table (only if at least one result is vector-based) — one table per result kind, so no row has an empty column:

```
recipe          hashes
--------------  --------
image.sha256    e3b0c44298fc1c14...
image.phash8    a1b2c3d4e5f6a7b8
```

```
recipe       total  vectors                          remaining
-----------  -----  -------------------------------  ---------
image.clip   7      [0.12, -0.04]; [0.31, 0.02]; ...  2
```

Only the first 5 vectors are previewed per recipe (`total`/`remaining` report the full count) — use `--json` for the complete, untruncated vectors.

**Example with `--recipes` and `--json`**

```bash
npm run cli -- hash file ./photo.jpg --recipes image.phash16 --json
```

```json
{ "results": [{ "recipe": "image.phash16", "hashes": ["a1b2c3d4e5f6a7b8"] }] }
```

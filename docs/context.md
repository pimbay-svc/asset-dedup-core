# Context

> Working memory, not a historical record.
> Continuously edited, not append-only — unlike DECISIONS.md.
> When something here resolves: delete it if it was only ever local/temporary, or promote it to DECISIONS.md if it turned out to matter beyond this moment.
> Don't let resolved items pile up here.

## Current focus

Nothing in progress right now.

## Open questions

None currently open.

## Known limitations / non-goals (for now)

- Embedding-based algorithms (`kind: subservice`, comparison `cosine`) aren't usable yet — the `embedding` subservice they'd delegate to isn't built. `config/config.example.yaml` keeps a commented-out `clip-vit-b32` entry as a placeholder; don't reference it from any `pipelines` entry until that subservice exists.

## Implementation notes

- **Fail-closed pipeline execution** — any `error` anywhere in any subservice response for one asset aborts that asset's entire pipeline; `PipelineService` never writes a partial result set for an asset with some recipes computed and others failed. This is deliberate, not an oversight — don't add a "best-effort" mode that returns whatever succeeded.
- **Subservice socket protocol has no request id — one call in flight per connection.** Every extension speaks `[4-byte BE length][UTF-8 JSON]`, request `{ op, config, inputs }`, response `{ outputs }`. There is no request id in either direction — an unrecognized `op` gets no response frame at all, and a valid response can only be matched to whichever call is currently in flight on that connection. `SubserviceConnection` therefore queues calls and keeps strictly one in flight per connection at a time; it must never send a second request before the first one's response (or timeout) resolves.
- **`file-type` doesn't cover text-based formats** — content sniffing (`infrastructure/mime/fileTypeMimeDetector.ts`) only recognizes binary-signature formats. `.txt`, `.csv`, `.svg`, and similar have no magic-byte signature, so `detectFromBuffer` returns `undefined` for them, not a wrong answer. `MimeService` treats `undefined` as "can't verify" and falls back to trusting whichever hint was given — an `undefined` sniff is expected for an entire class of legitimate input, not a sign something's broken.

## Ideas / future plans

None beyond the embedding subservice above.

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

None currently.

## Ideas / future plans

None beyond the embedding subservice above.

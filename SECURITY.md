# Security Policy

## Reporting a vulnerability

Report suspected security vulnerabilities privately — do not open a public issue for them.

Use [GitHub Security Advisories](https://github.com/pimbay-svc/asset-dedup-core/security/advisories/new) for this repository, or email **security@pimbay.dev**.

Include what you'd include in any bug report: affected version/commit, reproduction steps, and impact as you understand it.
A proof-of-concept is helpful but not required to file a report.

## What to expect

- Acknowledgement within 5 business days.
- An initial assessment (confirmed / not applicable / needs more information) within 10 business days of acknowledgement.
- Credit in the fix's changelog entry, unless you ask to stay anonymous.

There is no bug bounty program.

## Scope

In scope: this repository's own code (`src/`), its `docker/Dockerfile`, and its GitHub Actions workflows.

Out of scope: vulnerabilities in third-party dependencies with no `asset-dedup-core`-specific exploitation path — report those upstream instead (see `docs/THIRD-PARTY-NOTICES.md` for what's bundled).
If you're unsure whether something is in scope, report it anyway and let us triage it.

## Supported versions

Only the latest published version/image tag receives security fixes.
This project does not currently maintain long-term-support branches.

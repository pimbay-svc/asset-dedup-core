# Third-Party Notices

This project itself is released under [The Unlicense](../LICENSE).
It bundles the following third-party software, each under its own permissive license.

## npm dependencies

Full list with versions and licenses: run `npx license-checker --summary --production --excludePrivatePackages` — don't hand-maintain a duplicate of `package.json`/`package-lock.json` here.
Every transitive dependency currently resolved is verified directly against each package's own `package.json` `license` field, not assumed; none of it is copyleft.

Direct runtime dependencies — listed even though none carry an attribution requirement, so a reader doesn't have to run the tool just to see there's nothing unusual here:

| Package               | License | Note |
| --------------------- | ------- | ---- |
| `awilix`              | MIT     | —    |
| `commander`           | MIT     | —    |
| `fastify`             | MIT     | —    |
| `@fastify/swagger`    | MIT     | —    |
| `@fastify/swagger-ui` | MIT     | —    |
| `file-type`           | MIT     | —    |
| `mime`                | MIT     | —    |
| `pino`                | MIT     | —    |
| `yaml`                | ISC     | —    |
| `zod`                 | MIT     | —    |

## Notes

This is not legal advice.
Everything bundled here is currently permissive (MIT/ISC family).

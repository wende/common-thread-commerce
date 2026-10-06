# Development commands

Run these from the repository root. Node.js 22 or newer is required; no npm installation or build is needed.

```sh
npm --prefix tooling test
npm --prefix tooling run test:glovo
npm --prefix tooling run test:shopping
```

Offline Python accounting checks and their dependencies are documented in [Shopping benchmarks](../shopping/benchmarks/README.md).

The optional [three-store fixture](../demo/README.md) requires Docker Compose:

```sh
npm --prefix tooling run setup
npm --prefix tooling run start
npm --prefix tooling run status
npm --prefix tooling run verify
npm --prefix tooling run stop
```

These commands resolve `demo/compose.yaml` and the ignored `demo/.env`. The fixture retains the `common-thread-commerce` project name and its named volumes. Use `docker compose -p another-name ...` from `demo/` for an independent installation.

Glovo's optional bridge CLI is `node glovo/tools/bridge.mjs help`; the HTTP guest-basket helper is `node glovo/tools/http-basket.mjs --help`. Read [the operating guide](../glovo/AGENT.md) before a shopping run: the bridge CLI writes a transport journal, while measured browser runs keep their results in memory.

Historical benchmark transcripts and JSON retain their original recorded paths. Active guides, loaders and measurement tools use the reorganized paths. Immutable experiment snapshots remain under the ignored `output/` directory.

# Development commands

Run these from the repository root. Node.js 22 or newer is required; no npm installation or build is needed.

```sh
npm --prefix tooling test
npm --prefix tooling run test:glovo
npm --prefix tooling run test:shopping
```

Offline Python accounting checks and their dependencies are documented in [Shopping benchmarks](../shopping/benchmarks/README.md).

The optional [three-store fixture](../shopping/demo/README.md) requires Docker Compose:

```sh
npm --prefix tooling run setup
npm --prefix tooling run start
npm --prefix tooling run status
npm --prefix tooling run verify
npm --prefix tooling run stop
```

These commands resolve `shopping/demo/compose.yaml` and the ignored `shopping/demo/.env`. The fixture retains the `common-thread-commerce` project name and its named volumes. Use `docker compose -p another-name ...` from `shopping/demo/` for an independent installation.

Glovo's optional bridge CLI is `node glovo/tools/bridge.mjs help`; the HTTP guest-basket helper is `node glovo/tools/http-basket.mjs --help`. Read [the operating guide](../glovo/AGENT.md) before a shopping run: the bridge CLI writes a transport journal, while measured browser runs keep their results in memory.

Historical benchmark transcripts and JSON retain their original recorded paths. Active guides, loaders and measurement tools use the reorganized paths. Immutable experiment snapshots remain under the ignored `output/` directory.

## Experiment pages

Open `shop-agent.html` or `glovo.html` from the repository root in a browser. Their charts and styles are embedded; optional Google Fonts fall back to system fonts offline.

For a local preview, run `python3 tooling/preview-pages.py` from the root. It binds to loopback port 8095 and serves an explicit allowlist of the experiment pages, source scripts, linked reports and generated Glovo race assets. On this workstation a background LaunchAgent keeps it running independently of chat, with private Tailscale Serve HTTPS on port 18095. Existing Serve routes remain intact.

GitHub Pages publishes only the six files explicitly listed in `tooling/build-pages.py`, plus a homepage alias and `.nojekyll`. The site source lives in the public companion repository `wende/common-thread-experiment-pages`; this main repository remains private. The current account plan does not support Pages directly on the private repo. To update the site, build into an empty directory and commit only those exported files to the companion repository’s `main` branch. All other repository content stays outside the public artifact.

## Glovo visual race

The current page at /glovo-race/ shows actual screenshots captured from the live Glovo Chrome tab on 6 October 2026. Codex drove the native menu, added McDouble and standalone McChicken, selected the small chocolate shake with SUP cup, and added the apple pastry. The native basket was verified as four products, quantity one each, totaling 61.50 PLN. These are a replay of the task, not a new timed Luna benchmark. The original benchmark means remain 292.7s versus 81.6s (72.1% less time).

The replay contains twelve native UI screenshots and six adapter screenshots, captured through the existing Kimi WebBridge connection. The adapter searched for the four products and added them in one batch, with the small shake and SUP cup selected. Both native baskets were independently verified. The final screenshots show all four rows using Chrome’s normal 90% zoom; the live basket remains full. No checkout was submitted.

The former mock screenshots and media are withdrawn from preview routes and archived under ignored `output/glovo-race/superseded-mock/`. Actual captures are in `output/glovo-race/real-steps/`; `data.json` records their labels, capture times, SHA-256 hashes and basket verification. `steps.zip` contains all eighteen screenshots. The displayed 254s and 58s finish times and every intermediate timestamp are illustrative replay pacing, not new measured Luna timings. Cleanup is omitted.

After capturing and verifying both baskets, run `python3 glovo/tooling/build-glovo-browser-replay.py`, then `python3 glovo/tooling/render-glovo-browser-replay.py` to produce the MP4, GIF, poster, contact sheet and screenshot ZIP. The renderer requires Pillow and imageio-ffmpeg. It composes actual browser captures without creating or editing their page contents.

The earlier historical replay is preserved under `output/glovo-race/historical-v0.4/`. `python3 glovo/tooling/render-glovo-race.py --mp4` regenerates it there from v0.4 baseline run 2 and adapter run 3. Their real recorded times are 706.525s versus 98.456s (86.1% less time). That pair used the older WebBridge workflow and is different from the later v0.4.2 native-browser mean comparison. Its sparse screenshots cannot show every historical browsing step. The race and step gallery are served privately and remain excluded from the GitHub Pages export allowlist.

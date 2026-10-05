# Concurrent Codex browser benchmark

The [experiment summary](EXPERIMENT_SUMMARY_2026-10-05.md) compares the browser-only baseline, the first commerce API run, and catalog reuse with no agent report. The latest cohort completed all six verified handoffs in 77.820 seconds; the summary includes per-platform timings, token accounting, interactions, timeouts and grading differences.

The `results/` directory contains portable measurement snapshots and a handle-normalized instruction bundle. It excludes browser/session identifiers, cookie and storage state, raw protocol logs and model transcripts. Full generated artifacts remain in ignored `output/`; historical analysis scripts require those local raw traces. Reports mark additional local-only artifacts explicitly. The snapshot's `sourceReportSha256` identifies its original raw controller report.

Launch 10 independent Codex workers using **gpt-6-luna / xhigh**. Each worker gets one fresh Chromium browser context, one page and an opaque handle. The harness uses the authenticated local Codex app-server; it needs no separate OpenAI API key. It refuses unavailable models or unsupported reasoning effort instead of substituting a model.

## Run

Requires Node 20+, an authenticated `codex` CLI, and Chromium installed by Playwright.

```sh
cd experiments/agent-browser
npm ci
npx playwright install chromium
npm test

# Validation: 2 concurrent agents, repeated in 2 sessions (4 trials).
npm run dual

# Full configured workload: 10 concurrent agents, one session.
npm run ten

# Keep the completed browsers visible for human takeover.
node run.mjs --agents 10 --sessions 1 --keep-open
```

`--agents` defaults to 10. `--sessions` defaults to 1 and repeats the concurrent cohort. Earlier contexts stay open during later sessions and are re-verified at the end. Separate invocations can run simultaneously: each has a UUID run directory, ephemeral port, app-server process, temporary Codex home and browser process. There is no shared current-tab pointer. `--timeout 240` bounds each agent's turn; browser actions have 10-second timeouts and protocol requests have 60-second timeouts. `--headed` shows the browser while testing. `--keep-open` implies headed mode and retains the browser and fixture server until Ctrl-C.

The default task searches for a product, changes its quantity, adds it to the cart and opens the cart. Product and quantity vary by worker/session. This is a deterministic local fixture, not one of the project's real commerce engines.

## Assignment and isolation

The exact user-provided pre-prompt is in `isolation.txt`; it is included verbatim as a developer instruction and at the start of every worker task. Generated prompts are retained with the results.

`broker.mjs` binds each Codex thread ID to its page. The worker cannot choose a different tab, context or browser. Its only tool supports `snapshot`, `click`, `fill`, `press` and `handoff`. The broker validates the supplied handle against the caller's thread, serializes actions per thread and denies operations after handoff. It offers no arbitrary JavaScript, navigation command, tab enumeration, tab creation/closure or browser-global control. Clicking links remains possible in the assigned page. Popups are closed by the controller.

Contexts isolate cookies, local storage and session storage. The fixture writes unique ownership markers and checks them alongside the cart contents. Test-only unit probes verify that foreign handles, unknown callers, global actions, extra target fields, false success and actions racing with handoff are rejected.

Workers use a temporary Codex home that links the existing authentication file, without inheriting personal config, plugins, MCP servers or hooks. Shell, computer use, built-in browser tools, web search and subagent tools are disabled. Codex's code-mode host remains enabled because this CLI routes dynamic tools through it. This is a restricted browser-tool interface, not an OS sandbox for executing hostile code. The coordinator owns the browser and its contexts.

The in-app browser API available during development exposed tabs but no isolated-context constructor. Kimi's documented sessions group tabs inside a shared browser profile. A dedicated Playwright test browser therefore supplies actual isolated contexts for this automated test; no personal browser profile is attached.

## Success and browser handoff

The worker must call `handoff`. The controller independently verifies the task, saves a screenshot, revokes worker access and returns a receipt. The worker then reports SUCCESS. The controller checks the page again after the turn and after all later sessions.

PASS requires a completed Codex turn, a successful verified handoff, an explicit success report, available token accounting, no model rerouting, and no observed unexpected tool request. A claimed SUCCESS alone is insufficient.

Default automated runs hand the page back to the controller, save artifacts and close browsers during teardown. **Use `--keep-open` for live human handoff**. The browser process stays alive; agents have finished and their handles are revoked. Ctrl-C ends the test and closes its browser. Stored state is a portable cookie/local-storage artifact, not a saved live page; session storage is checked during the run but isn't included in Playwright's storage-state export.

## Measurements and outputs

Each invocation writes to `output/playwright/agent-browser/<timestamp>-<uuid>/` at the project root:

- `report.json` / `report.md`: status, timings and usage per worker, verification evidence, handoff state and action audit.
- `events.jsonl`: app-server events, including authoritative token-usage updates.
- `model.json`: discovered model capabilities, including support for xhigh.
- `session-*-agent-*.prompt.txt`, `.png`, `.storage.json`: exact prompt, completed-page screenshot and storage state.
- `fatal.json`: setup/protocol errors if the run aborts.

`seconds` measures turn submission through `turn/completed`; `handoffSeconds` measures time until verified handoff; `totalSeconds` includes context/thread setup. `wallSeconds` covers the complete run. Token usage comes from `thread/tokenUsage/updated.total` on each fresh single-turn thread. Cached input tokens are included in input tokens, and reasoning output is included in output tokens: do not add these subset fields again. Missing usage is reported as unknown and prevents PASS. Timeouts/failures cause a nonzero exit. Runs use the existing Codex account's quota.

## Use a specific website/task

Create a task JSON with a starting URL, instructions and exact visible success texts:

```json
{
  "url": "http://localhost:8091/",
  "prompt": "Find the requested demo product, add one to the cart, and leave the cart open. Do not place an order.",
  "expect": ["REPLACE WITH EXACT EXPECTED CART TEXT"]
}
```

Replace the example's prompt and expected text with the actual task and assertions, then run:

```sh
node run.mjs --agents 2 --sessions 2 --task /absolute/path/task.json
```

The custom-task verifier checks each exact text is visible; customize `assignment.verify` in `run.mjs` for richer site-specific assertions. The built-in storage-ownership assertions apply only to the fixture. Each custom-task worker starts logged out in its own context. A workflow requiring login, uploads, arbitrary JS, cross-tab operations or extra browser actions needs an explicitly designed extension of the tool interface. The current runner does not silently widen access.

## Protocol reference

[Official Codex app-server documentation](https://learn.chatgpt.com/docs/app-server) describes thread/turn creation, experimental dynamic tool calls and token usage notifications. This implementation was checked against the installed CLI's generated experimental protocol types. These experimental fields may change with CLI versions.

## Commerce API tools experiment

```sh
node commerce-smoke.mjs
node run.mjs --agents 2 --sessions 1 --task vague-commerce-task.json --commerce-tools --timeout 600 --keep-open
```

`--commerce-tools` adds `assigned_shop` alongside the existing browser fallback. Workers inspect a normalized storefront API catalog, optionally batch searches/details, and synchronize desired quantities in one tool call. The shopping prompt and isolation pre-prompt are unchanged. Tool instructions change to explain the new interface. Product choices are made by workers; adapters never read the seed catalog. The controller's independent cart verifier still uses the seed catalog to check names, prices, stock and quantities.

WooCommerce uses Store API catalog/cart and native mutation batching; PrestaShop uses storefront listing/cart AJAX with serialized writes; Magento seeds the browser basket through its form and reuses its masked ID for GraphQL batching. HTTP transport shares the assigned context's cookies, validates every redirect origin, and keeps session tokens/cart IDs internal. Product handles are specific to the assignment. Repeated operation IDs do not repeat writes. Simple products and positive quantities are supported; variants and checkout are outside this prototype's API contract.

Both tools share a per-thread queue and are revoked at handoff. The shop handoff opens and verifies the native cart, checks API state, and retains the live context with `--keep-open`. `commerce-broker.test.mjs` checks isolation, redirect rejection, stale revisions, retry handling and revocation. `commerce-smoke.mjs` checks two isolated sessions per shop without launching model workers.

Reports separate agent tool calls, explicit API requests, HTTP write requests, native mutation operations, browser fallback calls and internal helper browser work. `browserToolSeconds` remains the legacy JSON field name for all assigned-tool time; Markdown reports explain this. Manual page interaction counts use the earlier snapshot/click/fill/press definition. Native API helpers still perform browser work internally, and automatic page network traffic is excluded from explicit API counts. Each run also archives its harness source and task configuration.

## Three-store comparison

### Catalog reuse with no agent report

```sh
node commerce-smoke.mjs --catalog-once
node run.mjs --agents 2 --sessions 1 --task vague-commerce-task.json --commerce-tools --catalog-once --stop-at-handoff --timeout 600 --keep-open
```

`--catalog-once` returns the complete available descriptions and category/attribute coverage with the first catalog inspection. The worker tool omits local search and product-detail actions because they duplicate the supplied catalog. Workers select directly from complete coverage, use sensible substitutions for absent types, and retain uncertainty for missing color or size. Incomplete coverage can still require the assigned browser. No product candidates are selected by the harness.

`--stop-at-handoff` overrides the task's detailed-report request. The controller sends `turn/interrupt` immediately after a successful, independently verified handoff; the expected turn status is `interrupted`. PASS requires the verified basket, handoff, available token counters, expected controller stop, no final agent message, and the existing isolation/model checks. It does not require an agent SUCCESS narrative. A brief choice/substitution explanation is captured in the basket tool's note to preserve the shopping request. Controller measurements and cart evidence are still saved, and workflow phase annotations are retained. Post-handoff time is labeled `turn_finalization` rather than reporting. Flags and harness source are archived for reproducibility. Live contexts remain available with `--keep-open`.

Commerce navigation waits for `domcontentloaded` with a 60-second bound, and handoff additionally waits for visible native cart quantity controls. It does not require network idle, which can time out on active storefront background traffic. Explicit API requests also have a 60-second bound. These reliability changes were required by the October 5 follow-up preflight and are recorded separately from the two requested experimental changes.

`commerce-task.json` supplies one shared prompt and the WooCommerce, PrestaShop and Magento starting URLs. Run two workers per target in a single round (six concurrent workers):

```sh
node run.mjs --agents 2 --sessions 1 --task commerce-task.json --timeout 300 --keep-open
```

Each worker opens a fresh context at its assigned homepage. The task adds two Canyon V-Neck Tees at $20.80 each and leaves the full cart page open with a $41.60 merchandise subtotal. No order is placed. `commerce-verifier.mjs` independently checks the full cart URL, a visible cart container, exactly one product line, quantity, product name, unit price and line subtotal. Shipping can differ among stores and is excluded from the comparison.

`press` supports keys such as Enter in a page-scoped input. `fill` can use an exact role/name or label/placeholder. An optional zero-based `index` disambiguates repeated links with the same accessible name. These actions remain bound to the assigned page. No site-specific action instructions are added to the shared prompt. The final report includes target names, the shared task prompt and per-worker results. Multiple targets are capped at ten concurrent workers in total.

## Vague three-item shopping task and detailed reports

```sh
node run.mjs --agents 2 --sessions 1 --task vague-commerce-task.json --timeout 600 --keep-open
```

The shared prompt describes a red-ish T-shirt, a possible coffee mug and a winter deal, with no product names, prices, size or catalog hints. Workers must explore the assigned shop, select three different items, explain missing-item substitutions and avoid claiming an unverified fit. Each cart contains one unit of each selected item. The catalog is loaded only by the controller's verifier, which validates the actual native cart without revealing candidate products to workers.

Workers mark discovery, comparison, cart and verification phases through a page-bound telemetry action. The controller measures phase intervals, every browser-call duration (including failures), queue time, URLs before/after actions and the slowest calls. The handoff receipt gives these measurements to the worker so it can ground its detailed report. Phase names and boundaries are worker annotations; durations are measured. Time outside browser calls includes model generation, transport, scheduling and orchestration and does not isolate pure reasoning time. Screenshots, assertion checks and return-to-controller overhead are included in handoff-tool time.

For each worker, `.agent-report.json` and `.agent-report.md` describe selected products and evidence, substitutions, fit uncertainty, where time went, difficulties and resolutions, search evidence and the final cart. `report.json` contains controller measurements and checks the report's product names, quantities and prices against the actual cart. `report.md` links to all six detailed reports. Token summaries explicitly separate cached input, uncached input and output; reasoning output remains a subset of output.

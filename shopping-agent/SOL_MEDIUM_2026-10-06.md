# Sol 6.1 Medium — adapter versus bare page

> Retrospective correction: these runs verified cart execution under an expanded recommendation/substitution prompt, not full satisfaction of the original shopping request. A beanie, cap or sunglasses does not fulfill the mug need. Token comparisons excluding cached input also require checking initial cache conditions; the Sol pair had unequal initial cache hits. See [the prompt and measurement audit](PROMPT_AND_MEASUREMENT_AUDIT_2026-10-06.md).

October 6, 2026 (Europe/Warsaw). Two fresh, concurrent `gpt-6.1-sol` agents with `medium` reasoning used the same shopping prompt in isolated PrestaShop browser sessions. Both completed the three-item cart task and left their native carts open.

The adapter run took **94.888 seconds**, versus **174.376 seconds** without it: **45.6% less time**, or a **1.84× elapsed-time ratio**. It used **16 versus 42 browser interactions**, but **5.7% more tokens excluding cached input**. This is one pair, not an established average.

## Conditions

- PrestaShop Classic at `http://localhost:8092/`, 530 products: 30 originals and 500 fillers.
- Same buried-product fixture as the Luna pair/retry. First original product at main-list position 87; originals beyond the first page in each category. Search, sorting and Prices drop remained native and available to both agents.
- A: isolated session `sol-pilot-a`, adapter v0.2.0 injected at document startup. B: isolated session `sol-pilot-b`, no injection.
- Both started with empty carts and the same first five filler products. Independent storage markers were verified after both were written, and again at final verification.
- Same ordinary Playwright CLI tools and shopping/isolation prompts, differing only in assigned session and artifact directory. Neither agent received adapter instructions, source files, product IDs, recommended products, or findings from previous runs.
- Both were spawned with no prior conversation history. No hints or interventions were sent during either run.
- Standard browser sessions were used because the available in-app surface lacked isolated-context creation and Kimi tab groups shared cookies. No host-side shopping tool was exposed.
- Adapter code remained unchanged throughout. SHA-256: `2d0dd0b07456a1f894d10a392c87067777ba46cdbc60dae4a73904e1c50ae793`.
- Starts were 16.435 seconds apart and execution overlapped. Each agent is timed from its own start.
- Temporary catalog ordering was restored afterward: all 1,060 category-position rows checked, zero mismatches. Carts remain open; no purchase or platform source modification occurred.

## Measurements

| Metric | With adapter (A) | Without adapter (B) |
|---|---:|---:|
| Wall time (seconds) | 94.888 | 174.376 |
| Agent tool calls | 13 | 23 |
| Browser interactions | 16 | 42 |
| Observed tool-call wait (seconds) | 20.985 | 47.883 |
| Tokens excluding cached input | 67,809 | 64,147 |
| Input tokens | 674,922 | 1,543,947 |
| Cached input (subset of input) | 609,408 | 1,484,032 |
| Output tokens | 2,295 | 4,232 |
| Reasoning output (subset of output) | 192 | 66 |
| Total tokens including cached input | 677,217 | 1,548,179 |
| Document navigations after setup | 1 | 14 |
| Fetch requests | 41 | 0 |
| XHR requests | 1 | 11 |

Combined usage: **131,956 tokens excluding cached input**, or **2,225,396 including cached input**. Excluding cached input means input − cached input + output. Reasoning output is already included in output; do not add it again. These counts are not a billing estimate.

Wall time uses telemetry task-start to task-complete events, including final response generation. Coordinator setup, verification, screenshots and restoration are excluded. Tool-call wait is observed call-to-output wall time; the remaining duration includes generation, scheduling and overhead, not exclusively reasoning.

One executed browser CLI command counts as one interaction, including an entire `run-code` script regardless of how many actions it contains. A model tool call can run multiple CLI commands. Failed commands count; file reads and viewing saved images do not. All 16/42 counted invocations were executed; there were no skipped shell-chain commands.

- A: 12 evals, 2 snapshots, 2 screenshots.
- B: 28 scripts, 6 snapshots, 3 clicks, 2 screenshots, 1 fill, 1 key press, 1 navigation command.

## What the agents did

A discovered the page banner and called `window.mcp.help()`. It batched catalog queries, used category names and the native sale listing, fetched seven product details, and compared product images on the starting page. It also used a JavaScript pagination loop to examine all 106 items in Accessories, returning only products whose observed names did not start with “Noise Product”. This was an agent-written category query loop, not a preloaded catalog or privileged answer list.

A encountered two argument errors: `onSale` at the query top level rather than inside `filters`, and seven IDs for a comparison limited to six. It corrected both. A screenshot still executed after the failed comparison call, so the count includes that unnecessary screenshot. It viewed the successful comparison image once, then added all three choices together, verified the native cart, and opened it for handoff. Its single document navigation was the final cart page.

B used the normal search box, opened product pages, inspected two screenshots, searched for drinkware, browsed Accessories with ascending and descending name sorting, and used Prices drop. It added products individually and checked the final cart. It hit one duplicate-link selector error and recovered using current snapshot references. It often separated the action and its subsequent `main.innerText()` read into separate browser scripts, adding interactions despite being allowed to batch.

The observed speed difference therefore combines the adapter’s programmatic catalog/cart access with the agents’ chosen workflows. The bare agent made more navigation/read steps; the adapter agent processed larger structured responses. The measurements establish the difference in this pair, not the individual causal contribution of every feature.

## Verified choices

| Product | Adapter | Bare page |
|---|---:|---:|
| Canyon V-Neck Tee | 1 × $20.80 | 1 × $20.80 |
| Trail Pocket Hoodie | 1 × $57.60 | 1 × $57.60 |
| Ridge Ribbed Beanie | 1 × $17.60 | — |
| Horizon Classic Sunglasses | — | 1 × $28.80 |
| Product subtotal | $96.00 | $107.20 |
| Displayed shipping | $7.00 | $7.00 |
| Total (USD) | **$103.00** | **$114.20** |

Both identified the tee as coral/red-ish from images, selected a discounted fleece hoodie, and disclosed unknown fit. Neither found a mug; each explained its accessory substitution as permitted by the prompt. Neither checked out.

Independent verification matched native `prestashop.cart` product IDs/quantities against the visible cart rows, confirmed distinct session markers and adapter presence only in A, and inspected both final screenshots. Both carts contain exactly three lines, each quantity one.

## Exact shopping prompt

> I don't really know what this shop has. I'm after a red-ish T-shirt that would suit me, maybe a mug for my coffee, and some good deal on something that'll keep me warm in winter. Could you pick three things you'd recommend? I'm not sure about brands or sizes and I haven't really got a budget in mind. If they don't sell one of those things, choose a sensible alternative and explain it. Put one of each in the cart so I can look at your choices, then leave it for me. Don't buy anything.

## Full prompt

The prompt below was sent to A. B received exactly the same text with `sol-pilot-a` replaced by `sol-pilot-b` and the assigned artifact directory ending in `/b` instead of `/a`.

```text
You control exactly one assigned browser context. Never inspect, switch to, interact with, navigate, close, or modify any tab, window, target, or browser context outside your assigned context. Never use global browser/tab controls. Only act through the page/session handles provided to you. If an action would require accessing anything outside your assigned context, stop and return `BLOCKED: outside assigned browser context`.

I don't really know what this shop has. I'm after a red-ish T-shirt that would suit me, maybe a mug for my coffee, and some good deal on something that'll keep me warm in winter. Could you pick three things you'd recommend? I'm not sure about brands or sizes and I haven't really got a budget in mind. If they don't sell one of those things, choose a sensible alternative and explain it. Put one of each in the cart so I can look at your choices, then leave it for me. Don't buy anything.

Your assigned browser is already open at http://localhost:8092/ in Playwright CLI session sol-pilot-a. Use only this provided session for browser work. The in-app browser could not provide isolated contexts, and Kimi tab groups share cookies, so the coordinator supplied this isolated session.

Browser command prefix: /Users/wende/.codex/skills/playwright/scripts/playwright_cli.sh --session sol-pilot-a
Run every command with workdir: /Users/wende/projects/shopping-assistant/output/playwright/sol-medium-20261006/a
Start by reading the page with `snapshot`; it prints the path of its generated snapshot, which you may read. Ordinary commands include `click REF`, `fill REF 'text'`, `press Enter`, `goto URL`, `eval '() => document.title'`, and `run-code 'async page => { return await page.title(); }'`. The provided `page` is your only page handle. You may batch browser actions in one run-code call. Observe current page state before choosing selectors or element refs. Use only live page evidence and interfaces you discover there.

Do not open other sessions/tabs, use global controls, read repository/source/catalog/experiment files, use shell HTTP clients or other shopping services, or access other agents. You may read only snapshot/screenshot artifacts generated by your assigned browser. Do not create reports or scripts. Leave the browser open on the normal cart page when finished and give a short explanation of your choices. The coordinator handles measurements. If clarification would help, make a reasonable recommendation using the user's flexibility and disclose uncertainty; do not invent fit/colour evidence.
```

## Evidence

Ignored local artifacts under `output/playwright/sol-medium-20261006/`:

- `coordinator/config.json`, `agent-ids.json`, `prompt-a.txt`, `prompt-b.txt`: run settings and exact prompts.
- `coordinator/measurements.json`, `trace-a.json`, `trace-b.json`: usage, timing, executed commands and source telemetry paths. No private reasoning is exported.
- `coordinator/initial-a.json`, `initial-b.json`: empty-cart and equal-initial-listing evidence.
- `coordinator/final-a.json`, `final-b.json`: native baskets, visible rows, markers and request observations.
- `a/final-cart.png`, `b/final-cart.png`: independently captured cart screenshots.
- `coordinator/positions-before.json`, `positions-during.json`, `restoration-verification.json`: temporary fixture and verified restoration.

Prior experiments: [Luna v0.1 pair](PILOT_2026-10-06.md), [Luna v0.2 retry](RETRY_2026-10-06.md). Cross-model differences also change reasoning effort (Luna xhigh versus Sol medium) and should not be attributed to model choice alone.

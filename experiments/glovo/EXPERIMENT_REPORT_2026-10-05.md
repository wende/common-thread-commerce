# Glovo: bare page vs. injected adapter

The adapter reduced mean task time from **4m 53s to 1m 22s**: **3.59× faster**, with **61.7% fewer uncached input + output tokens** and **73.2% fewer browser calls**.

## Mean results

| Metric | Bare page | With adapter |
| --- | --- | --- |
| Elapsed time | 292.7 s | 81.6 s |
| Uncached input + output tokens | 101,978 | 39,069 |
| Browser calls | 35.5 | 9.5 |
| Total tokens, including cached input | 2,557,466 | 564,317 |

All baskets were completed, captured in a screenshot and emptied.

## Task and approach

Open [McDonald’s Kraków on Glovo](https://glovoapp.com/en/pl/krakow/stores/mcdonald-s-kra), add one McDouble, one McChicken, one chocolate shake and one Ciastko Jabłkowe, take one basket screenshot, clean the basket and report difficulties.

Both conditions used Codex-native Chrome browser tools. Bare-page agents used Glovo’s visible controls. Adapter agents searched products in a batch, added them in a batch and removed the resulting receipts. Product IDs and required options were discovered from the current page. The adapter calls Glovo’s loaded JavaScript through a DOM command form.

## Mean adapter operation time

| Operation | Mean duration |
| --- | --- |
| Search four products | 10 ms |
| Add four products | 1.28 s |
| Remove four receipts | 1.15 s |

These in-page timings are included within browser calls, rather than additional session time.

## Difficulties

Bare-page agents encountered selector mismatches and DOM-read timeouts, then recovered. Adapter agents encountered no returned browser-tool errors.

## Measurement

Measured on 5 October 2026 using gpt-6-luna with xhigh reasoning and fresh contexts. Means use two agents per condition, run sequentially: bare page, then adapter, in the same signed-in browser session.

Time covers agent start through completion. Prepared tabs and adapter injection preceded timing. Token usage covers the whole agent session; uncached input + output subtracts cached input, and reasoning is already included in output. Browser-call counts include only native browser invocations. The full execution time is retained, including recovery and an extra cleanup screenshot in the bare-page condition.

The shared prompt supplied no product IDs or variant hints and required browser tools only. Adapter agents additionally received the API helper and method signatures inline. No agent used filesystem tools. The comparison describes these measurements; it does not establish a general performance guarantee.

## Sources

- [Bare page 1 — original session](/Users/wende/.codex/sessions/2026/10/05/rollout-2026-10-05T22-29-00-01a10dc1-6688-7bf1-a1e9-763028648b52.jsonl)
- [Bare page 2 — original session](/Users/wende/.codex/sessions/2026/10/05/rollout-2026-10-05T22-33-51-01a10dc5-d441-72d3-a3db-6f8d8cc2ad03.jsonl)
- [With adapter 1 — original session](/Users/wende/.codex/sessions/2026/10/05/rollout-2026-10-05T22-41-21-01a10dcc-b190-71d1-b0ea-2f0a17e3beff.jsonl)
- [With adapter 2 — original session](/Users/wende/.codex/sessions/2026/10/05/rollout-2026-10-05T22-46-04-01a10dd1-0314-7842-93dc-b25959068203.jsonl)

Each session records the timestamps, cumulative token usage, browser calls, returned cart/DOM results and inline screenshot. This report compiles those records without re-running the basket task.

Adapter implementation: [adapter.js](/Users/wende/projects/shopping-assistant/experiments/glovo/adapter.js); native client: [bridge-client.mjs](/Users/wende/projects/shopping-assistant/experiments/glovo/bridge-client.mjs). Tested adapter: **0.4.2**.

Companion: [HTML infographic](/Users/wende/projects/shopping-assistant/experiments/glovo/EXPERIMENT_INFOGRAPHIC_2026-10-05.html).

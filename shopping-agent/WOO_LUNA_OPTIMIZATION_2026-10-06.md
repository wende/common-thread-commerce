# WooCommerce Luna medium optimization — October 6, 2026

**Reached the stopping target in round 14 with Shop Agent v0.4.12.** The pair averaged **275,552.5 provider total tokens including cache**, versus **1,667,698** for three bare-page baselines: **6.05× fewer tokens**. Both treatment carts passed. Stopped at **31 fresh Luna medium agents** (three baselines plus 14 pairs), below the authorized 53-agent cap. All 28 treatment runs passed; all three baselines missed the red-ish tee, and one also missed the specified polo. This is a comparison with unsuccessful baseline attempts, not an equal-quality success comparison.

This campaign keeps the [six-item shopping request](../benchmarks/shopping/task-six-items.txt) fixed, preserving the three original needs. It starts with three fresh agents without the page adapter, run sequentially. Treatment rounds run two fresh `gpt-6-luna` agents with medium reasoning concurrently, each in an isolated Chrome context and with an immutable copy of the same page script revision. Workers receive only the shopping request, the exact browser isolation rule, and their ordinary Playwright CLI handle. Adapter documentation is discoverable on the page; workers receive no catalog answers or coordinator strategy hints.

The user chose a cap of **25 paired rounds after three baselines (53 agents total)**. Stop earlier when a paired round's mean provider total tokens, **including cached input**, is at most one-fifth of the three-run baseline mean and both carts pass independent quality checks. Count unsuccessful agents against the cap and report them. The first treatment round uses the existing v0.3 adapter; subsequent rounds diagnose observed interactions, implement general improvements in the single page script, test them, and repeat.

The primary score uses [provider total tokens](../benchmarks/shopping/README.md): input (already including cached input) plus output (already including reasoning). Cached input is never subtracted or counted twice. This includes inherited environment, tools, replayed history, and multimodal input as reported by the provider; it is an unweighted token count, not a monetary cost. The user corrected the metric during round 2. All completed runs were rescored from retained provider telemetry, with no reruns or exclusions. The previous text-plus-output task-work estimate remains a secondary diagnostic; image costs are unavailable separately in that diagnostic. Timing spans task start through completion. Sequential baselines and concurrent treatments have different contention, so time is reported without claiming a controlled speedup.

Each run starts with an empty native cart. All 530 products remain available, with the original 30 temporarily placed after 300 deterministic fillers in Storefront menu ordering (native catalog APIs retain their own ordering) using the same fixture ordering as the preceding benchmark. Save all positions and the default sort before the campaign, check for external changes before restoration, restore them when finished, and verify that no order was created. Store prices, stock, descriptions, and images are read by the worker through its own page. No platform source changes or host commerce broker are permitted.

Independent grading checks the native cart, rendered cart rows, quantities, context identity, and final cart URL. Available selections are Harbor Everyday Tee, the coral Canyon V-Neck Tee, Sunday Classic Polo (cotton pique and soft collar), Foundry Leather Belt (smooth leather and simple metal buckle), and a discounted warm item (Trail Pocket Hoodie or Ridge Ribbed Beanie). Each must be quantity one; no filler or mug substitute is acceptable. The fixture contains no mug or personal measurements. A qualifying run must disclose the missing mug and must not claim a confirmed fit. Images supply visual color evidence, not fit evidence. The coordinator retains screenshots and public final replies, never publishes private reasoning.

Machine-readable campaign state, immutable script snapshots, source-log pointers, command/network counts, cart evidence, and accounting are retained under `output/playwright/woo-luna-optimization-20261006/`. This ignored directory contains local audit artifacts; this report records the final results and limitations.

Store preview: [WooCommerce on the private tailnet](https://krzysztofs-mac-studio.tail657ea.ts.net:18091/). Cart cookies belong to each worker's browser context; opening this link in another browser creates a separate session.


The primary metric counts provider input plus output; cached input is already included in input. The final pair cache mean was **255,360**, included in the **275,552.5** total. The fivefold cutoff was **333,539.6**. Nothing was subtracted for schemas, inherited context, replay, mistakes, tool calls or images. The earlier four shopping runs belong to separate reports and are not counted in this new campaign.

| Run | Total tokens, cache included | Cached input (subset) | Seconds | Quality |
| --- | ---: | ---: | ---: | --- |
| b01 | 2,402,665 | 2,332,928 | 186.756 | Fail |
| b02 | 1,592,817 | 1,524,736 | 149.740 | Fail |
| b03 | 1,007,612 | 963,328 | 125.308 | Fail |
| r14a | 282,257 | 259,584 | 56.151 | Pass |
| r14b | 268,848 | 251,136 | 42.036 | Pass |
| Baseline mean | 1,667,698 | 1,606,997.3 | 153.935 | 0/3 |
| Round 14 mean | 275,552.5 | 255,360 | 49.094 | 2/2 |

Every pair used an immutable copy of one script revision. The table includes every completed round; no failed or long run was discarded. All pairs passed both native and rendered-main-cart checks.

| Round | Version | Mean total tokens | Mean cached input (subset) | Mean seconds | Token reduction | Quality |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | 0.3.0 | 1,369,137.5 | 1,311,488 | 175.013 | 1.218× | 2/2 |
| 2 | 0.4.0 | 1,304,267.0 | 1,250,816 | 190.646 | 1.279× | 2/2 |
| 3 | 0.4.1 | 816,845.5 | 776,320 | 126.140 | 2.042× | 2/2 |
| 4 | 0.4.2 | 731,649.5 | 670,976 | 90.677 | 2.279× | 2/2 |
| 5 | 0.4.3 | 667,012.5 | 633,472 | 94.896 | 2.500× | 2/2 |
| 6 | 0.4.4 | 481,779.0 | 447,360 | 62.612 | 3.462× | 2/2 |
| 7 | 0.4.5 | 621,824.0 | 573,440 | 60.597 | 2.682× | 2/2 |
| 8 | 0.4.6 | 440,458.5 | 403,072 | 43.484 | 3.786× | 2/2 |
| 9 | 0.4.7 | 464,393.5 | 425,472 | 50.023 | 3.591× | 2/2 |
| 10 | 0.4.8 | 475,851.5 | 438,784 | 56.830 | 3.505× | 2/2 |
| 11 | 0.4.9 | 478,058.0 | 444,928 | 62.907 | 3.488× | 2/2 |
| 12 | 0.4.10 | 489,749.5 | 452,352 | 66.697 | 3.405× | 2/2 |
| 13 | 0.4.11 | 428,701.0 | 402,304 | 47.445 | 3.890× | 2/2 |
| 14 | 0.4.12 | 275,552.5 | 255,360 | 49.094 | 6.052× | 2/2 |

The largest improvements were page-owned tool discovery, a bounded catalog scan that filters explicitly unwanted labels, coverage-aware availability guidance, lossless product tables, and a readable contact sheet for visual criteria. Sequential cart additions retain fresh preflight checks and a journal for replay/reconciliation; they are not atomic. Uncertain or partial writes stop, and no purchase method is exposed.

Later rounds reduced repeated observations: single-query overloads and exact IDs, a browser callback combining additions/navigation/main-cart verification, temporary native-frame verification before handoff, and optional whole-word feature probes in the same scan. Frame evidence is explicitly distinct from the main render; the coordinator still grades the main cart independently. The native frame adds a page load. Probes describe listing-text matches, not image color, sizing, full-product text or semantic absence.

Rounds 12–13 exposed scan-and-screenshot callbacks. One agent reached 283,640 tokens in round 13, but its slower partner kept that pair above the cutoff. One worker also repeated a scan after a truncated response. Version 0.4.12 deduplicates fields shared by every product, photo names already present in the table, and shared probe scope. It retains the original object catalog API and makes the browser example shorter. Both final workers used the documented scan-and-screenshot callback and the chosen-additions/main-verification callback; the second also ran an additional batched probe. Each used six model tool calls, one image observation, and one main-page navigation. They made three/four executed browser interactions respectively (excluding CLI help), with 48 fetch/XHR requests each.

Both final carts contain quantity one of Canyon V-Neck Tee (coral/red-ish, $20.80), Harbor Everyday Tee ($24), Ridge Ribbed Beanie (warm knit, $17.60 reduced from $22), Sunday Classic Polo (cotton pique/soft collar, $42), and Foundry Leather Belt (smooth leather/simple buckle, $39). Subtotal $143.40; estimated total $148.40 including shipping. Both disclosed the absent mug and unknown personal fit. Native identities/quantities, rendered rows, context marker and cart URL all matched; screenshots were inspected. No order was created.

The final source is [shop-agent.js](shop-agent.js), SHA-256 `ba521741789522256a63d880af7a5a51ba67d5ad961b0c32fc742018c1f8e07e`. All **38 adapter contract tests** and **9 accounting tests** passed. Live WooCommerce checks covered complete 530-record scans, all 30 original photos, the lossless table, feature probes, confirmed cart writes, journal replay, native-frame cleanup and main-render verification. PrestaShop and Magento also passed earlier page-tool discovery/read-only search smoke checks; this optimization result and the latest frame integration are WooCommerce-specific.

All 530 original positions were restored exactly. The default-sort option was absent before and after the campaign (WooCommerce's menu-order fallback); a restoration-helper assertion initially assumed an explicit option existed. The helper was corrected to preserve absence after checking the option did not exist, then restoration and unchanged order counts passed. This did not change the benchmark catalog ordering. Final native platform verification found 530 products on each store. Private tailnet pages and their assets passed: WooCommerce 59, PrestaShop 59, Magento 34 checked assets, with no failures, mixed-content URLs or localhost links. Docker services remain running independently of the chat; existing Tailscale routes were preserved.

This is adaptive optimization with one pair per revision and early stopping, not a held-out statistical estimate. Agent variability remains large; a favorable pair does not establish a repeatable 6.05× gain. Timing is descriptive because baselines ran sequentially and treatment pairs concurrently. Provider tokens are unweighted counts, not price-weighted cost; the task-work estimate excludes replay/environment/images and is only a secondary diagnostic. The fixed catalog has clearly named fillers, no mug, simple products, and no personal sizing data. The live browser used a page-owned registry fallback, not verified native WebMCP support. Successful cart handoffs stay in their assigned contexts under finite one-hour idle timeouts; opening a store link in another browser uses different cookies.

Stores remain available privately: [WooCommerce](https://krzysztofs-mac-studio.tail657ea.ts.net:18091/), [PrestaShop](https://krzysztofs-mac-studio.tail657ea.ts.net:18092/), and [Magento](https://krzysztofs-mac-studio.tail657ea.ts.net:18093/).

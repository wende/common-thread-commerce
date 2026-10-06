# WooCommerce Luna medium comparison on October 6 2026

In one fresh paired trial, the injected Shop Agent script used **56.6% fewer estimated task-work tokens** and **53.3% fewer browser interactions**, but took **17.6% longer** than the bare page. Both agents left verified two-item carts containing the red-ish tee and a discounted winter item. Neither fulfilled the mug or personal-fit need. This single pair does not establish a repeatable performance effect.

| Metric | Injected script | Bare page |
| --- | ---: | ---: |
| Elapsed time, seconds | 137.232 | 116.648 |
| Estimated task-work tokens | 25,149 | 57,909 |
| Observed tool-text tokens | 20,459 | 52,123 |
| Generated output tokens, including reasoning | 4,636 | 5,732 |
| Reasoning tokens, already included in output | 1,837 | 2,237 |
| Browser interactions | 21 | 45 |
| Agent tool calls | 24 | 34 |
| Failed browser interactions | 0 | 3 |
| Document navigations after setup | 1 | 15 |
| Browser-command time, seconds | 20.354 | 25.647 |
| Fetch and XHR request events | 75 | 21 |
| Native Store API request events | 73 | 19 |
| All request events | 218 | 811 |
| Image observations, token costs unavailable | 1 | 2 |

Task-work tokens follow [the repository accounting protocol](../benchmarks/shopping/README.md): the exact shopping request once, each observed tool response once, and provider-generated output including reasoning. The request contributes 54 estimated tokens to each arm. Text uses the pinned `o200k_base` tokenizer. Image input costs are unavailable, so these estimates are incomplete multimodal totals and are not billing totals. Provider totals including environment, replay, and caching were 1,175,573 and 2,287,302 respectively; their full components remain in the JSON evidence.

One executed Playwright command counts as one browser interaction, including failures; help/version calls do not. An entire `run-code` script counts once regardless of its internal actions. Fetch/XHR and Store API counts are separate request events, not interaction counts or bytes transferred. Browser-command time includes help and CLI overhead. Time outside those commands includes model generation, reasoning, other tools, scheduling, and overhead; it is not a direct measure of thinking time.

The bare-page agent independently discovered WooCommerce's public Store API and used it through normal browser JavaScript, including several scans of all six catalog pages. It also navigated native product and cart pages. The control therefore represents the ordinary page with unrestricted browser tools, not an enforced UI-only agent. The treatment discovered `window.mcp` from the injected page banner. Its lower visible work did not reduce elapsed time in this trial, and it made more native API requests.

Both native baskets matched their rendered product names and quantity-one controls:

| Condition | Items | Subtotal | Displayed total with shipping |
| --- | --- | ---: | ---: |
| Injected script | Canyon V-Neck Tee, Ridge Ribbed Beanie | $38.40 | $43.40 |
| Bare page | Canyon V-Neck Tee, Trail Pocket Hoodie | $78.40 | $83.40 |

The tee was $20.80, reduced from $26; the beanie was $17.60, reduced from $22; the hoodie was $57.60, reduced from $72. Both selected useful tee and winter candidates and disclosed the missing mug without adding an unrelated substitute. The fixture has no mug, size variants, or personal sizing data. Neither final handoff explicitly explained that personal fit could not be confirmed, although neither claimed a confirmed personal fit. These are partial task outcomes, not complete satisfaction of all three needs. No orders were placed.

Both measured agents used **`gpt-6-luna`, medium reasoning**, confirmed by source telemetry, and no inherited conversation history. They received the unchanged [three-need shopping request](../benchmarks/shopping/task-three-needs.txt), the unchanged [context-isolation instruction](../benchmarks/shopping/isolation.txt), and their assigned executable Playwright CLI handle and working directory. No adapter documentation, catalog answers, strategy hints, substitution permissions, opening snapshot command, or report assignment was added. The browser interface was identified equally in both prompts.

The request was:

> I'm after a red-ish T-shirt that would fit me, maybe a mug for my coffee, and a good deal on something that'll keep me warm in winter. Put one of each in the cart for me to review, then leave it for me. Don't buy anything.

Separate headed Chrome contexts used a 1280 by 900 viewport and `@playwright/cli` 0.1.22 behind a fixed-session execution logger. Both initially had empty baskets and identical 30-item filler-only listings. The shared 530-product catalog was temporarily ordered with seed 20261006: 300 fillers preceded the originals globally and 60 preceded them in every category. Search and sale endpoints kept their normal behavior. All 530 original ordering values and the prior default-sort setting were restored and checked with zero mismatches.

Only the treatment received `shop-agent.js` version 0.3.0, SHA-256 `f22c40b9e848b58d9d3b0ad2bf6f6692e0720e238ab941d82bd534857c4eb3bd`, through a browser initialization script that reinjected it on navigation. Platform source files were not changed. The agents shared one host and ran concurrently, with the treatment launched about nine seconds first; server caches and scheduling were not controlled.

An initial control attempt interpreted the executable handle as a CUA browser ID and stopped before shopping. Its treatment counterpart was interrupted. Both contexts were closed individually and replaced with fresh contexts and fresh agents after equally clarifying the ordinary browser interface. Those aborted attempts are retained as setup evidence and excluded from the paired comparison. Browser setup, injection, coordinator work, outcome verification, and ordering restoration are also excluded from the measured turns.

Evidence is retained locally under `output/playwright/woo-luna-medium-pair-20261006/`. The main comparison is `coordinator/report-data.json`; exact prompts, source-log pointers, token components, command logs, native and rendered cart snapshots, final screenshots, and ordering restoration checks are alongside it. The measured Chrome sessions `woo-lm26-a2` and `woo-lm26-b2` remain on their separate native carts with a one-hour idle timeout. The storefront is available privately at [the WooCommerce tailnet endpoint](https://krzysztofs-mac-studio.tail657ea.ts.net:18091/); another browser session will have its own basket.

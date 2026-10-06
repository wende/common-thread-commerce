# WooCommerce six item Luna medium run on October 6 2026

One fresh **Luna medium agent without the adapter** completed the corrected six-item task in **135.518 seconds**, using **61,865 estimated task-work tokens** and **60 browser interactions**. It left five matching original products in the native cart and reported that it could not find a mug. No filler products or unrelated substitutes were selected, and no purchase was made. Personal fit remains unverified.

The prompt preserves the original red-ish T-shirt, coffee mug, and winter deal, then adds Harbor Everyday Tee, a soft-collar cotton pique polo, and a smooth leather belt with a simple metal buckle. The earlier replacement-only draft was corrected before the agent launched. Exactly one agent run used this six-item task; there was no adapter arm or retry.

| Metric | Bare-page run |
| --- | ---: |
| Elapsed time, seconds | 135.518 |
| Estimated task-work tokens | 61,865 |
| Shopping request tokens | 104 |
| Observed tool-text tokens | 54,936 |
| Generated output tokens, including reasoning | 6,825 |
| Reasoning tokens, already included in output | 2,928 |
| Agent tool calls | 38 |
| Browser interactions | 60 |
| Recorded nonzero browser-command exits | 5 |
| Document navigations after setup | 28 |
| Browser-command time, seconds | 26.611 |
| Fetch and XHR request events | 5 |
| Native Store API request events during the agent turn | 0 |
| All request events | 2,166 |
| Image observations, token costs unavailable | 2 |

Task-work tokens follow [the repository accounting protocol](../benchmarks/README.md): the exact shopping request once, each observed tool response once, and generated output including reasoning. Text is estimated with the pinned `o200k_base` tokenizer. Image input costs are unavailable, so this is not a complete multimodal total or a billing total. Provider usage including environment, replay, and caching was 2,782,555 tokens: 2,775,730 input, of which 2,684,928 were cached, plus 6,825 output. Reasoning is already included in output.

One executed Playwright command counts as one interaction even when it batches multiple browser actions. Help/version commands are excluded from that count. Request events and command durations are separate measurements. Setup, coordinator work, independent verification, and ordering restoration were outside the measured agent turn. This different prompt and single trial do not provide a controlled performance comparison with the earlier three-need runs.

Independent native-cart and rendered-row checks matched all five products and quantity one:

| Request | Selected product | Price |
| --- | --- | ---: |
| Red-ish T-shirt | Canyon V-Neck Tee, coral/red-ish image | $20.80 |
| Coffee mug | None found | — |
| Winter deal | Trail Pocket Hoodie, reduced from $72 | $57.60 |
| Named tee | Harbor Everyday Tee | $24.00 |
| Cotton pique polo with soft collar | Sunday Classic Polo | $42.00 |
| Smooth leather belt with simple metal buckle | Foundry Leather Belt | $39.00 |

Subtotal was **$183.40**; displayed shipping was **$5**, giving **$188.40**. The agent searched for mug, coffee, ceramic, cup, and tumbler and reported no matches. The shared fixture contains no mug or personal sizing data. Its final reply disclosed the missing mug but did not explicitly explain the personal-fit limitation; it did not claim a confirmed personal fit. The outcome fulfills the five available product selections, not the complete six-item request.

Source telemetry confirms **`gpt-6-luna`, medium reasoning**, with no inherited chat history. The agent received the [exact six-item prompt](../benchmarks/task-six-items.txt), the unchanged [browser-isolation instruction](../benchmarks/isolation.txt), and its assigned ordinary Playwright CLI handle and working directory. No adapter documentation or extra shopping strategy was supplied. The named tee and feature descriptions were requested task content; product IDs and the other matching product names were withheld.

The headed, isolated Chrome context used a 1280 by 900 viewport and `@playwright/cli` 0.1.22 behind a fixed-session command logger. Initial checks confirmed an empty basket, no injected adapter, and 30 visible filler products. The same 530-product buried-order fixture used seed 20261006, with 300 fillers before originals globally and 60 before originals in each category. All 530 ordering values and the prior default-sort setting were restored with zero mismatches. Native order counts remained zero. The stores and earlier handoff contexts were preserved.

Local evidence is under `output/playwright/woo-luna-medium-six-items-20261006/`: exact prompt/configuration, source-log pointer, task-token components, executed-command and request logs, initial/final basket evidence, a full cart screenshot, and verified ordering restoration. The main result is `coordinator/report-data.json`. Session `woo-lm26-six1` remains on its native cart with a one-hour idle timeout. [WooCommerce is available within the tailnet](https://krzysztofs-mac-studio.tail657ea.ts.net:18091/); a different browser session has its own basket.

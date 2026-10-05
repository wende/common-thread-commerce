# Luna xhigh rerun with commerce API tools — October 5, 2026

Archive note: linked measurement snapshots are committed below `results/`. Original screenshots, browser state, raw protocol events and other artifacts marked local-only are retained outside version control.

All six Luna workers completed a verified three-product basket and handed over the browser. The original strict grader records five PASS and one FAIL: WooCommerce agent 2 used PARTIAL to describe the missing mug and unverified color, despite placing three alternatives. Its basket and reported selections matched in independent post-run verification. The raw benchmark report has been preserved.

Two concurrent workers ran on each of WooCommerce, PrestaShop and Magento, with fresh isolated guest contexts. The model was gpt-6-luna with xhigh reasoning, no model substitution or rerouting, and a 600-second timeout. The vague shopping prompt and isolation pre-prompt were unchanged. Tool instructions and the tool surface changed to expose programmatic commerce operations.

Platform source, configuration, plugins and catalog data were unchanged. All code changes are in the experiment harness. No order was placed. The six original browser contexts remain live for human handoff; worker access to both tools was revoked.

## Comparison with the previous vague-prompt cohort

| Measurement | Browser-only baseline | Commerce-tool rerun | Change |
| --- | ---: | ---: | --- |
| Verified completed handoffs | 4 | 6 | Both cohorts requested six baskets |
| Strict SUCCESS-only grade | 4 | 5 | One new worker reported PARTIAL; see grading note |
| Whole-run wall time (seconds) | 603.218 | 286.127 | 52.57% less |
| Tokens excluding cached input | 744,937 | 287,965 | 61.34% less |
| Uncached input tokens | 684,110 | 234,596 | 65.71% less |
| Output tokens, including reasoning | 60,827 | 53,369 | 12.26% less |
| Reasoning output tokens (subset of output) | 39,238 | 35,382 | 9.83% less |
| Cached input tokens | 7,866,624 | 1,028,096 | 86.93% less |
| Total tokens including cached input | 8,611,561 | 1,316,061 | 84.72% less |
| Assigned tool calls, including phase annotations | 217 | 80 | 63.13% less |
| Manual page interaction calls | 190 | 7 | 96.32% less |
| Failed assigned-tool calls | 17 | 5 | New failures: three search limits and two ambiguous browser clicks |

The observed whole-run ratio is 2.11×. The baseline includes two timeouts and incomplete baskets, so this ratio is not a uniform per-task speedup. Across the four worker IDs that passed the baseline, mean turn duration fell from 333.416 to 228.731 seconds (31.40% less). This remains one observation per worker, rather than a statistical performance estimate.

“Tokens excluding cached input” means uncached input plus all output, including reasoning. Cached input is a subset of input, and reasoning is a subset of output; neither is added again. These are cumulative per-thread usage updates reported by Codex. No dollar cost is estimated.

## What the workers received

The same shopper request was sent to all six workers:

```text
I don't really know what this shop has. I'm after a red-ish T-shirt that would suit me, maybe a mug for my coffee, and some good deal on something that'll keep me warm in winter. Could you pick three things you'd recommend? I'm not sure about brands or sizes and I haven't really got a budget in mind. If they don't sell one of those things, choose a sensible alternative and explain it. Put one of each in the cart so I can look at your choices, then leave it for me. Don't buy anything.
```

The isolation instruction was retained verbatim:

```text
You control exactly one assigned browser context. Never inspect, switch to, interact with, navigate, close, or modify any tab, window, target, or browser context outside your assigned context. Never use global browser/tab controls. Only act through the page/session handles provided to you. If an action would require accessing anything outside your assigned context, stop and return `BLOCKED: outside assigned browser context`.
```

Each worker received an opaque assigned context handle, assigned_shop, the existing assigned_browser fallback, and the same detailed response schema. Shell, global browser controls, external connectors, web search and delegation were disabled in the worker harness.

assigned_shop offered inspect, search_many, products, basket_sync, verify, phase and handoff. inspect returned all 30 products from the assigned storefront API, a complete-coverage indicator, and a basket revision. Product records contained handles, SKU, names, URLs, prices and regular prices, discounts, availability/purchasability, categories, plain descriptions, image references and attributes. Color was explicitly unknown and size options were absent. Native IDs, form keys, nonces and cart IDs stayed inside the adapter.

No recommendations or product choices were prefilled. The adapter did not read the seed catalog. The controller independently used that catalog to verify actual native cart names, stock, prices and quantities. API HTML descriptions and PrestaShop HTML fragments were normalized or discarded inside the helper, rather than returned as raw page HTML.

search_many used local substring matching over the structured API catalog, requiring all query words. It did not call each platform’s native search. This matters for interpreting the results: “red” can match “tapered,” and sale status is a field rather than necessarily a word in the description. Workers identified several such false matches.

basket_sync accepted all three selected products together, synchronized their desired quantities, preserved unrelated lines, checked the prior revision, and used an operation ID to avoid repeating writes. WooCommerce made one native batch write, PrestaShop made three serialized AJAX writes, and Magento seeded the browser basket then made a GraphQL batch write against that basket’s masked ID.

The original prompts, exact tool arguments/results and final worker reports are retained in the run artifacts. The event log contains the structured objects supplied to workers; this note does not reproduce internal reasoning traces.

## Per-worker measurements

| Worker | Raw grade / agent report | Verified handoff | Turn seconds | Handoff seconds | Report generation after handoff (s) | Tokens excluding cache | Cached input | Total including cache |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| magento-session-1-agent-1 | PASS / SUCCESS | Yes | 223.403 | 130.650 | 92.753 | 42,375 | 150,272 | 192,647 |
| magento-session-1-agent-2 | PASS / SUCCESS | Yes | 180.544 | 94.407 | 86.137 | 38,980 | 128,000 | 166,980 |
| prestashop-session-1-agent-1 | PASS / SUCCESS | Yes | 230.503 | 144.571 | 85.932 | 75,276 | 341,504 | 416,780 |
| prestashop-session-1-agent-2 | PASS / SUCCESS | Yes | 282.424 | 209.803 | 72.621 | 59,417 | 147,712 | 207,129 |
| woocommerce-session-1-agent-1 | PASS / SUCCESS | Yes | 178.592 | 94.865 | 83.727 | 36,786 | 161,024 | 197,810 |
| woocommerce-session-1-agent-2 | FAIL / PARTIAL | Yes | 151.365 | 75.202 | 76.163 | 35,131 | 99,584 | 134,715 |

| Worker | Uncached input | Output incl. reasoning | Reasoning subset | Assigned tool calls | Tool seconds | API requests | HTTP writes | Native mutation operations | Manual page calls | Failed tools |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| magento-session-1-agent-1 | 32,047 | 10,328 | 7,250 | 14 | 2.803 | 13 | 2 | 3 | 0 | 1 |
| magento-session-1-agent-2 | 29,874 | 9,106 | 6,183 | 13 | 3.283 | 13 | 2 | 3 | 0 | 1 |
| prestashop-session-1-agent-1 | 64,953 | 10,323 | 7,071 | 19 | 2.559 | 9 | 3 | 3 | 7 | 2 |
| prestashop-session-1-agent-2 | 52,221 | 7,196 | 4,224 | 12 | 1.790 | 9 | 3 | 3 | 0 | 1 |
| woocommerce-session-1-agent-1 | 27,969 | 8,817 | 5,763 | 11 | 3.305 | 7 | 1 | 3 | 0 | 0 |
| woocommerce-session-1-agent-2 | 27,532 | 7,599 | 4,891 | 11 | 3.662 | 7 | 1 | 3 | 0 | 0 |

| Worker | Total including context/thread setup (s) | Context/thread setup (s) | Summed explicit API seconds | Internal evaluations | Internal navigations |
| --- | ---: | ---: | ---: | ---: | ---: |
| magento-session-1-agent-1 | 226.408 | 3.005 | 1.439 | 2 | 1 |
| magento-session-1-agent-2 | 184.350 | 3.806 | 1.654 | 2 | 1 |
| prestashop-session-1-agent-1 | 232.962 | 2.459 | 0.996 | 2 | 1 |
| prestashop-session-1-agent-2 | 284.883 | 2.459 | 1.037 | 2 | 1 |
| woocommerce-session-1-agent-1 | 182.403 | 3.811 | 0.476 | 1 | 1 |
| woocommerce-session-1-agent-2 | 153.825 | 2.460 | 0.538 | 1 | 1 |

The six model turns made 80 assigned-tool calls: 73 commerce calls and 7 browser fallback calls. Of the commerce calls, 24 were phase annotations, 6 inspections, 18 batched searches, 7 product-detail requests, 6 basket synchronizations, 6 verifications and 6 handoffs. All browser fallback calls came from PrestaShop agent 1: one snapshot and six click attempts, including two ambiguous-link failures. Five workers needed no manual page interaction.

There were 58 explicit API requests, including 12 HTTP write requests and 18 native product mutation suboperations. All recorded HTTP responses were 200 or the expected WooCommerce batch 207. HTTP POST GraphQL queries count as reads. Automatic storefront requests and asset traffic are excluded.

One assigned-tool call can issue several HTTP requests. A native batch can contain several mutation suboperations. These are separate units. Manual page calls use the previous snapshot/click/fill/press definition; they do not include phase annotations or handoff helpers. Native helpers still did internal browser work: 10 page evaluations and 6 navigations across the six workers, in addition to DOM verification, waits and screenshots. Zero manual calls does not mean zero browser work.

The independent post-run restoration check made 8 additional read requests. These are excluded from the measured agent turns and their 58-request total. All six restored contexts passed API and UI checks; the paired cookie jars were distinct on every shop. The original six contexts remained live throughout.

## What was selected

| Worker | Products, one of each | Merchandise subtotal (USD) | Latest observed total after restoration (USD) |
| --- | --- | ---: | ---: |
| magento-session-1-agent-1 | Harbor Everyday Tee; Coast Cotton Cap; Trail Pocket Hoodie | $110.60 | $115.60 |
| magento-session-1-agent-2 | Harbor Everyday Tee; Trail Pocket Hoodie; Ridge Ribbed Beanie | $99.20 | $104.20 |
| prestashop-session-1-agent-1 | Tide V-Neck Tee; Compass Everyday Cap; Trail Pocket Hoodie | $110.60 | $117.60 |
| prestashop-session-1-agent-2 | Harbor Everyday Tee; Trail Pocket Hoodie; Ridge Ribbed Beanie | $99.20 | $106.20 |
| woocommerce-session-1-agent-1 | Harbor Everyday Tee; Coast Cotton Cap; Ridge Ribbed Beanie | $70.60 | $75.60 |
| woocommerce-session-1-agent-2 | Harbor Everyday Tee; Coast Cotton Cap; Ridge Ribbed Beanie | $70.60 | $75.60 |

The worker pairs made different choices on PrestaShop and Magento. The WooCommerce pair made the same selection. Every reported selection matched the restored native basket’s name, quantity and unit price, including the PARTIAL report. Shipping totals are observed estimates and can depend on frontend recalculation, address and method.

## Time spent and difficulties

Mean handoff time was 124.916 seconds. Detailed reporting after handoff averaged 82.889 seconds. Assigned-tool execution totaled 17.402 seconds across all workers; most measured time was outside those tools. That includes model generation, transport, scheduling and orchestration, and does not isolate pure reasoning time.

Reporting was the largest measured phase for four workers; comparison was largest for Magento agent 1 and PrestaShop agent 1. Detailed reports therefore account for a substantial part of completion time even after browser work has been reduced.

### magento-session-1-agent-1

| Phase | Wall seconds | Assigned-tool seconds | Calls | Failures |
| --- | ---: | ---: | ---: | ---: |
| orientation | 9.637 | 0.356 | 2 | 0 |
| discovery | 16.710 | 0.000 | 2 | 0 |
| comparison | 95.517 | 0.001 | 6 | 1 |
| cart | 4.549 | 0.681 | 2 | 0 |
| verification | 4.236 | 1.765 | 2 | 0 |
| reporting | 92.753 | 0.000 | 0 | 0 |

Worker-reported difficulties:

- **The full catalog contained no mug or other drinkware.** Impact: The requested coffee mug could not be supplied. Resolution: Searched mug, coffee mug, cup, tumbler, drinkware, coffee, and ceramic cup; all returned no products. Added the Coast Cotton Cap as a clearly disclosed everyday-accessory alternative.
- **Tee color could not be established from the product data.** Impact: I could not honestly promise a red-ish shirt. Resolution: Checked red tee, red t-shirt, red, burgundy, maroon, rust, crimson, and scarlet queries and inspected tee details. Harbor Everyday Tee has color null; the “red” search also surfaced products whose descriptions contain words such as “collared,” “structured,” and “tapered,” so those results do not establish a red color.
- **One search_many call exceeded the tool limit of 10 queries.** Impact: That search attempt failed and counted as the single failed tool call in the handoff receipt; it made no cart changes. Resolution: Repeated the searches in batches of 10 and 3, which completed.
- **The handoff’s latest API total differed from the merchandise subtotal.** Impact: The cart line prices sum to $110.60, while the latest observed API total was $115.60. Resolution: Reported both figures transparently. The handoff notes that shipping/tax can change after frontend recalculation, but the $5 difference was not itemized.

Full detailed agent report (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T14-54-34.884Z-9624220f/magento-session-1-agent-1.agent-report.md`)

### magento-session-1-agent-2

| Phase | Wall seconds | Assigned-tool seconds | Calls | Failures |
| --- | ---: | ---: | ---: | ---: |
| orientation | 10.725 | 0.246 | 2 | 0 |
| discovery | 22.474 | 0.001 | 2 | 0 |
| comparison | 52.217 | 0.001 | 5 | 1 |
| cart | 4.430 | 0.967 | 2 | 0 |
| verification | 4.561 | 2.068 | 2 | 0 |
| reporting | 86.137 | 0.000 | 0 | 0 |

Worker-reported difficulties:

- **No red color was verifiable from the product data. Searches for “red t-shirt,” “crimson shirt,” “burgundy,” and “maroon” did not establish a red tee; a search for “red” returned some tee/shirt matches, but the product records still had unknown color.** Impact: I could not promise a red-ish shade. Resolution: Selected an in-stock everyday tee and clearly disclosed that its color is unverified.
- **No coffee mug or drinkware appeared in the complete 30-item catalog or searches for mug, coffee, cup, drinkware, bottle, and travel mug.** Impact: There was no product that could perform the requested coffee-mug function. Resolution: Selected a discounted beanie as a useful in-store fallback and explicitly noted that it does not replace a mug.
- **One search_many call exceeded the tool limit of 10 queries.** Impact: That batch was rejected and did not return search results. Resolution: Reran the searches as two valid batches of 10 and 6 queries. The handoff receipt records one failed tool call overall.

Full detailed agent report (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T14-54-34.884Z-9624220f/magento-session-1-agent-2.agent-report.md`)

### prestashop-session-1-agent-1

| Phase | Wall seconds | Assigned-tool seconds | Calls | Failures |
| --- | ---: | ---: | ---: | ---: |
| orientation | 10.495 | 0.189 | 2 | 0 |
| discovery | 25.100 | 0.000 | 3 | 0 |
| comparison | 98.436 | 0.807 | 10 | 2 |
| cart | 5.693 | 0.633 | 2 | 0 |
| verification | 4.846 | 0.930 | 2 | 0 |
| reporting | 85.933 | 0.000 | 0 | 0 |

Worker-reported difficulties:

- **No mug or drinkware was present.** Impact: A coffee mug could not be selected. Resolution: The full catalog covered 30 of 30 products and mug/cup searches returned none. I added an everyday cap as a disclosed in-store alternative, not as a mug equivalent.
- **The red-ish color preference could not be confirmed.** Impact: The selected tee may not be red-ish despite matching a red-keyword search. Resolution: I chose the tee returned by “red” and “tee red” searches, but disclosed that the API color field was null and the product page did not confirm a shade.
- **Two browser clicks hit duplicate matching product links.** Impact: Those clicks did not navigate on the first attempt. Resolution: I retried using index 0 for the duplicate links. The controller counted both as failed calls; no cart changes resulted.
- **Several broad or literal searches returned no matches, including “red T-shirt,” “winter warm fleece beanie hoodie discount sale,” and “discount.”** Impact: Those searches alone did not identify a suitable tee or sale item. Resolution: I tried simpler terms. “tee red” and “red” returned Tide V-Neck Tee; “hoodie” and “beanie” exposed candidates, including the discounted Trail Pocket Hoodie.

Full detailed agent report (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T14-54-34.884Z-9624220f/prestashop-session-1-agent-1.agent-report.md`)

### prestashop-session-1-agent-2

| Phase | Wall seconds | Assigned-tool seconds | Calls | Failures |
| --- | ---: | ---: | ---: | ---: |
| orientation | 27.034 | 0.266 | 2 | 0 |
| discovery | 65.596 | 0.001 | 4 | 1 |
| comparison | 58.353 | 0.000 | 2 | 0 |
| cart | 31.584 | 0.646 | 2 | 0 |
| verification | 27.236 | 0.877 | 2 | 0 |
| reporting | 72.621 | 0.000 | 0 | 0 |

Worker-reported difficulties:

- **The first search_many call supplied 12 queries, but the tool accepts at most 10 per call.** Impact: That discovery call failed and did not return search results. Resolution: Retried in batches of 10 or fewer queries. The controller receipt records one failed tool call.
- **The mug, coffee, and cup searches returned no products; the complete catalog contained no drinkware category or item.** Impact: A coffee mug could not be added, and no true functional substitute was available. Resolution: Selected the discounted beanie as a useful but clearly non-equivalent catalog fallback and disclosed that it is not drinkware.
- **The red query returned some tee or polo search results, but the product records had no confirmed color values; shade-specific searches returned nothing.** Impact: I could not confidently fulfill the requested red-ish color or determine which search matches actually had that color. Resolution: Selected a versatile tee based on its supported relaxed-fit and cotton-jersey description, without claiming a red color.

Full detailed agent report (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T14-54-34.884Z-9624220f/prestashop-session-1-agent-2.agent-report.md`)

### woocommerce-session-1-agent-1

| Phase | Wall seconds | Assigned-tool seconds | Calls | Failures |
| --- | ---: | ---: | ---: | ---: |
| orientation | 7.740 | 0.145 | 2 | 0 |
| discovery | 44.575 | 0.001 | 3 | 0 |
| comparison | 27.275 | 0.000 | 2 | 0 |
| cart | 7.772 | 0.190 | 2 | 0 |
| verification | 7.504 | 2.969 | 2 | 0 |
| reporting | 83.727 | 0.000 | 0 | 0 |

Worker-reported difficulties:

- **No mug or coffee-related drinkware appeared in the complete 30-product catalog or expanded drinkware searches.** Impact: A product serving the requested coffee use could not be selected. Resolution: Added Coast Cotton Cap as a general-purpose, adjustable accessory fallback and explicitly noted that it does not replace a mug.
- **The catalog did not provide a verified red color for a tee. The exact red T-shirt search was empty; broader red matches were not reliable color evidence.** Impact: I could not confidently select a red-ish shirt without inventing an attribute. Resolution: Selected the in-stock Harbor Everyday Tee based on its relaxed everyday-fit description and disclosed that its shade is unknown.
- **Selected products lacked size options or measurements, so personal fit could not be established.** Impact: Brand and fit preferences were not available to personalize the picks. Resolution: Used the general relaxed-fit tee description and the cap's stated adjustable back as limited guidance, without claiming a size or guaranteed fit.
- **Some search results were not reliable evidence for the intended category: “red tee” surfaced Tide V-Neck Tee, whose description includes “tapered”; “glass” surfaced sunglasses; and “warm” also surfaced Canyon V-Neck Tee for “warm days.” The “deal” search itself returned nothing.** Impact: Keyword results alone could have led to unsupported color or category assumptions. Resolution: Checked product attributes and details, relied on the explicit beanie discount data for the deal, and did not treat those ambiguous matches as evidence of a red shirt or mug. No tool call failed or required retry.

Full detailed agent report (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T14-54-34.884Z-9624220f/woocommerce-session-1-agent-1.agent-report.md`)

### woocommerce-session-1-agent-2

| Phase | Wall seconds | Assigned-tool seconds | Calls | Failures |
| --- | ---: | ---: | ---: | ---: |
| orientation | 10.007 | 0.236 | 2 | 0 |
| discovery | 43.091 | 0.001 | 3 | 0 |
| comparison | 12.381 | 0.000 | 2 | 0 |
| cart | 4.427 | 0.211 | 2 | 0 |
| verification | 5.296 | 3.214 | 2 | 0 |
| reporting | 76.163 | 0.000 | 0 | 0 |

Worker-reported difficulties:

- **The red searches did not establish a red tee. The combined “red tee” query returned Tide V-Neck Tee, whose data has no color attribute; the separate “red” results included polo products and the same tee, but no verified red tee.** Impact: I could not honestly promise the selected tee is red-ish. Resolution: Selected Harbor Everyday Tee as the closest general-purpose in-stock tee and reported its color limitation. Image references were not treated as proof of color.
- **No mug or drinkware was present in the complete catalog. Searches for “mug coffee cup” and the individual terms “mug,” “coffee,” and “cup” returned no products.** Impact: There was no coffee vessel or direct functional equivalent to put in the cart. Resolution: Added Coast Cotton Cap as a useful available accessory and clearly disclosed that it is not a mug substitute in function.
- **Combined queries “winter warm deal sale discount” and the standalone terms “discount” and “sale” returned no products, despite discounted warm items in the catalog.** Impact: Those searches alone were insufficient to identify sale options. Resolution: Searched separately for “hoodie” and “beanie,” then compared product details and discount data. Ridge Ribbed Beanie was explicitly described as warm and discounted 20%.

Full detailed agent report (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T14-54-34.884Z-9624220f/woocommerce-session-1-agent-2.agent-report.md`)

## Interpretation and limits

The native adapters completed all basket writes and verification without manual add-to-cart operations. The browser fallback was used only by one worker while investigating incomplete product attributes. The token reduction is concentrated in input and cached history; output fell much less because the same detailed reporting task remained.

The experiment does not establish a confirmed red tee or personal fit. No mug appears in the complete 30-product catalog. Workers disclosed these gaps and substituted apparel/accessories. Such alternatives meet the test’s instruction to choose three available recommendations, but a cap or extra warm layer does not function as a coffee vessel. Basket correctness is independently verified; recommendation quality remains a separate assessment.

Three workers exceeded the ten-query search limit and recovered by splitting their requests. The ten-query cap adds friction for this cheap local search and should be reconsidered. Matching query terms as substrings also causes false positives; token-aware matching and explicit attribute/sale filters would be better. These are findings from this run, not changes applied during measurement.

The raw strict report is FAIL because it requires a SUCCESS report status. WooCommerce agent 2 returned PARTIAL for unresolved user preferences despite a verified alternative basket. Its reportMatchesCart field is false because that predicate combines status and item matching. The separate restoration check establishes that its actual names, quantities and prices matched. Both facts are retained; the worker’s statement is not rewritten and the original grade is not silently changed.

These are one-cohort observations, with only two workers per shop. The changed tool surface, more complete discovery and model variability all affect the comparison. There is no statistical claim or separately measured pure model-decision time. The adapters currently support simple products and positive quantities; variants, login/cart merging and checkout are not exercised.

## Reproduction and artifacts

```sh
cd experiments/agent-browser
npm test
node commerce-smoke.mjs
node run.mjs --agents 2 --sessions 1 --task vague-commerce-task.json --commerce-tools --timeout 600 --keep-open
```

The 13 unit checks passed, then six deterministic adapter sessions passed before launching Luna. The original benchmark source used for the model run is archived in its harness-source directory.

- [Raw new report JSON](results/2026-10-05T14-54-34.884Z-9624220f/report.json)
- Machine-readable comparison (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T14-54-34.884Z-9624220f/comparison.json`)
- Independent restored-session verification (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T14-54-34.884Z-9624220f/restoration-verification.json`)
- Exact tool inputs and outputs (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T14-54-34.884Z-9624220f/events.jsonl`)
- Model capabilities (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T14-54-34.884Z-9624220f/model.json`)
- Archived runner source (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T14-54-34.884Z-9624220f/harness-source/run.mjs`)
- Archived commerce adapter (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T14-54-34.884Z-9624220f/harness-source/commerce-adapter.mjs`)
- Archived commerce broker (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T14-54-34.884Z-9624220f/harness-source/commerce-broker.mjs`)
- [Baseline measurement snapshot](results/2026-10-05T13-21-59.909Z-4ffa6cab/report.json)
- [Prior full session report](SESSION_REPORT_2026-10-05.md)
- [API research and design](PAGE_API_RESEARCH_2026-10-05.md)

## Assigned-tool call ledger

| # | Worker | Tool | Action | Duration (s) | Outcome | Input / error |
| ---: | --- | --- | --- | ---: | --- | --- |
| 1 | woocommerce-session-1-agent-2 | assigned_shop | inspect | 0.236 | OK |  |
| 2 | prestashop-session-1-agent-2 | assigned_shop | inspect | 0.266 | OK |  |
| 3 | magento-session-1-agent-1 | assigned_shop | inspect | 0.356 | OK |  |
| 4 | prestashop-session-1-agent-1 | assigned_shop | inspect | 0.189 | OK |  |
| 5 | woocommerce-session-1-agent-1 | assigned_shop | inspect | 0.145 | OK |  |
| 6 | magento-session-1-agent-2 | assigned_shop | inspect | 0.246 | OK |  |
| 7 | woocommerce-session-1-agent-1 | assigned_shop | phase | 0.001 | OK | discovery |
| 8 | woocommerce-session-1-agent-2 | assigned_shop | phase | 0.000 | OK | discovery |
| 9 | woocommerce-session-1-agent-2 | assigned_shop | search_many | 0.001 | OK | ["red tee", "red t-shirt", "mug coffee cup", "winter warm deal sale discount", "fleece hoodie", "beanie"] |
| 10 | magento-session-1-agent-1 | assigned_shop | phase | 0.000 | OK | discovery |
| 11 | magento-session-1-agent-1 | assigned_shop | search_many | 0.000 | OK | ["red tee", "red t-shirt", "tee", "mug", "coffee mug", "winter warm", "fleece hoodie", "discount sale"] |
| 12 | prestashop-session-1-agent-1 | assigned_shop | phase | 0.000 | OK | discovery |
| 13 | prestashop-session-1-agent-1 | assigned_shop | search_many | 0.000 | OK | ["red T-shirt", "tee red", "mug coffee cup", "winter warm fleece beanie hoodie discount sale"] |
| 14 | woocommerce-session-1-agent-1 | assigned_shop | search_many | 0.000 | OK | ["red T-shirt", "red tee", "tee", "mug", "coffee mug", "winter", "warm", "deal"] |
| 15 | magento-session-1-agent-2 | assigned_shop | phase | 0.000 | OK | discovery |
| 16 | magento-session-1-agent-2 | assigned_shop | search_many | 0.001 | OK | ["red t-shirt", "red tee", "crimson shirt", "mug coffee", "coffee mug", "winter warm deal", "fleece hoodie", "warm beanie"] |
| 17 | prestashop-session-1-agent-1 | assigned_shop | search_many | 0.000 | OK | ["tee", "mug", "cup", "hoodie", "beanie", "discount"] |
| 18 | woocommerce-session-1-agent-2 | assigned_shop | search_many | 0.000 | OK | ["red", "tee", "mug", "coffee", "cup", "winter", "discount", "sale", "hoodie", "beanie"] |
| 19 | magento-session-1-agent-1 | assigned_shop | phase | 0.000 | OK | comparison |
| 20 | magento-session-1-agent-1 | assigned_shop | products | 0.000 | OK | 9 product handles |
| 21 | prestashop-session-1-agent-2 | assigned_shop | phase | 0.000 | OK | discovery |
| 22 | prestashop-session-1-agent-2 | assigned_shop | search_many | 0.000 | Error | queries must be up to 10 strings |
| 23 | woocommerce-session-1-agent-1 | assigned_shop | search_many | 0.000 | OK | ["cup", "drinkware", "coffee", "ceramic", "glass", "housewares", "kitchen", "red", "burgundy", "crimson"] |
| 24 | magento-session-1-agent-2 | assigned_shop | phase | 0.000 | OK | comparison |
| 25 | magento-session-1-agent-2 | assigned_shop | search_many | 0.000 | Error | queries must be up to 10 strings |
| 26 | prestashop-session-1-agent-1 | assigned_shop | phase | 0.000 | OK | comparison |
| 27 | prestashop-session-1-agent-1 | assigned_shop | products | 0.000 | OK | 7 product handles |
| 28 | magento-session-1-agent-2 | assigned_shop | search_many | 0.000 | OK | ["red", "burgundy", "maroon", "shirt", "tee", "coffee", "cup", "mug", "drinkware", "bottle"] |
| 29 | magento-session-1-agent-2 | assigned_shop | search_many | 0.000 | OK | ["travel mug", "sale warm", "warm", "winter", "beanie", "hoodie"] |
| 30 | prestashop-session-1-agent-1 | assigned_browser | snapshot | 0.040 | OK |  |
| 31 | prestashop-session-1-agent-1 | assigned_browser | click | 0.025 | Error | locator.click: Error: strict mode violation: getByRole('link', { name: 'Harbor Everyday Tee', exact: true }) resolved to 2 elements:     1) <a class="thumbnail product-thumbnail" href="http://localhost:8092/20-harbor-everyday-tee.html">…</a> aka getByRole('link', { name: 'Harbor Everyday Tee' }).first()     2) <a href="http://localhost:8092/20-harbor-everyday-tee.html" content="http://localhost:8092/20-harbor-everyday-tee.html">Harbor Everyday Tee</a> aka getByText('Harbor Everyday Tee')  Call log: [2m  - waiting for getByRole('link', { name: 'Harbor Everyday Tee', exact: true })[22m  |
| 32 | woocommerce-session-1-agent-2 | assigned_shop | phase | 0.000 | OK | comparison |
| 33 | woocommerce-session-1-agent-2 | assigned_shop | products | 0.000 | OK | 5 product handles |
| 34 | woocommerce-session-1-agent-1 | assigned_shop | phase | 0.000 | OK | comparison |
| 35 | prestashop-session-1-agent-1 | assigned_browser | click | 0.249 | OK | Harbor Everyday Tee |
| 36 | prestashop-session-1-agent-2 | assigned_shop | search_many | 0.000 | OK | ["mug", "coffee", "cup", "red", "tee", "warm winter", "winter", "fleece", "hoodie", "beanie"] |
| 37 | woocommerce-session-1-agent-1 | assigned_shop | products | 0.000 | OK | 6 product handles |
| 38 | magento-session-1-agent-1 | assigned_shop | search_many | 0.000 | Error | queries must be up to 10 strings |
| 39 | prestashop-session-1-agent-1 | assigned_shop | search_many | 0.000 | OK | ["red", "color", "cotton tee", "t-shirt"] |
| 40 | prestashop-session-1-agent-2 | assigned_shop | search_many | 0.000 | OK | ["maroon", "crimson", "scarlet", "brick", "burgundy", "terracotta", "rust", "ceramic", "drinkware", "sale"] |
| 41 | woocommerce-session-1-agent-2 | assigned_shop | phase | 0.000 | OK | cart |
| 42 | woocommerce-session-1-agent-2 | assigned_shop | basket_sync | 0.211 | OK | 3 desired products |
| 43 | magento-session-1-agent-1 | assigned_shop | search_many | 0.000 | OK | ["red", "burgundy tee", "maroon tee", "rust tee", "crimson tee", "scarlet tee", "mug", "cup", "tumbler", "drinkware"] |
| 44 | magento-session-1-agent-1 | assigned_shop | search_many | 0.000 | OK | ["coffee", "ceramic cup", "accessories"] |
| 45 | woocommerce-session-1-agent-2 | assigned_shop | phase | 0.000 | OK | verification |
| 46 | woocommerce-session-1-agent-2 | assigned_shop | verify | 0.058 | OK |  |
| 47 | magento-session-1-agent-2 | assigned_shop | products | 0.000 | OK | 3 product handles |
| 48 | woocommerce-session-1-agent-2 | assigned_shop | handoff | 3.156 | OK |  |
| 49 | woocommerce-session-1-agent-1 | assigned_shop | phase | 0.000 | OK | cart |
| 50 | woocommerce-session-1-agent-1 | assigned_shop | basket_sync | 0.190 | OK | 3 desired products |
| 51 | magento-session-1-agent-2 | assigned_shop | phase | 0.000 | OK | cart |
| 52 | magento-session-1-agent-2 | assigned_shop | basket_sync | 0.967 | OK | 3 desired products |
| 53 | woocommerce-session-1-agent-1 | assigned_shop | phase | 0.000 | OK | verification |
| 54 | woocommerce-session-1-agent-1 | assigned_shop | verify | 0.087 | OK |  |
| 55 | magento-session-1-agent-2 | assigned_shop | phase | 0.000 | OK | verification |
| 56 | magento-session-1-agent-2 | assigned_shop | verify | 0.229 | OK |  |
| 57 | prestashop-session-1-agent-2 | assigned_shop | phase | 0.000 | OK | comparison |
| 58 | magento-session-1-agent-2 | assigned_shop | handoff | 1.839 | OK |  |
| 59 | woocommerce-session-1-agent-1 | assigned_shop | handoff | 2.882 | OK |  |
| 60 | prestashop-session-1-agent-1 | assigned_browser | click | 0.222 | OK | Common Thread |
| 61 | prestashop-session-1-agent-1 | assigned_browser | click | 0.034 | Error | locator.click: Error: strict mode violation: getByRole('link', { name: 'Tide V-Neck Tee', exact: true }) resolved to 2 elements:     1) <a class="thumbnail product-thumbnail" href="http://localhost:8092/24-tide-v-neck-tee.html">…</a> aka getByRole('link', { name: 'Tide V-Neck Tee' }).first()     2) <a href="http://localhost:8092/24-tide-v-neck-tee.html" content="http://localhost:8092/24-tide-v-neck-tee.html">Tide V-Neck Tee</a> aka getByText('Tide V-Neck Tee')  Call log: 2m  - waiting for getByRole('link', { name: 'Tide V-Neck Tee', exact: true })[22m  |
| 62 | magento-session-1-agent-1 | assigned_shop | products | 0.000 | OK | 2 product handles |
| 63 | prestashop-session-1-agent-1 | assigned_browser | click | 0.192 | OK | Tide V-Neck Tee |
| 64 | prestashop-session-1-agent-1 | assigned_browser | click | 0.044 | OK | Product Details |
| 65 | prestashop-session-1-agent-2 | assigned_shop | products | 0.000 | OK | 3 product handles |
| 66 | magento-session-1-agent-1 | assigned_shop | phase | 0.000 | OK | cart |
| 67 | magento-session-1-agent-1 | assigned_shop | basket_sync | 0.681 | OK | 3 desired products |
| 68 | magento-session-1-agent-1 | assigned_shop | phase | 0.000 | OK | verification |
| 69 | magento-session-1-agent-1 | assigned_shop | verify | 0.204 | OK |  |
| 70 | magento-session-1-agent-1 | assigned_shop | handoff | 1.561 | OK |  |
| 71 | prestashop-session-1-agent-1 | assigned_shop | phase | 0.000 | OK | cart |
| 72 | prestashop-session-1-agent-1 | assigned_shop | basket_sync | 0.633 | OK | 3 desired products |
| 73 | prestashop-session-1-agent-1 | assigned_shop | phase | 0.000 | OK | verification |
| 74 | prestashop-session-1-agent-1 | assigned_shop | verify | 0.100 | OK |  |
| 75 | prestashop-session-1-agent-1 | assigned_shop | handoff | 0.831 | OK |  |
| 76 | prestashop-session-1-agent-2 | assigned_shop | phase | 0.000 | OK | cart |
| 77 | prestashop-session-1-agent-2 | assigned_shop | basket_sync | 0.646 | OK | 3 desired products |
| 78 | prestashop-session-1-agent-2 | assigned_shop | phase | 0.000 | OK | verification |
| 79 | prestashop-session-1-agent-2 | assigned_shop | verify | 0.084 | OK |  |
| 80 | prestashop-session-1-agent-2 | assigned_shop | handoff | 0.793 | OK |  |

## Explicit API request ledger

| # | Worker | Method | Endpoint path | Operation | HTTP status | Response bytes | Seconds | Native mutation suboperations |
| ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| 1 | magento-session-1-agent-1 | POST | /graphql | read | 200 | 19,757 | 0.283 | 0 |
| 2 | woocommerce-session-1-agent-2 | GET | /wp-json/wc/store/v1/products | read | 200 | 83,285 | 0.181 | 0 |
| 3 | prestashop-session-1-agent-2 | GET | /2-home | read | 200 | 167,318 | 0.215 | 0 |
| 4 | woocommerce-session-1-agent-2 | GET | /wp-json/wc/store/v1/cart | read | 200 | 1,008 | 0.040 | 0 |
| 5 | prestashop-session-1-agent-2 | GET | /cart | read | 200 | 882 | 0.033 | 0 |
| 6 | magento-session-1-agent-1 | GET | /customer/section/load/ | read | 200 | 383 | 0.062 | 0 |
| 7 | prestashop-session-1-agent-1 | GET | /2-home | read | 200 | 167,314 | 0.144 | 0 |
| 8 | prestashop-session-1-agent-1 | GET | /cart | read | 200 | 882 | 0.034 | 0 |
| 9 | woocommerce-session-1-agent-1 | GET | /wp-json/wc/store/v1/products | read | 200 | 83,285 | 0.099 | 0 |
| 10 | woocommerce-session-1-agent-1 | GET | /wp-json/wc/store/v1/cart | read | 200 | 1,008 | 0.037 | 0 |
| 11 | magento-session-1-agent-2 | POST | /graphql | read | 200 | 19,757 | 0.178 | 0 |
| 12 | magento-session-1-agent-2 | GET | /customer/section/load/ | read | 200 | 383 | 0.059 | 0 |
| 13 | woocommerce-session-1-agent-2 | GET | /wp-json/wc/store/v1/cart | read | 200 | 1,008 | 0.085 | 0 |
| 14 | woocommerce-session-1-agent-2 | POST | /wp-json/wc/store/v1/batch | write | 207 | 23,154 | 0.065 | 3 |
| 15 | woocommerce-session-1-agent-2 | GET | /wp-json/wc/store/v1/cart | read | 200 | 10,161 | 0.053 | 0 |
| 16 | woocommerce-session-1-agent-2 | GET | /wp-json/wc/store/v1/cart | read | 200 | 10,161 | 0.058 | 0 |
| 17 | woocommerce-session-1-agent-2 | GET | /wp-json/wc/store/v1/cart | read | 200 | 10,161 | 0.056 | 0 |
| 18 | woocommerce-session-1-agent-1 | GET | /wp-json/wc/store/v1/cart | read | 200 | 1,008 | 0.080 | 0 |
| 19 | woocommerce-session-1-agent-1 | POST | /wp-json/wc/store/v1/batch | write | 207 | 23,154 | 0.068 | 3 |
| 20 | woocommerce-session-1-agent-1 | GET | /wp-json/wc/store/v1/cart | read | 200 | 10,161 | 0.041 | 0 |
| 21 | magento-session-1-agent-2 | GET | /customer/section/load/ | read | 200 | 383 | 0.194 | 0 |
| 22 | magento-session-1-agent-2 | POST | /checkout/cart/add/uenc/aHR0cDovL2xvY2FsaG9zdDo4MDkzLw~~/product/1/ | write | 200 | 2 | 0.134 | 1 |
| 23 | magento-session-1-agent-2 | GET | /customer/section/load/ | read | 200 | 1,334 | 0.120 | 0 |
| 24 | magento-session-1-agent-2 | POST | /graphql | read | 200 | 349 | 0.145 | 0 |
| 25 | magento-session-1-agent-2 | POST | /graphql | write | 200 | 662 | 0.155 | 2 |
| 26 | magento-session-1-agent-2 | GET | /customer/section/load/ | read | 200 | 3,030 | 0.101 | 0 |
| 27 | magento-session-1-agent-2 | POST | /graphql | read | 200 | 623 | 0.112 | 0 |
| 28 | woocommerce-session-1-agent-1 | GET | /wp-json/wc/store/v1/cart | read | 200 | 10,161 | 0.086 | 0 |
| 29 | magento-session-1-agent-2 | GET | /customer/section/load/ | read | 200 | 3,030 | 0.109 | 0 |
| 30 | magento-session-1-agent-2 | POST | /graphql | read | 200 | 623 | 0.120 | 0 |
| 31 | magento-session-1-agent-2 | GET | /customer/section/load/ | read | 200 | 3,030 | 0.109 | 0 |
| 32 | magento-session-1-agent-2 | POST | /graphql | read | 200 | 624 | 0.118 | 0 |
| 33 | woocommerce-session-1-agent-1 | GET | /wp-json/wc/store/v1/cart | read | 200 | 10,161 | 0.065 | 0 |
| 34 | magento-session-1-agent-1 | GET | /customer/section/load/ | read | 200 | 383 | 0.107 | 0 |
| 35 | magento-session-1-agent-1 | POST | /checkout/cart/add/uenc/aHR0cDovL2xvY2FsaG9zdDo4MDkzLw~~/product/1/ | write | 200 | 2 | 0.093 | 1 |
| 36 | magento-session-1-agent-1 | GET | /customer/section/load/ | read | 200 | 1,334 | 0.087 | 0 |
| 37 | magento-session-1-agent-1 | POST | /graphql | read | 200 | 349 | 0.098 | 0 |
| 38 | magento-session-1-agent-1 | POST | /graphql | write | 200 | 659 | 0.114 | 2 |
| 39 | magento-session-1-agent-1 | GET | /customer/section/load/ | read | 200 | 3,022 | 0.081 | 0 |
| 40 | magento-session-1-agent-1 | POST | /graphql | read | 200 | 620 | 0.098 | 0 |
| 41 | magento-session-1-agent-1 | GET | /customer/section/load/ | read | 200 | 3,022 | 0.104 | 0 |
| 42 | magento-session-1-agent-1 | POST | /graphql | read | 200 | 620 | 0.100 | 0 |
| 43 | magento-session-1-agent-1 | GET | /customer/section/load/ | read | 200 | 3,022 | 0.108 | 0 |
| 44 | magento-session-1-agent-1 | POST | /graphql | read | 200 | 620 | 0.103 | 0 |
| 45 | prestashop-session-1-agent-1 | GET | /cart | read | 200 | 882 | 0.065 | 0 |
| 46 | prestashop-session-1-agent-1 | POST | /cart | write | 200 | 7,258 | 0.164 | 1 |
| 47 | prestashop-session-1-agent-1 | POST | /cart | write | 200 | 13,829 | 0.174 | 1 |
| 48 | prestashop-session-1-agent-1 | POST | /cart | write | 200 | 21,345 | 0.171 | 1 |
| 49 | prestashop-session-1-agent-1 | GET | /cart | read | 200 | 21,349 | 0.056 | 0 |
| 50 | prestashop-session-1-agent-1 | GET | /cart | read | 200 | 21,349 | 0.099 | 0 |
| 51 | prestashop-session-1-agent-1 | GET | /cart | read | 200 | 21,349 | 0.087 | 0 |
| 52 | prestashop-session-1-agent-2 | GET | /cart | read | 200 | 882 | 0.055 | 0 |
| 53 | prestashop-session-1-agent-2 | POST | /cart | write | 200 | 7,416 | 0.185 | 1 |
| 54 | prestashop-session-1-agent-2 | POST | /cart | write | 200 | 14,929 | 0.168 | 1 |
| 55 | prestashop-session-1-agent-2 | POST | /cart | write | 200 | 22,332 | 0.178 | 1 |
| 56 | prestashop-session-1-agent-2 | GET | /cart | read | 200 | 22,336 | 0.060 | 0 |
| 57 | prestashop-session-1-agent-2 | GET | /cart | read | 200 | 22,336 | 0.084 | 0 |
| 58 | prestashop-session-1-agent-2 | GET | /cart | read | 200 | 22,336 | 0.060 | 0 |

## Handoff screenshots

**woocommerce-session-1-agent-2**

![woocommerce-session-1-agent-2: verified three-product cart (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T14-54-34.884Z-9624220f/woocommerce-session-1-agent-2.png`)

**prestashop-session-1-agent-1**

prestashop-session-1-agent-1: verified three-product cart (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T14-54-34.884Z-9624220f/prestashop-session-1-agent-1.png`)

**magento-session-1-agent-1**

magento-session-1-agent-1: verified three-product cart (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T14-54-34.884Z-9624220f/magento-session-1-agent-1.png`)

Other screenshots: magento-session-1-agent-2 (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T14-54-34.884Z-9624220f/magento-session-1-agent-2.png`), prestashop-session-1-agent-2 (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T14-54-34.884Z-9624220f/prestashop-session-1-agent-2.png`), woocommerce-session-1-agent-1 (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T14-54-34.884Z-9624220f/woocommerce-session-1-agent-1.png`).

# WooCommerce Luna medium — realistic catalog, A/B/C campaign

This campaign replaces the former 500 named fillers with 500 plausible merchandise listings. All 530 products have ordinary names, descriptions, appropriate illustrative images, prices and stock. The shared catalog was generated independently of the shopping lists, then inspected for photo/description consistency. There are 18 reused sample illustrations across the merchandise styles; these are invented demo listings, rather than 500 distinct real retailer products. The 530 native product IDs are preserved while their old filler SKUs are migrated. No marker-based grouping, catalog exclusions, stock/price/category filters or local keyword-pruning rules remain in the adapter. Native keyword search and ordinary pagination remain available, returning every native result. All original products remain in the same catalog as the new merchandise.

The fixed prompts are [A: six needs](../benchmarks/shopping/task-a-six-items.txt), [B: twelve needs](../benchmarks/shopping/task-b-twelve-items.txt), and [C: sixteen needs](../benchmarks/shopping/task-c-sixteen-items.txt). B and C preserve A's original six needs and add requests for different products and features. The clothing/accessory catalog still has no mug or personal sizing data; expected available cart sizes are therefore 5, 11 and 15, with missing-item disclosure and no unsupported fit claim. Most feature requests have 19–40 eligible products. Grading accepts any valid distinct assignment, rather than a preset basket of SKUs.

Thirty sessions total: round 1 is a fresh bare-browser A/B/C reference trio; rounds 2–10 are fresh adapter trios with a shared immutable script revision within each round and general improvements between rounds. Every agent is gpt-6-luna at medium reasoning with no inherited history. Prompts supply only their shopping list, the no-filter constraint, the same browser isolation rule and their ordinary Playwright CLI handle. The coordinator does not provide product answers or implementation strategies to workers. Catalog data, native ordering and prompt hashes stay fixed during the 30 runs. There is no comparison to the earlier filler-catalog baseline.

The primary metric is provider input plus output tokens, **including cached input once**. Keep input/cache/output breakdown, elapsed time, actual browser interactions, model tool calls, native requests, image counts, exact prompt/script hashes and quality outcomes. Every run counts, including errors or incorrect selections. Provider totals include tools, inherited instructions, replayed context and images as reported; the previous task-work estimate remains only a secondary diagnostic.

Twenty old benchmark browsers were closed and an empty browser inventory verified before the new campaign. Each completed run is independently checked against the native cart, rendered rows, quantities, final cart URL and context marker. Final replies are read for unavailable-item disclosure and unsupported fit claims. Public actions are checked for prohibited pruning or host-side catalog shortcuts. Evidence is saved, then that run's browser closes; never accumulate past trios. No orders may be created. The same 530-product catalog and normal native ordering must remain at completion.

Audit artifacts and immutable snapshots are local under `output/playwright/woo-luna-real-catalog-20261006/`. The reusable coordinator is [campaign_real.py](../benchmarks/shopping/campaign_real.py); the offline feature evaluator is [grade_real.py](../benchmarks/shopping/grade_real.py). Those are coordinator-only measurement tools; the shipped storefront adapter remains [one page script](shop-agent.js).

Preparation: native catalog verification passed for WooCommerce, PrestaShop and Magento with 530 products each. Tailnet HTML/assets passed on all three. Adapter 0.5.0 removes the old exclusion and structured-filter paths. Contract checks cover rejection before networking and retention of all native records, including unavailable or partial lexical matches. The initial 500-reference lookup bound was raised to 2048, and cached responses restore lookup references; this fixes selecting earlier returned items after a full 530-record scan. Full live scanning returned every one of the 530 products, including all 24 unavailable records, with no filler labels. Read-only page-tool/search smoke checks passed on the other two stores.

<!-- RESULTS -->
## Results

Status: complete; 30/30 sessions collected. Every completed session is included below.

Only one bare reference session was run for each prompt. Later rounds use adaptive revisions, so ratios describe these observations; they are not confidence intervals or repeated trials of one fixed implementation. Cached tokens are included once in every primary total. The former named-filler result is excluded.

| Round | Version | A tokens | B tokens | C tokens | Mean seconds | Reference / trio tokens | Reference / trio time | Quality passes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | bare | 2,098,739 | 5,272,958 | 2,590,718 | 259.55 | 1.00× | 1.00× | 3/3 |
| 2 | 0.5.0 | 855,902 | 574,620 | 621,495 | 145.54 | 4.85× | 1.78× | 3/3 |
| 3 | 0.5.1 | 838,194 | 841,867 | 862,381 | 145.35 | 3.92× | 1.79× | 2/3 |
| 4 | 0.5.2 | 695,725 | 797,334 | 712,729 | 145.65 | 4.52× | 1.78× | 2/3 |
| 5 | 0.5.3 | 872,733 | 1,266,425 | 669,889 | 141.51 | 3.55× | 1.83× | 3/3 |
| 6 | 0.5.4 | 869,704 | 618,671 | 958,411 | 108.50 | 4.07× | 2.39× | 2/3 |
| 7 | 0.5.5 | 958,799 | 627,371 | 816,778 | 102.00 | 4.15× | 2.54× | 3/3 |
| 8 | 0.5.6 | 596,039 | 586,276 | 631,217 | 95.77 | 5.49× | 2.71× | 3/3 |
| 9 | 0.5.7 | 704,944 | 527,403 | 647,498 | 111.35 | 5.30× | 2.33× | 3/3 |
| 10 | 0.5.8 | 1,128,913 | 600,835 | 813,400 | 128.43 | 3.92× | 2.02× | 3/3 |

Across all 27 adapter sessions, including quality failures: mean 766,502 tokens and 124.90 seconds, versus 3,320,805 tokens and 259.55 seconds for the three references (4.33× token and 2.08× time ratios). 24/27 adapter sessions passed; all three reference sessions passed.

## Final revision compared with reference

Each row compares one fresh final-revision session with the single bare reference for that same prompt. These are descriptive observations, not estimates of a stable model-wide speedup.

| Prompt | Bare tokens | Final tokens | Token ratio | Bare seconds | Final seconds | Time ratio | Final quality |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| A (6 needs) | 2,098,739 | 1,128,913 | 1.86× | 144.02 | 109.59 | 1.31× | Pass |
| B (12 needs) | 5,272,958 | 600,835 | 8.78× | 220.84 | 56.44 | 3.91× | Pass |
| C (16 needs) | 2,590,718 | 813,400 | 3.19× | 413.78 | 219.26 | 1.89× | Pass |

## Session accounting

Input includes cached input. Uncached input is input minus cached input; output includes reasoning as reported. These are token counts, not dollar costs. Elapsed time is the worker turn duration. Browser interactions count actual executed CLI actions, including failures; model tool calls count tool invocations. Images are observed image records, not estimated image tokens.

| Run | Uncached input | Cached input | Output | Total | Seconds | Browser actions | Model tool calls | Images | Quality |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| r01a | 71,939 | 2,018,944 | 7,856 | 2,098,739 | 144.02 | 55 | 35 | 2 | Pass (5/5 available) |
| r01b | 135,679 | 5,125,120 | 12,159 | 5,272,958 | 220.84 | 100 | 67 | 0 | Pass (11/11 available) |
| r01c | 83,518 | 2,489,728 | 17,472 | 2,590,718 | 413.78 | 62 | 38 | 2 | Pass (15/15 available) |
| r02a | 70,118 | 781,824 | 3,960 | 855,902 | 113.43 | 13 | 17 | 0 | Pass (5/5 available) |
| r02b | 43,593 | 524,544 | 6,483 | 574,620 | 146.23 | 7 | 10 | 1 | Pass (11/11 available) |
| r02c | 46,332 | 567,296 | 7,867 | 621,495 | 176.97 | 9 | 11 | 0 | Pass (15/15 available) |
| r03a | 59,479 | 774,912 | 3,803 | 838,194 | 71.56 | 14 | 16 | 0 | Pass (5/5 available) |
| r03b | 51,609 | 783,360 | 6,898 | 841,867 | 158.60 | 12 | 15 | 0 | Pass (11/11 available) |
| r03c | 56,264 | 796,672 | 9,445 | 862,381 | 205.90 | 12 | 14 | 1 | Fail (14/15 available) |
| r04a | 51,471 | 639,488 | 4,766 | 695,725 | 117.86 | 10 | 12 | 1 | Pass (5/5 available) |
| r04b | 64,114 | 727,808 | 5,412 | 797,334 | 136.53 | 9 | 16 | 0 | Pass (11/11 available) |
| r04c | 50,002 | 655,104 | 7,623 | 712,729 | 182.55 | 9 | 13 | 1 | Fail (14/15 available) |
| r05a | 53,608 | 813,568 | 5,557 | 872,733 | 140.70 | 11 | 17 | 1 | Pass (5/5 available) |
| r05b | 58,496 | 1,199,744 | 8,185 | 1,266,425 | 196.70 | 18 | 22 | 2 | Pass (11/11 available) |
| r05c | 46,611 | 617,216 | 6,062 | 669,889 | 87.14 | 8 | 12 | 0 | Pass (15/15 available) |
| r06a | 50,229 | 815,104 | 4,371 | 869,704 | 109.25 | 8 | 15 | 0 | Pass (5/5 available) |
| r06b | 55,111 | 558,336 | 5,224 | 618,671 | 118.85 | 8 | 10 | 0 | Pass (11/11 available) |
| r06c | 51,164 | 900,352 | 6,895 | 958,411 | 97.40 | 12 | 18 | 0 | Fail (14/15 available) |
| r07a | 76,841 | 877,440 | 4,518 | 958,799 | 76.47 | 13 | 17 | 1 | Pass (5/5 available) |
| r07b | 44,437 | 579,584 | 3,350 | 627,371 | 88.69 | 7 | 12 | 1 | Pass (11/11 available) |
| r07c | 53,519 | 757,248 | 6,011 | 816,778 | 140.85 | 11 | 13 | 0 | Pass (15/15 available) |
| r08a | 39,537 | 552,192 | 4,310 | 596,039 | 107.46 | 8 | 11 | 1 | Pass (5/5 available) |
| r08b | 41,590 | 541,440 | 3,246 | 586,276 | 82.60 | 8 | 12 | 0 | Pass (11/11 available) |
| r08c | 35,778 | 591,616 | 3,823 | 631,217 | 97.25 | 10 | 12 | 0 | Pass (15/15 available) |
| r09a | 45,403 | 655,360 | 4,181 | 704,944 | 107.23 | 9 | 12 | 1 | Pass (5/5 available) |
| r09b | 46,965 | 476,416 | 4,022 | 527,403 | 93.82 | 7 | 10 | 0 | Pass (11/11 available) |
| r09c | 59,622 | 581,888 | 5,988 | 647,498 | 133.00 | 8 | 10 | 0 | Pass (15/15 available) |
| r10a | 66,104 | 1,058,816 | 3,993 | 1,128,913 | 109.59 | 11 | 18 | 1 | Pass (5/5 available) |
| r10b | 41,382 | 556,032 | 3,421 | 600,835 | 56.44 | 10 | 11 | 0 | Pass (11/11 available) |
| r10c | 59,451 | 743,680 | 10,269 | 813,400 | 219.26 | 10 | 14 | 0 | Pass (15/15 available) |

## Revisions and observations

- Round 1 (bare): Fresh ordinary native browsing on the full 530-product catalog; no adapter.
- Round 2 (0.5.0): Remove exclusions and structured filters, retain every native result, paginated compact tables and photo contact sheets, batched journaled cart review. Raise public lookup retention to 2048 and restore cached result references. Full live scan retained 530 IDs including all 24 unavailable products; 38 contract tests passed. Reference A/B require repeated native navigation and snapshot calls.
- Round 3 (0.5.1): Keep seven decision columns in stable order on every catalog page; factor only other shared fields. All three round-2 agents concatenated table rows and guessed column indices across pages. B initially chose an unavailable item; safe preflight prevented writes. 39 tests pass, including cross-page field variation.
- Round 4 (0.5.2): Add a self-describing shop_search tool and searchTable method for up to 20 independent native keyword reads, compact stable tables, per-query errors/cursors and optional photos. Round 3 repeated whole-catalog traversal and multiple separate missing-merchandise searches. All native records remain in every returned query; 40 tests pass.
- Round 5 (0.5.3): Promote a generic native-keyword batch callback in visible discovery, with query placeholders selected by the agent and explicit per-query coverage. Keep full catalog browsing available. Round 4 A/B repeatedly traversed 530 records; C used searchTable. This changes general discovery, without prescribing products, task terms or answers.
- Round 6 (0.5.4): Add general evidence guidance to catalog/search/discovery: each requested feature needs listing/attribute support; titles and illustrative pictures alone do not establish construction, material or personal fit. Distinct requests need distinct products. C in rounds 3 and 4 selected an original beanie without explicit knit evidence. Both failures remain counted; no item-specific rule or answer is added.
- Round 7 (0.5.5): Expose shop_view for exact previously returned IDs, with a generic callback combining image display and screenshot in one execution. Photo paging and all product options remain available. Round 5 B used several separate photo reads/screenshots. This reduces calling/discovery friction; 41 tests pass, including unknown-identity rejection before networking.
- Round 8 (0.5.6): Retain 280 listing characters in compact tables, expose descriptionTruncated when native or output bounds cut text, and preserve known false sale status plus regular price. No record removal. Feature-evidence failures motivate explicit unknown/truncated text rather than assuming a title supplies facts. 42 tests pass, including later feature text and truthful truncation/false flags.
- Round 9 (0.5.7): Report loaded, failed, pending and absent image IDs after bounded decode waits; clear completed timers. Failed photos never remove products or certify visual facts. Visual choices require actual pixels; URL presence alone was previously reported as hasImage. 43 tests pass, including a failed photo retained in comparison.
- Round 10 (0.5.8): Coalesce synchronous public lookup-reference persistence into one microtask per record batch, instead of serializing the growing reference map for every product twice. Prices/tokens remain transient; preflight stays fresh. Every native product and returned cached record called remember, causing repeated serialization during broad reads. 44 tests pass, including bounded storage writes and immediate post-await reload lookup.

## Failed quality checks

- r03c: available_items_correct, qualifies. The selected Summit Mark Beanie does not establish the requested knit construction in its listing; the sample illustration does not resolve that evidence gap. Retained in token/time totals and session count.
- r04c: available_items_correct, qualifies. The selected Summit Mark Beanie does not establish the requested knit construction in its listing; the sample illustration does not resolve that evidence gap. Retained in token/time totals and session count.
- r06c: available_items_correct, qualifies. The selected Summit Mark Beanie does not establish the requested knit construction in its listing; the sample illustration does not resolve that evidence gap. Retained in token/time totals and session count.

Native cart snapshots, final replies, executed browser commands, request URLs, screenshots, exact script/prompt hashes and individual metrics are preserved under `output/playwright/woo-luna-real-catalog-20261006/<run>/`. The offline evaluator accepts any correct distinct combination from the full catalog. Normal agent comparisons of returned records are allowed; the adapter never removes records or supplies a preset basket. Automated request checks reject category/price/stock/sale filtering, and public actions are reviewed for context/host shortcuts.

Final audit: 30 sessions completed and closed; catalog and ordering unchanged; no orders created; Playwright browser inventory empty. Native product and tailnet asset verification also passed for all three stores.

## Final implementation verification

The benchmark ended with immutable version 0.5.8 snapshots. A subsequent integration check found that Magento requires a GraphQL search or criteria argument even to enumerate all products. Shipped version 0.5.9 sends an empty native criteria object containing no category, price, stock, SKU or other product condition. It does not remove records. No benchmark agent was rerun or result rewritten after this correction.

Version 0.5.9 passed 45 adapter contract tests and nine accounting tests. Independent integration contexts scanned 530 distinct records on every store, checked paging/cache and rejection of structured filters before networking, added three discovered products, replayed without duplication, and restored the original basket. WooCommerce and Magento listing reads retained all 24 unavailable products; PrestaShop listing stock stays unknown until fresh details. Two sample photos loaded on each platform. PrestaShop and Magento verified native cart markup from the starting page; WooCommerce reported unsupported markup there, while the 30 benchmark carts were separately checked after opening their rendered carts. All integration contexts closed.

The 500 replacements are plausible invented demo listings with 18 reused sample illustrations. This does not measure a large, diverse real retailer catalog. Only one bare reference per prompt and one observation per adaptive revision were run; neither token ratios nor time ratios establish causality or a stable speedup. The best observed passing trio was round 8; the final trio used more tokens, so that variation must remain visible.

Private stores: [WooCommerce](https://krzysztofs-mac-studio.tail657ea.ts.net:18091/), [PrestaShop](https://krzysztofs-mac-studio.tail657ea.ts.net:18092/), [Magento](https://krzysztofs-mac-studio.tail657ea.ts.net:18093/).

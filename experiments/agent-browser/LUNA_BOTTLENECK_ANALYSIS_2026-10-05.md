# Why the commerce-tool run did not reach 5× elapsed-time improvement

Archive note: linked measurement snapshots are committed below `results/`. Original screenshots, browser state, raw protocol events and other artifacts marked local-only are retained outside version control.

The remaining cost is primarily repeated model responses and detailed reporting. Actual assigned-tool execution took only 17.402 seconds summed across six workers: 1.40% of their combined 1,246.831 seconds. API and browser operations were already fast; reducing those few seconds cannot produce a further several-fold improvement.

This is an analysis of the retained traces. No new model runs were launched and no platform or benchmark behavior was changed during the investigation.

## Where time went

These are means per worker. The six workers ran concurrently, so the rows partition average worker time rather than the 286.127-second cohort wall time. Tool time is contained within the phase durations, not an extra component.

| Phase | Mean seconds per worker | Share of worker time |
| --- | ---: | ---: |
| Orientation / initial catalog | 12.606 | 6.07% |
| Discovery / searches | 36.258 | 17.45% |
| Comparison / selecting products | 57.363 | 27.60% |
| Basket stage | 9.742 | 4.69% |
| Verification / handoff | 8.947 | 4.31% |
| Detailed report after handoff | 82.889 | 39.89% |

Discovery and comparison together averaged 93.621 seconds per worker (45.05%). Reporting averaged 82.889 seconds (39.89%). The actual tools averaged 2.900 seconds, with 204.905 seconds outside tool execution. Outside-tool time includes model generation, prefill/startup, transport and orchestration; it is not a measured pure reasoning time.

## What improved, using the four workers that completed the baseline

| Phase | Baseline mean (s) | New mean (s) | Observed ratio |
| --- | ---: | ---: | ---: |
| Orientation / initial catalog | 10.063 | 13.726 | 0.73× |
| Discovery / searches | 38.862 | 37.995 | 1.02× |
| Comparison / selecting products | 120.349 | 69.895 | 1.72× |
| Basket stage | 58.927 | 12.399 | 4.75× |
| Verification / handoff | 25.050 | 10.956 | 2.29× |
| Detailed report after handoff | 80.166 | 83.758 | 0.96× |

The basket stage improved 4.75× on these matched workers. Three individual matched workers improved roughly 4.9×, 11.5× and 13.1× in that phase; the fourth contained a long response gap. Discovery barely improved in the matched mean, comparison improved 1.72×, and reporting became slightly slower. Those largely unchanged stages explain the end-to-end result.

The baseline whole-run time includes two 600-second timeouts. Its 603.218 / 286.127 = 2.11× ratio is therefore not a uniform per-task speedup. For the four matched completed workers, mean full-turn time improved only 1.46×, from 333.416 to 228.731 seconds.

## The slowest worker had large gaps unrelated to tool execution

prestashop-session-1-agent-2 determined cohort completion. Its turn lasted 282.424 seconds, handoff occurred at 209.803, and all its tools together took 1.790 seconds. It made 12 tool calls, fewer than the other PrestaShop worker’s 19, yet finished 51.921 seconds later.

Six response cycles had long gaps before the next observable generated item began:

| Next action | Gap before first observable generated item (s) | Reasoning output tokens in that response | Total output tokens |
| --- | ---: | ---: | ---: |
| phase discovery | 21.306 | 52 | 135 |
| search_many | 22.212 | 18 | 104 |
| products | 25.183 | 31 | 155 |
| phase cart | 26.543 | 126 | 209 |
| phase verification | 26.021 | 21 | 98 |
| handoff | 22.802 | 24 | 83 |

Those six gaps total 144.067 seconds, or 51.01% of its full turn. Across all response cycles, its first-activity gaps total 157.980 seconds. The next responses often contained only 18–52 reasoning output tokens, so these are not explained by lengthy visible reports or slow browser execution.

The timestamps do not identify the underlying cause. Startup/prefill, queueing, transport, hidden work before an event is emitted, or orchestration may contribute. The trace provides no explicit retry or rate-limit diagnosis. Calling all of this “thinking time” or “server queue time” would overstate the evidence.

Removing only these gaps from this one worker would make the other PrestaShop worker the longest run. Other workers still spend substantial time comparing and reporting, so this anomaly alone does not explain the whole cohort’s limit.

## The protocol still encouraged repeated work

The model tool surface improved, but the interaction trajectory was not reduced to the intended inspect → choose → commit flow.

- The agents received a complete 30-product catalog, then made 18 search calls, including repeated synonyms for absent drinkware and missing color attributes. Those searches were local catalog lookups; they added no new inventory. Their responses returned 138 product records, many already present in the initial catalog.
- Three search calls exceeded the ten-query cap and were retried in smaller batches. This cheap local operation can split internally or accept a larger batch; asking the model to handle that limit creates more responses.
- Substring matching made red match words such as tapered, collared and structured. Agents spent time rejecting these false color matches. Warm also matched warm days, which does not establish winter insulation. Explicit attribute and sale fields plus word-aware text matching would make the evidence clearer.
- Seven detail calls returned 35 product records in addition to the initial catalog. The full descriptions sometimes add useful information, but returning the entire already-known record each time increases context. Only changed/requested fields are needed.
- There were 24 phase annotations. Eight consumed a response cycle containing only phase commands; the others were combined with substantive actions. Controller-inferred phases would preserve timing without asking the model to generate these commands.
- Every worker called verify after basket_sync had already returned checked API state, then handoff checked API and rendered state again. The final basket operation can perform write, readback, native-page verification and handoff in one helper execution.
- One PrestaShop worker made seven browser calls to inspect incomplete color/product data. Two failed on duplicate accessible link names. Five workers completed without that fallback; the common issue was unknown metadata, not failure of the native basket adapters.

The trace contains 68 distinct usage-bearing model response cycles. Eight were phase-only. This count differs from the 80 tool calls because one response can emit several tools, and the final report emits none. The longest worker used 13 response cycles; repeated startup delays therefore accumulated despite fast tools.

## Reporting is a large independent workload

The six final report responses generated 27,124 output tokens: 15,863 reasoning tokens and 11,261 other output tokens. That is 50.82% of all output, and 44.83% of all reasoning output in the run.

After the cart was already verified and the browser released, each worker spent 72.621–92.753 seconds finishing its JSON report. The schema asked it to repeat product evidence, substitutions, unknowns, timing measurements, search history, difficulties and cart totals. The model also used xhigh reasoning for this reporting response.

A useful next design is to keep model-authored selection rationale, uncertainty and brief difficulty assessments, while the controller builds the detailed timing, token, interaction and basket report from captured evidence. This preserves a detailed research artifact without requiring the model to narrate every measured number or duplicate product facts.

## Why token improvements also differ

Total tokens including cache improved 6.54×, already beyond 5×. Excluding cache, the ratio is 2.59×. Total input volume fell 6.77×, but cached input represented 92.00% of baseline input and 81.42% of new input. The recorded fractions differ; this is not evidence of a caching malfunction.

Output decreased by only 12.26% and reasoning output by only 9.83%, even though browser interactions fell 96.32%. The new run completed six detailed reports, while the baseline completed four, which also affects the output comparison.

Final-report responses used 42,135 tokens excluding cached input, 14.63% of the run. Removing report generation alone would still leave 245,830 such tokens—only 3.03× better than baseline. Repeated response/context costs also need to shrink.

## What a 5× target requires

Against the whole-run baseline, a 5× elapsed-time target is 120.644 seconds. The current longest handoff alone occurred at 209.803 seconds. Even with all post-handoff reports removed, that worker’s context/setup plus handoff time is 212.262 seconds; the cohort cannot finish earlier while retaining the observed trajectory. Removing reports alone therefore cannot reach 5×.

The next experiment should keep Luna xhigh for product selection and change the trajectory:

1. inspect returns a compact catalog, complete coverage, category/attribute summaries and existing basket. Stop searching for a type absent from complete coverage or an attribute explicitly unavailable, and report that limitation.
2. The agent selects three product handles and supplies short rationale/uncertainty in one submission. The helper synchronizes the basket, verifies API and native UI state, and hands over the context in the same operation.
3. The controller infers phases and produces the full measurements/report from the event ledger. A concise worker result carries the recommendation reasoning; it need not regenerate all telemetry.
4. Diagnose response-start delays separately, with explicit request-dispatch, first-response-event and completion timestamps. A later controlled concurrency check can test whether the long gaps persist; current traces do not prove their cause.

This directly targets repeated model round trips and report generation while retaining the model, session isolation, three-product task, independent cart checks and handoff. Reaching 5× remains a testable target, not a prediction established by this analysis.

## Evidence

- [Machine-readable timing and response-cycle analysis](results/2026-10-05T14-54-34.884Z-9624220f/bottleneck-analysis.json)
- [New measurement snapshot](results/2026-10-05T14-54-34.884Z-9624220f/report.json)
- New event timestamps, tool arguments and token usage (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T14-54-34.884Z-9624220f/events.jsonl`)
- [Baseline measurement snapshot](results/2026-10-05T13-21-59.909Z-4ffa6cab/report.json)
- [Full prior comparison](LUNA_COMMERCE_TOOL_REPORT_2026-10-05.md)

Phase boundaries are worker annotations; elapsed durations are controller measurements. The event analysis uses timestamps, tool inputs/results and token counters, without inspecting or reproducing internal reasoning text. No new model runs or behavior changes were made.

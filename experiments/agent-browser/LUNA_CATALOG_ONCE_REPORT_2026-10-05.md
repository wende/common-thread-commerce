# Luna xhigh: catalog reuse and no agent report

Archive note: linked measurement snapshots are committed below `results/`. Original screenshots, browser state, raw protocol events and other artifacts marked local-only are retained outside version control.

Six concurrent fresh contexts, two per shop; one session; `gpt-6-luna` with `xhigh`. Run `2026-10-05T15-58-06.510Z-1eab69da`. All six native baskets, handoffs, end-of-run checks and restored-session checks passed. The six prompts are identical except assigned handles, and the original isolation pre-prompt is unchanged.

## Result

| Metric | Browser-only baseline | Previous API tools | Catalog once, no report |
| --- | ---: | ---: | ---: |
| Cohort wall time (s) | 603.218 | 286.127 | 77.820 |
| Total tokens including cached input | 8,611,561 | 1,316,061 | 541,189 |
| Cached input | 7,866,624 | 1,028,096 | 370,688 |
| Uncached input + output | 744,937 | 287,965 | 170,501 |
| Output including reasoning | 60,827 | 53,369 | 13,174 |
| Reasoning output (subset) | 39,238 | 35,382 | 8,910 |
| Agent tool calls | 217 | 80 | 47 |
| Manual page interactions | 190 | 7 | 0 |
| Search calls / detail calls | — | 18 / 7 | 0 / 0 |

Wall improvement is 3.68× over the previous API run and 7.75× over the browser-only baseline. Tokens excluding cache improved 1.69× and 4.37× respectively. Including cache, improvements are 2.43× and 15.91×.

The browser-only baseline includes two 600-second timeouts. The previous API cohort produced six verified carts but one strict PARTIAL final report; its published strict grade was 5 PASS / 1 FAIL. This run grades verified task completion at handoff and deliberately has no final report grade. These are whole-run observations, not a controlled attribution of the independent effect of each change.

For the four workers that completed the original baseline, mean turn time fell from 333.416s to 52.912s: 6.30×. This comparison excludes the baseline timeouts. For the five strict PASS workers from the previous API run, the matched mean improved 3.99× (219.093s to 54.878s).

## Changes and controls

- Initial inspection includes full available descriptions, category counts, attribute coverage, complete-inventory coverage and the basket revision. Agents choose their own products; the controller supplies no predetermined candidates.
- Local search and redundant detail-fetch actions are omitted from the agent schema and rejected by the broker. Complete coverage makes absent product types a substitution decision; missing color or size remains unknown. Incomplete coverage can still require the assigned browser.
- The controller interrupts a turn after successful verified handoff. This avoids any agent-generated final report. Expected interrupted turns are graded against independent basket evidence and handoff, with token accounting and model/isolation checks still required.
- The same vague shopping request, Luna xhigh, six simultaneous contexts, isolation pre-prompt, phase annotations, separate basket synchronization, explicit verification and separate handoff are retained. Product rationale is captured only as a brief basket-tool note, as requested by the shopping prompt.
- No platform source, configuration, products or prices are changed. No purchases or checkout writes are made. The original browsers and the new handed-off browsers remain live.

Three preflights initially failed: two network-idle navigation timeouts (Magento, then WooCommerce), followed by a 20-second Magento catalog API timeout. All three homepages returned HTTP 200 in separate document-readiness checks, and server logs showed the delayed catalog requests eventually returned HTTP 200. The harness therefore uses domcontentloaded plus explicit cart-input readiness, rather than networkidle; navigation and explicit API requests are bounded at 60 seconds. These are additional reliability changes, and changed loading conditions limit timing attribution. The failed preflights did not launch model workers and are excluded from the measured cohort.

## Per-agent measurements

| Agent | Turn status | Turn seconds | Handoff seconds | Tokens excl. cache | Cached input | Output incl. reasoning | Tool seconds | Tools / failures | Model responses |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| magento-session-1-agent-1 | interrupted | 62.369 | 62.368 | 22,816 | 84,224 | 2,652 | 2.757 | 8 / 0 | 8 |
| magento-session-1-agent-2 | interrupted | 62.745 | 62.744 | 27,229 | 80,384 | 2,655 | 2.117 | 8 / 0 | 8 |
| prestashop-session-1-agent-1 | interrupted | 44.748 | 44.747 | 31,337 | 51,968 | 1,830 | 1.813 | 7 / 0 | 7 |
| prestashop-session-1-agent-2 | interrupted | 43.260 | 43.143 | 21,094 | 23,040 | 1,810 | 1.774 | 8 / 0 | 4 |
| woocommerce-session-1-agent-1 | interrupted | 61.270 | 61.268 | 39,375 | 60,160 | 2,071 | 4.561 | 8 / 0 | 8 |
| woocommerce-session-1-agent-2 | interrupted | 61.225 | 61.223 | 28,650 | 70,912 | 2,156 | 4.180 | 8 / 0 | 8 |

Each worker received exactly one initial catalog inspection; no search or detail actions were called. There are zero final agent messages and no detailed-report response schemas or artifacts. Token counter updates sum to the final cumulative counters for every thread. Interrupted turn status is the intentional controller cutoff, after the independently verified cart and revoked browser access.

## Where measured time went

| Phase | Mean seconds per agent |
| --- | ---: |
| cart | 9.870 |
| comparison | 6.756 |
| discovery | 8.361 |
| orientation | 24.491 |
| turn_finalization | 0.021 |
| verification | 6.438 |

Mean handoff time: 55.916s. Assigned-tool execution: 17.202s summed, or 2.867s per worker. Phases partition agent time, not concurrent cohort wall time. turn_finalization is controller interruption/protocol completion, not a reporting step. Outside-tool time includes model work, transport, scheduling and orchestration; it is not measured pure reasoning time.

Mean time before the basket stage (orientation + discovery + comparison) fell from 106.227s to 39.608s. The aggregate avoids overstating the individual discovery phase, because workers mark phase boundaries and some catalog reading now appears in orientation. The previous 82.889-second average reporting phase is entirely removed; the new average protocol finalization is 0.021s.

## Products and brief choice explanations

### magento-session-1-agent-1

| Product | SKU | Quantity | Unit price |
| --- | --- | ---: | ---: |
| Harbor Everyday Tee | CT-001 | 1 | 24.00 |
| Coast Cotton Cap | CT-023 | 1 | 29.00 |
| Trail Pocket Hoodie | CT-011 | 1 | 57.60 |

Harbor Everyday Tee is relaxed-fit cotton, but red-ish color and size are not available to verify; the catalog has no mug, so I chose an adjustable Coast Cotton Cap as a useful everyday alternative. Trail Pocket Hoodie is fleece and discounted 20% ($57.60 from $72).

Verified native cart: http://localhost:8093/checkout/cart/. Screenshot: magento-session-1-agent-1 (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T15-58-06.510Z-1eab69da/magento-session-1-agent-1.png`).

### magento-session-1-agent-2

| Product | SKU | Quantity | Unit price |
| --- | --- | ---: | ---: |
| Harbor Everyday Tee | CT-001 | 1 | 24.00 |
| Coast Cotton Cap | CT-023 | 1 | 29.00 |
| Trail Pocket Hoodie | CT-011 | 1 | 57.60 |

Harbor Everyday Tee has a relaxed cut, though its red tone and size are unverified; no mug is listed, so I chose an adjustable cotton cap as a practical everyday substitute. Trail Pocket Hoodie is fleece and 20% off; size/color options are not documented.

Verified native cart: http://localhost:8093/checkout/cart/. Screenshot: magento-session-1-agent-2 (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T15-58-06.510Z-1eab69da/magento-session-1-agent-2.png`).

### prestashop-session-1-agent-1

| Product | SKU | Quantity | Unit price |
| --- | --- | ---: | ---: |
| Harbor Everyday Tee | CT-001 | 1 | 24.00 |
| Trail Pocket Hoodie | CT-011 | 1 | 57.60 |
| Compass Everyday Cap | CT-022 | 1 | 27.00 |

I picked the soft relaxed-fit Harbor Everyday Tee and the 20%-off fleece Trail Pocket Hoodie; color and sizes are not provided, so I can’t verify a red shade or fit. There’s no mug/drinkware in this complete catalog, so I substituted an adjustable Compass Everyday Cap as a practical everyday accessory.

Verified native cart: http://localhost:8092/cart?action=show. Screenshot: prestashop-session-1-agent-1 (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T15-58-06.510Z-1eab69da/prestashop-session-1-agent-1.png`).

### prestashop-session-1-agent-2

| Product | SKU | Quantity | Unit price |
| --- | --- | ---: | ---: |
| Harbor Everyday Tee | CT-001 | 1 | 24.00 |
| Trail Pocket Hoodie | CT-011 | 1 | 57.60 |
| Compass Everyday Cap | CT-022 | 1 | 27.00 |

Harbor Everyday Tee is a soft cotton relaxed-fit pick, but color and size are unspecified, so I can't confirm a red tone or fit; Trail Pocket Hoodie is a fleece layer discounted 20%. No mugs are sold, so I substituted the adjustable Compass Everyday Cap as a practical daily accessory.

Verified native cart: http://localhost:8092/cart?action=show. Screenshot: prestashop-session-1-agent-2 (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T15-58-06.510Z-1eab69da/prestashop-session-1-agent-2.png`).

### woocommerce-session-1-agent-1

| Product | SKU | Quantity | Unit price |
| --- | --- | ---: | ---: |
| Harbor Everyday Tee | CT-001 | 1 | 24.00 |
| Coast Cotton Cap | CT-023 | 1 | 29.00 |
| Ridge Ribbed Beanie | CT-019 | 1 | 17.60 |

No mugs or drinkware are stocked, so I chose an adjustable-back Coast Cotton Cap as a practical everyday accessory substitute. The Harbor Everyday Tee has a relaxed fit, but its red tone and sizing are unspecified; the Ridge Ribbed Beanie is the warm winter pick on sale for $17.60 (was $22).

Verified native cart: http://localhost:8091/cart/. Screenshot: woocommerce-session-1-agent-1 (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T15-58-06.510Z-1eab69da/woocommerce-session-1-agent-1.png`).

### woocommerce-session-1-agent-2

| Product | SKU | Quantity | Unit price |
| --- | --- | ---: | ---: |
| Harbor Everyday Tee | CT-001 | 1 | 24.00 |
| Coast Cotton Cap | CT-023 | 1 | 29.00 |
| Ridge Ribbed Beanie | CT-019 | 1 | 17.60 |

Harbor Everyday Tee is relaxed cotton jersey, but red-ish color and size details are unavailable in the catalog. No mug or drinkware is sold, so I substituted an adjustable cotton cap; the Ridge Ribbed Beanie is a warm rib-knit option at 20% off.

Verified native cart: http://localhost:8091/cart/. Screenshot: woocommerce-session-1-agent-2 (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T15-58-06.510Z-1eab69da/woocommerce-session-1-agent-2.png`).

## Operation accounting and restored sessions

Actions: `{"basket_sync": 6, "handoff": 6, "inspect": 6, "phase": 23, "verify": 6}`. Explicit agent API requests: 58; HTTP write requests: 12; native product mutations: 18. Automatic browser asset/network requests are excluded. Manual page interaction calls use the same snapshot/click/fill/press unit as prior runs. Internal helper browser work: `{"evaluations": 10, "navigations": 6, "clicksOrFills": 0}`; this is separate from manual agent page interactions.

Assigned tools occupied 5.13% of summed agent turn time. In the previous API run, all assigned tools together took 17.402s. New explicit API requests alone took 8.488s summed across workers. These measurements allow environmental/API delays to be distinguished from model and protocol overhead; concurrency means summed durations are not cohort wall time.

All six saved sessions were restored independently and verified against their native API and rendered cart. Distinct cookie jars per shop: `[{"target": "woocommerce", "distinctCookieJars": true}, {"target": "prestashop", "distinctCookieJars": true}, {"target": "magento", "distinctCookieJars": true}]`. These post-run reads are excluded from measured agent time and API counts. Only the temporary restoration browser was closed; original handoff contexts remain live.

## Reproduction and evidence

```sh
cd experiments/agent-browser
npm test
node commerce-smoke.mjs --catalog-once
node run.mjs --agents 2 --sessions 1 --task vague-commerce-task.json --commerce-tools --catalog-once --stop-at-handoff --timeout 600 --keep-open
node commerce-verify-run.mjs ../../output/playwright/agent-browser/2026-10-05T15-58-06.510Z-1eab69da
python3 compare-catalog-once.py ../../output/playwright/agent-browser/2026-10-05T15-58-06.510Z-1eab69da
```

- [Controller report](results/2026-10-05T15-58-06.510Z-1eab69da/report.json)
- [Comparison data](results/2026-10-05T15-58-06.510Z-1eab69da/comparison.json)
- [Restoration verification](results/2026-10-05T15-58-06.510Z-1eab69da/restoration-verification.json)
- [Benchmark harness](run.mjs)
- [Previous API run](results/2026-10-05T14-54-34.884Z-9624220f/report.json)
- [Original browser-only run](results/2026-10-05T13-21-59.909Z-4ffa6cab/report.json)

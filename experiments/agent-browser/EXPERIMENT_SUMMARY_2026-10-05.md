# Shopping-agent experiment summary

October 5, 2026. Latest result: six verified basket handoffs in **77.8 seconds**, versus **603.2 seconds** for the browser-only baseline and **286.1 seconds** for the first API-tool run. The browser-only baseline included two timeouts; the four workers that completed it improved **6.30×** in matched mean turn time.

## 1. What we have: three native websites

Three independent local e-commerce shops run in Docker with the same invented catalog: **30 products across Tees, Hoodies, Shirts, Headwear, and Accessories**. Names, SKUs, descriptions, prices, discounts and stock are shared, while each platform retains its native listings, search, product pages and cart.

| Website | Platform / theme | Local storefront |
| --- | --- | --- |
| WooCommerce | WordPress + WooCommerce; Storefront | [WooCommerce](http://localhost:8091/) |
| PrestaShop | PrestaShop; Classic | [PrestaShop](http://localhost:8092/) |
| Magento | Magento Open Source; Luma | [Magento](http://localhost:8093/) |

These are real platform installations. The harness uses their existing storefront interfaces. The optimization experiment did not modify platform source code, catalog data, configuration, prices or stock, and placed no orders.

## 2. What we measure

The same deliberately vague request asks the agent to choose **a red-ish T-shirt that might fit, a coffee mug, and a discounted item for winter warmth**. It must choose a sensible alternative when a type is absent, acknowledge unknown color/fit, add **three different items, one of each**, and leave the native cart ready for user handoff. The prompt gives no product names, SKUs, brands, sizes or budget.

Each measured run used **six concurrent `gpt-6-luna` agents at `xhigh` reasoning**, two per shop, with fresh isolated browser contexts, identical shopping prompts, the same isolation pre-prompt and a 600-second agent timeout. The agents choose products; the harness supplies no predetermined candidates.

The controller measures elapsed time, authoritative token usage, tool calls and failures. It independently checks product identities, stock, quantities and visible prices in the native cart. The latest run also restored and verified all six saved sessions, with distinct cookie jars within each shop.

## 3. Modifications that improved performance

**First improvement: a structured, session-bound shopping tool.** We replaced most snapshot/click/fill/search loops with `assigned_shop`: a normalized catalog, descriptions, availability, prices, basket state and scoped product handles. A single `basket_sync` call submits all three desired quantities, validates the basket revision, supports idempotent operation IDs and reads back the result. Requests share the assigned browser context’s cookies, so the user receives the actual native shopping session.

| Platform | Existing native interface used by the adapter |
| --- | --- |
| WooCommerce | Store API catalog/cart endpoints and native mutation batching |
| PrestaShop | Storefront listing/cart AJAX; writes serialized inside one agent tool call |
| Magento | GraphQL catalog/cart operations; first add uses the frontend form to establish the browser’s cart identity |

**Second improvement: eliminate repeated discovery.** Initial inspection now includes full available descriptions, category counts, attribute coverage and inventory coverage. The current agent tool schema omits local search and redundant detail-fetch actions. Agents select directly from the complete catalog and treat missing types as substitution decisions and missing attributes as unknown. This removed all 18 search calls and seven detail calls from the first API run.

**Third improvement: eliminate the agent report step.** After successful, independently verified handoff, the controller interrupts the turn. Agents supply only a brief choice/substitution note within the basket operation. Timing, token and basket reports are assembled by the controller. The previous **82.9-second average final-report phase** was removed entirely.

Phase markers, separate basket synchronization, explicit verification and handoff remain. Current sequence: `inspect → select/mark phases → basket_sync → verify → handoff`. Native API and rendered-cart checks, screenshots, isolation enforcement and browser retention still apply.

For reliability after preflight timeouts, navigation now waits for document readiness and visible cart controls rather than network idle; navigation and explicit API request timeouts were raised to 60 seconds. These additional harness changes and varying loading conditions limit attribution of the exact timing gain to any one modification.

## 4. Before-and-after results

**Stages:** A = browser-only with detailed agent reports; B = first API-tool run with optional searches/details and detailed reports; C = full catalog once, no agent report. Values below cover two agents per platform.

### Time and verified handoffs

Agent turn time runs from turn submission to turn end. A and B include final report generation; C ends at verified handoff. A1/A2 refer to the same worker identifiers across runs. Timeouts are shown explicitly rather than averaged as successful completions.

| Platform | A: agent seconds, A1 / A2 | B: agent seconds, A1 / A2 | C: agent seconds, A1 / A2 | Verified handoffs A → B → C | Matched successful A → C speedup |
| --- | --- | --- | --- | --- | ---: |
| WooCommerce | 307.8 / timeout at 600 s | 178.6 / 151.4 | 61.3 / 61.2 | 1/2 → 2/2 → 2/2 | 5.02× |
| PrestaShop | 349.7 / 392.2 | 230.5 / 282.4 | 44.7 / 43.3 | 2/2 → 2/2 → 2/2 | 8.43× |
| Magento | 283.9 / timeout at 600 s | 223.4 / 180.5 | 62.4 / 62.7 | 1/2 → 2/2 → 2/2 | 4.55× |

Matched speedups compare the same workers that successfully completed the browser-only baseline: WooCommerce A1, both PrestaShop workers, and Magento A1. They exclude timeout cases.

### Token usage by platform

Primary token counts below are **uncached input + all output**, including reasoning output. They include both agents, including any failed attempt. Cached input is excluded; it is not added twice. Output and reasoning output are not separate additive totals.

| Platform | A: tokens excluding cache | B: tokens excluding cache | C: tokens excluding cache | A → C reduction factor |
| --- | ---: | ---: | ---: | ---: |
| WooCommerce | 223,568 | 71,917 | 68,025 | 3.29× |
| PrestaShop | 329,514 | 134,693 | 52,431 | 6.28× |
| Magento | 191,855 | 81,355 | 50,045 | 3.83× |

| Platform | A: total tokens including cache | B: total tokens including cache | C: total tokens including cache |
| --- | ---: | ---: | ---: |
| WooCommerce | 1,970,256 | 332,525 | 199,097 |
| PrestaShop | 4,801,322 | 623,909 | 127,439 |
| Magento | 1,839,983 | 359,627 | 214,653 |

### Interactions and failures by platform

One manual page interaction is one agent snapshot/click/fill/press call. Internal browser work performed by API helpers is counted separately in the raw reports. Tool totals include phase markers and handoff.

| Platform | Agent tool calls A → B → C | Manual page calls A → B → C | Failed tool calls A → B → C | Search/detail calls B → C |
| --- | --- | --- | --- | --- |
| WooCommerce | 63 → 22 → 16 | 56 → 0 → 0 | 5 → 0 → 0 | 4/2 → 0/0 |
| PrestaShop | 90 → 31 → 15 | 80 → 7 → 0 | 9 → 3 → 0 | 6/2 → 0/0 |
| Magento | 64 → 27 → 16 | 54 → 0 → 0 | 3 → 2 → 0 | 8/3 → 0/0 |

### Whole-run totals

| Metric | A: browser only | B: first API tools | C: latest |
| --- | ---: | ---: | ---: |
| Cohort wall time | 603.2 s | 286.1 s | 77.8 s |
| Verified basket handoffs | 4/6 | 6/6 | 6/6 |
| Tokens excluding cache | 744,937 | 287,965 | 170,501 |
| Total tokens including cache | 8,611,561 | 1,316,061 | 541,189 |
| Cached input | 7,866,624 | 1,028,096 | 370,688 |
| Output including reasoning | 60,827 | 53,369 | 13,174 |
| Agent tool calls | 217 | 80 | 47 |
| Manual page calls | 190 | 7 | 0 |

Latest versus first API run: **3.68× faster wall time** and **1.69× fewer tokens excluding cache**. Latest versus browser-only baseline: **7.75× faster wall time** and **4.37× fewer tokens excluding cache**. The baseline wall comparison includes two timeouts; among its four successful matched workers, mean turn time improved **6.30×**.

All six latest workers produced verified carts and handoffs, with zero failed tool calls, zero manual page calls, zero repeated search/detail calls and zero final agent messages. The first API run also produced six verified handoffs, but one WooCommerce final report said PARTIAL because requested attributes could not be confirmed; its strict report-based grade was 5 PASS / 1 FAIL. The latest grade intentionally checks completion at handoff, without an agent report grade.

These are observations from one six-agent cohort per configuration, with two workers per platform. The changes were combined, so the data does not isolate each modification’s independent effect.

### Evidence and reproduction

Committed measurement snapshots preserve the counts, timings, usage and verification outcomes. Browser/session identifiers and raw transcripts are omitted; original raw artifacts remain in local output.

- [Platform setup and shared catalog](../../README.md)
- [A: browser-only measurement snapshot](results/2026-10-05T13-21-59.909Z-4ffa6cab/report.json)
- [B: first API-tool measurement snapshot](results/2026-10-05T14-54-34.884Z-9624220f/report.json)
- [C: latest measurement snapshot](results/2026-10-05T15-58-06.510Z-1eab69da/report.json)
- [Latest full controller report](LUNA_CATALOG_ONCE_REPORT_2026-10-05.md)
- [Full agent instruction bundle](results/2026-10-05T15-58-06.510Z-1eab69da/prompt-bundle.json)

```sh
cd experiments/agent-browser
node run.mjs --agents 2 --sessions 1 --task vague-commerce-task.json --commerce-tools --catalog-once --stop-at-handoff --timeout 600 --keep-open
```

Latest validation: 16 unit checks, six deterministic adapter checks and six restored-session checks passed. The handed-off browser contexts were retained.

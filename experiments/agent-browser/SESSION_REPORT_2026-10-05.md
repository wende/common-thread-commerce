# Codex browser-agent testing session — 5 October 2026

Archive note: linked measurement snapshots are committed below `results/`. Original screenshots, browser state, raw protocol events and other artifacts marked local-only are retained outside version control.

This report records the harness development and validation runs, the exact-product comparison, and the latest vague three-item shopping run. The latest run used six concurrent **gpt-6-luna / xhigh** agents: two each on WooCommerce, PrestaShop, and Magento. Four agents completed independently verified carts, browser handoffs, and detailed self-reports; two reached the 600-second timeout. The overall latest-run result was **FAIL** because every worker must pass.

The latest run consumed **744,937 tokens excluding cached input**, plus **7,866,624 cached-input tokens**, for **8,611,561 total tokens including cache**. It lasted **603.218 seconds** and recorded **190 page interactions: 173 successful and 17 failed**. These totals cover the six benchmark workers, including their final reports. They exclude the coordinating chat, report preparation, and earlier runs.

## 1. Objectives and work completed

The original request was to build an automated test capable of launching ten Luna agents at xhigh reasoning effort, assigning a browser task, collecting success and live-browser handoff, recording token usage and completion time, supporting repeated sessions, and applying the supplied isolation pre-prompt. The user then requested two concurrent agents per shop across three shops, followed by a fresh run using vague shopping requirements and detailed accounts of time spent and difficulties.

Work completed:

- Implemented a configurable controller using the authenticated local Codex app-server and a dedicated Playwright Chromium browser. The runner supports up to ten concurrent workers across targets.
- Bound each fresh Codex thread to one isolated browser context and one assigned page through an opaque handle.
- Added an independently verified handoff, screenshots, saved storage state, raw protocol events, exact worker prompts, token accounting, and action auditing.
- Fixed an initial configuration failure: disabling the code-mode host made the dynamic browser tool inaccessible. Leaving the host available restored tool access.
- Validated two concurrent agents across two sequential rounds, then repeated with live browser retention.
- Ran six concurrent agents against the three commerce engines with the same exact-product prompt: six passed.
- Added the vague three-item task, controller-measured phases, structured worker reports, and cart/report consistency checks.
- Ran a fresh six-agent cohort with a 600-second limit: four passed and two timed out.
- Reconstructed diagnostics for the two timed-out workers from their existing traces, without additional worker calls or token usage.
- Counted page interactions from the audit log using one browser-helper invocation as one interaction.

The ten-worker configuration was implemented, but a ten-agent workload was **not launched in the recorded session**. The largest executed cohort contained six concurrent agents. Repeated-round validation used fresh threads and contexts for every trial; it did not give a single worker two browser contexts.

## 2. Latest-run configuration and worker inputs

| Setting | Value |
| --- | --- |
| Run ID | 2026-10-05T13-21-59.909Z-4ffa6cab |
| Run directory created | 2026-10-05 13:21:59.909 UTC / 15:21:59.909 Europe/Warsaw |
| Model / effort | gpt-6-luna / xhigh; model support checked, no fallback allowed |
| Agents | 6 concurrent; 2 per shop |
| Rounds | 1 fresh round |
| Browser assignments | 6 fresh Chromium contexts, one page and one handle per worker |
| Worker turn limit | 600 seconds |
| Page-action limit | 10 seconds per locator action |
| Protocol-request limit | 60 seconds |
| Browser mode | Headed; --keep-open retained the browser after completion |
| Task file | [vague-commerce-task.json](vague-commerce-task.json) |
| Prompts identical except handles | true |

| Store | Starting page | Assigned workers |
| --- | --- | --- |
| WooCommerce | http://localhost:8091/ | 1 and 2 |
| PrestaShop | http://localhost:8092/ | 1 and 2 |
| Magento | http://localhost:8093/ | 1 and 2 |

### Shared shopping request

```text
I don't really know what this shop has. I'm after a red-ish T-shirt that would suit me, maybe a mug for my coffee, and some good deal on something that'll keep me warm in winter. Could you pick three things you'd recommend? I'm not sure about brands or sizes and I haven't really got a budget in mind. If they don't sell one of those things, choose a sensible alternative and explain it. Put one of each in the cart so I can look at your choices, then leave it for me. Don't buy anything.
```

### Exact isolation pre-prompt

This text was supplied verbatim both as a developer instruction and at the start of each saved worker prompt:

```text
You control exactly one assigned browser context. Never inspect, switch to, interact with, navigate, close, or modify any tab, window, target, or browser context outside your assigned context. Never use global browser/tab controls. Only act through the page/session handles provided to you. If an action would require accessing anything outside your assigned context, stop and return `BLOCKED: outside assigned browser context`.
```

### Complete worker prompt, with only the handle anonymized

```text
You control exactly one assigned browser context. Never inspect, switch to, interact with, navigate, close, or modify any tab, window, target, or browser context outside your assigned context. Never use global browser/tab controls. Only act through the page/session handles provided to you. If an action would require accessing anything outside your assigned context, stop and return `BLOCKED: outside assigned browser context`.

Assigned page/session handle: ASSIGNED_HANDLE
I don't really know what this shop has. I'm after a red-ish T-shirt that would suit me, maybe a mug for my coffee, and some good deal on something that'll keep me warm in winter. Could you pick three things you'd recommend? I'm not sure about brands or sizes and I haven't really got a budget in mind. If they don't sell one of those things, choose a sensible alternative and explain it. Put one of each in the cart so I can look at your choices, then leave it for me. Don't buy anything.
Use only assigned_browser. Do not use shell, files, external tools, other agents, global controls, or arbitrary JavaScript. Read a snapshot first. Call handoff once complete. After successful handoff, perform no further browser actions; report SUCCESS with the item/quantity/total. The controller measures tokens and wall time; do not estimate them.
This is a shopping exploration test with no follow-up user available. Pick sensible options from the visible storefront. Add one unit of each of three different recommended products to the cart and leave the full cart page open. Do not place an order. If a requested item is unavailable, make an honest, useful substitution and describe the search evidence. Do not claim a fit or size you cannot establish, or invent product attributes.
To measure your work, call assigned_browser action phase with phase and a short note whenever you move between discovery, comparison, cart, and verification. Use discovery to find the range and check requested items; comparison to inspect product attributes and decide; cart to add/update items; verification to check the final cart. You can return to an earlier phase as needed. The controller measures elapsed durations, including failed browser calls. Its handoff receipt contains measured timing statistics; use those to explain the largest time costs without estimating unavailable measurements.
After handoff, give the detailed JSON report required by the response schema. List the exact names of the selected products, one unit each, current prices, why each meets the vague request, evidence from the pages, substitutions and fit limitations. Explain in detail what you spent most time doing and the difficulties you encountered, their impact and how you resolved them. Distinguish controller measurements from your interpretation. Include unsuccessful searches and failed or repeated interactions, rather than hiding them. If you cannot complete the task, return an honest PARTIAL or BLOCKED report.
```

Each worker also received the same browser-tool description and a structured final-response schema. Required report fields were status, summary, selections (name, requested need, quantity, price, rationale, evidence, limitations), substitutions, fit and unknowns, time-spent assessment, difficulties, search evidence, and cart summary. Workers received no product names, prices, catalog records, personal measurements, budget, or product images as observations. They saw accessible DOM snapshots and URLs; screenshots were captured by the controller for the handoff artifacts.

### Browser capabilities and isolation

The worker tool allowed `snapshot`, `click`, `fill`, and `press`, plus `phase` for timing annotations and `handoff` for verified return of control. Clicks used exact accessible role/name pairs; an optional zero-based index disambiguated duplicate links. Fill could use exact role/name, label, or placeholder. Page actions returned an updated snapshot.

The controller checked the caller thread and assigned handle, serialized calls within each worker, and denied access after handoff or timeout. Workers could not enumerate tabs, select another context, create or close tabs, navigate using a global command, or run arbitrary page JavaScript. Popups were closed by the controller. Cookies and web storage were isolated by Chromium contexts. The dedicated test browser supplied isolated contexts because the available in-app browser API exposed tabs without an isolated-context constructor; Kimi sessions shared a browser profile.

The temporary Codex home shared authentication only. Personal configuration, plugins, hooks, and MCP servers were not inherited; unrelated tools were disabled. This was a restricted browser interface rather than an OS security sandbox. No personal browser profile was attached.

## 3. Measurement definitions and success criteria

- **Page interaction:** one agent-requested Playwright browser-helper invocation of `snapshot`, `click`, `fill`, or `press`. A click/fill/press and the snapshot automatically returned by that call count together as one interaction. Failed attempts count. Individual Playwright statements and internal locator retries are not counted separately.
- **All tool calls:** page interactions plus `phase` and `handoff`. Controller setup, final checks, and artifact capture outside worker calls are excluded from interaction counts.
- **Turn wall time:** controller-measured elapsed time from turn submission to completion, or interruption/diagnostic capture after timeout.
- **Total worker time:** includes context/thread setup before the turn.
- **Handoff time:** elapsed time from turn submission until independent cart verification and revocation of the worker handle.
- **Browser-tool time:** sum of measured durations of the worker tool calls, including failed actions, phase annotations, and handoff. Handoff time includes verification and screenshot overhead.
- **Outside-tool time:** turn wall time minus tool execution time. It includes model generation, transport, scheduling, and orchestration; it is not a pure reasoning-time measurement.
- **Phase time:** elapsed time between worker-supplied phase boundaries. Repeated occurrences of a phase are combined. Reporting begins when handoff succeeds.
- **Tokens:** authoritative cumulative `thread/tokenUsage/updated.total` usage on each fresh single-turn thread. Cached input is a subset of input; reasoning output is a subset of output.

```text
uncached input = input tokens − cached input tokens
total excluding cached input = uncached input + output
total including cache = input tokens + output
```

PASS required a completed turn, successful independently verified handoff, explicit SUCCESS, recorded usage, no model reroute or unexpected tool request, and an exact match between reported products/quantities/prices and the observed cart. The controller checked the full cart page, exactly three distinct in-stock products, one unit each, and visible names/prices. Passed carts were checked again after all workers finished.

**PASS measures cart completion and handoff. It does not prove personal fit, a red color match, a useful mug substitution, or suitability for every winter climate.** The semantic quality of the choices is reviewed separately below.

## 4. Latest-run outcome and timing

| Agent | Result | Turn wall s | Total incl. setup s | Verified handoff s | After handoff/reporting s | Browser tools s | Outside tools s |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WooCommerce 1 | PASS | 307.845 | 310.574 | 239.125 | 68.721 | 13.450 | 294.395 |
| WooCommerce 2 | TIMEOUT | 600.128 | 602.053 | — | — | 12.877 | 587.251 |
| PrestaShop 1 | PASS | 349.725 | 352.032 | 273.205 | 76.520 | 23.565 | 326.159 |
| PrestaShop 2 | PASS | 392.240 | 394.165 | 294.915 | 97.325 | 33.392 | 358.849 |
| Magento 1 | PASS | 283.853 | 286.556 | 205.754 | 78.099 | 14.216 | 269.637 |
| Magento 2 | TIMEOUT | 600.129 | 602.054 | — | — | 2.641 | 597.488 |

| Aggregate metric | Value |
| --- | --- |
| Verified completions | 4 / 6 (66.67%) |
| Timeouts | 2 / 6 (33.33%) |
| Whole-run wall time | 603.218 s (10 min 3.218 s) |
| Sum of worker turn wall times | 2533.920 s |
| Sum of browser-tool times | 100.141 s |
| Sum of outside-tool times | 2433.779 s |
| Browser-tool share of summed worker wall time | 3.95% |
| Successful workers, mean turn wall time | 333.416 s |

Concurrent worker durations should not be added to estimate elapsed run time. The summed figures describe worker effort across the cohort. Millisecond rounding can make component sums differ from a displayed total by 0.001 seconds. The timeout measurements slightly exceed 600 seconds because interruption and capture take time. No original final self-report was produced by either timed-out worker.

### Token accounting

| Agent | Input incl. cache | Cached input | Uncached input | Output incl. reasoning | Reasoning subset | Total excl. cache | Total incl. cache |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WooCommerce 1 | 1,218,708 | 1,112,576 | 106,132 | 9,886 | 5,852 | 116,018 | 1,228,594 |
| WooCommerce 2 | 734,315 | 634,112 | 100,203 | 7,347 | 5,344 | 107,550 | 741,662 |
| PrestaShop 1 | 2,165,596 | 2,012,672 | 152,924 | 14,375 | 9,831 | 167,299 | 2,179,971 |
| PrestaShop 2 | 2,607,959 | 2,459,136 | 148,823 | 13,392 | 8,495 | 162,215 | 2,621,351 |
| Magento 1 | 1,168,538 | 1,072,896 | 95,642 | 10,015 | 5,730 | 105,657 | 1,178,553 |
| Magento 2 | 655,618 | 575,232 | 80,386 | 5,812 | 3,986 | 86,198 | 661,430 |
| **Total** | 8,550,734 | 7,866,624 | 684,110 | 60,827 | 39,238 | 744,937 | 8,611,561 |

Cache-write input tokens were **0 for every worker**. Output without the reasoning subset was **21,589 tokens**; this is a derived subset, not an additional usage charge. Cached tokens account for 91.35% of the displayed total including cache. Token totals are usage counts, not a dollar-cost estimate.

### Page interactions and all tool calls

| Agent | Page interactions | Successful | Failed | Snapshot | Click | Fill | Press | Phase | Handoff | All calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WooCommerce 1 | 30 | 27 | 3 | 4 | 22 | 2 | 2 | 4 | 1 | 35 |
| WooCommerce 2 | 26 | 24 | 2 | 1 | 15 | 5 | 5 | 2 | 0 | 28 |
| PrestaShop 1 | 38 | 34 | 4 | 7 | 23 | 4 | 4 | 4 | 1 | 43 |
| PrestaShop 2 | 42 | 37 | 5 | 8 | 26 | 4 | 4 | 4 | 1 | 47 |
| Magento 1 | 31 | 29 | 2 | 9 | 18 | 2 | 2 | 5 | 1 | 37 |
| Magento 2 | 23 | 22 | 1 | 6 | 13 | 2 | 2 | 4 | 0 | 27 |
| **Total** | 190 | 173 | 17 | 35 | 117 | 19 | 19 | 23 | 4 | 217 |

The interaction failure rate was **8.95%** (17/190). Every recorded failed call was a page interaction; all 23 phase calls and all four handoff calls succeeded. No isolation-denial error was recorded in the latest audit. The four completed results recorded zero model reroutes and zero unexpected requests; the timeout result objects do not retain those fields, so absence of a timeout-field value is not reported as a verified zero.

### Results by shop

| Shop | Passed | Interactions | Failures | Tokens excl. cache | Cached input | Tokens incl. cache | Summed worker s | Summed browser-tool s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WooCommerce | 1/2 | 56 | 5 | 223,568 | 1,746,688 | 1,970,256 | 907.973 | 26.327 |
| PrestaShop | 2/2 | 80 | 9 | 329,514 | 4,471,808 | 4,801,322 | 741.965 | 56.957 |
| Magento | 1/2 | 54 | 3 | 191,855 | 1,648,128 | 1,839,983 | 883.982 | 16.857 |

## 5. Products selected and shopping quality

| Agent | Items, one each | Merchandise subtotal | Shipping / displayed total | Evidence status |
| --- | --- | --- | --- | --- |
| WooCommerce 1 | Canyon V-Neck Tee $20.80; Foundry Leather Belt $39.00; Ridge Ribbed Beanie $17.60 | $77.40 | $5.00 / $82.40 | Full cart verified and handed over |
| WooCommerce 2 | No recorded additions | Not established | Not established | Timed out during comparison; final screenshot showed empty cart badge |
| PrestaShop 1 | Canyon V-Neck Tee $20.80; Ridge Ribbed Beanie $17.60; Trail Pocket Hoodie $57.60 | $96.00 | $7.00 / $103.00 | Full cart verified and handed over |
| PrestaShop 2 | Harbor Everyday Tee $24.00; Ridge Ribbed Beanie $17.60; Trail Pocket Hoodie $57.60 | $99.20 | $7.00 / $106.20 | Full cart verified and handed over |
| Magento 1 | Harbor Everyday Tee $24.00; Trail Pocket Hoodie $57.60; Foundry Leather Belt $39.00 | $120.60 | Shipping/tax not estimated | Full cart verified and handed over |
| Magento 2 | Successful add calls for Canyon V-Neck Tee $20.80; Ridge Ribbed Beanie $17.60; Compass Everyday Cap $27.00 | $65.40 arithmetic sum only | Not established | Full cart and quantities not independently verified; no handoff |

The four verified carts contained **12 item units** with a combined merchandise subtotal of **$393.20**. They were independent test carts rather than purchases. Magento 2 produced three successful add-call records and a final cart badge showing three items, but the $65.40 sum is derived from the catalog prices and does not constitute a verified full-cart total. No order was placed by the recorded workflow.

Controller catalog review, not information supplied to workers, found Canyon V-Neck Tee to be **Coral** and Harbor Everyday Tee to be **Heather gray**. WooCommerce 1 and PrestaShop 1 therefore selected a red-leaning tee; PrestaShop 2 and Magento 1 selected gray tees. All four reports disclosed color uncertainty. Personal fit was established for **0/4 completed workers**, because no measurements were supplied and the visible pages did not expose useful size controls.

No agent obtained a mug. The available collection contained clothing and accessories, and the completed agents explicitly disclosed substitutions: a belt on WooCommerce 1 and Magento 1, a beanie on both PrestaShop runs. These items do not perform a mug’s function. The beanie is related to cold-weather use; the belt is only a general accessory substitution.

Observed sale prices were Canyon V-Neck Tee **$26.00 → $20.80** (saving $5.20), Ridge Ribbed Beanie **$22.00 → $17.60** (saving $4.40), and Trail Pocket Hoodie **$72.00 → $57.60** (saving $14.40): each was a 20% reduction. Descriptions supported “warm rib-knit beanie” and “fleece hoodie,” but did not establish warmth ratings or suitability for a particular winter.

## 6. What consumed time and what was difficult

Comparison was the largest phase for five of the six workers. WooCommerce 2 spent **517.752 seconds** in comparison and never reached cart population. Magento 2 spent **257.312 seconds** comparing and entered verification only at **594.860 seconds**, leaving approximately five seconds before timeout. Magento 1 spent more time on its final report (**78.099 seconds**) than on comparison (**73.823 seconds**).

For successful workers, final reporting after handoff consumed **68.721–97.325 seconds**. The report request therefore materially affected total completion time. Browser execution represented only **3.95%** of summed worker wall time. Slow locator failures explain much of measured browser-tool time, but the remaining elapsed time cannot be attributed solely to model reasoning.

| Phase | Summed wall s | Browser tools s | Outside tools s | All calls | Failures |
| --- | --- | --- | --- | --- | --- |
| orientation | 95.805 | 0.232 | 95.574 | 12 | 0 |
| discovery | 389.261 | 33.861 | 355.398 | 39 | 4 |
| comparison | 1256.460 | 11.307 | 1245.154 | 93 | 8 |
| cart | 366.263 | 33.122 | 333.139 | 57 | 3 |
| verification | 105.467 | 21.616 | 83.850 | 16 | 2 |
| reporting | 320.665 | 0.000 | 320.664 | 0 | 0 |

Recurring difficulties:

- **Color and size uncertainty:** the DOM interface did not expose explicit color/size evidence. Some workers compared additional pages or searched repeatedly rather than resolving the request quickly.
- **Missing drinkware:** mug searches on WooCommerce and Magento returned no results. PrestaShop searches returned unrelated clothing, requiring category checks instead of trusting search matches.
- **Duplicate accessible names:** category/product links often appeared more than once, producing strict-locator failures. Indexed retries resolved these cases.
- **WooCommerce search obstruction:** the sticky header intercepted the Search button; pressing Enter in the search field allowed the search.
- **PrestaShop dialogs:** transient add-to-cart dialogs disappeared or blocked the cart link, causing repeated snapshots and timeout retries.
- **Magento roles and cart flow:** Tees was exposed as a menu item rather than the attempted link role, and the header cart opened a mini-cart that required “View and Edit Cart” to reach the full cart.
- **Tool argument misuse:** WooCommerce 1 supplied a non-string product locator name, producing a selector parse error, then recovered with an exact name.

The remainder of this section preserves each successful worker’s own evidence and explanation, alongside controller measurements. For timeout cases it uses controller diagnostics and explicitly avoids inventing an original self-report.

### WooCommerce 1

**Outcome:** PASS — completed, verified, and handed over.

**Final page:** `http://localhost:8091/cart/`.

**Measured:** 307.845 s turn wall time; 310.574 s including setup; 13.450 s in browser tools; 116,018 tokens excluding cached input; 30 page interactions, 3 failed. Largest phase: **comparison (142.311 s)**.

| Phase | Wall s | Browser tools s | Outside tools s | All calls | Failures |
| --- | --- | --- | --- | --- | --- |
| orientation | 10.713 | 0.039 | 10.674 | 2 | 0 |
| discovery | 32.187 | 10.145 | 22.042 | 4 | 1 |
| comparison | 142.311 | 2.109 | 140.202 | 18 | 2 |
| cart | 38.301 | 0.558 | 37.742 | 8 | 0 |
| verification | 15.614 | 0.599 | 15.014 | 3 | 0 |
| reporting | 68.721 | 0.000 | 68.720 | 0 | 0 |

**Recorded search inputs, in order:** `mug`, `red`.

**Agent summary:** Added one each of Ridge Ribbed Beanie, Canyon V-Neck Tee, and Foundry Leather Belt. The full cart is open; no order was placed. Merchandise subtotal is $77.40; estimated total including the displayed $5.00 standard shipping is $82.40.

| Product | Quantity | Unit price | Requested need | Why chosen / evidence | Limitations |
| --- | --- | --- | --- | --- | --- |
| Canyon V-Neck Tee | 1 | $20.80 | Red-ish T-shirt | A lightweight V-neck described as suitable for layering, and it is on sale. “Canyon” was the closest promising name among the tees, but the storefront does not confirm that it is red-toned. Evidence: Product page lists $20.80 (was $26.00), says “A lightweight V-neck for warm days and easy layering,” and showed 21 in stock. | No color or size options/details appeared on the product page. The red search did not establish this tee's color, so treat it as a tentative pick and check the product image before relying on it being red-ish. Personal fit cannot be assessed. |
| Foundry Leather Belt | 1 | $39.00 | Mug for coffee — substituted because drinkware was not found | The shop search for mugs returned no matching products, and the Accessories category contained belts and sunglasses rather than drinkware. I chose this listed everyday accessory as a general-use alternative, not as a functional mug replacement. Evidence: Accessories category listed Foundry Leather Belt at $39.00. Its product page described “A smooth leather belt with a simple metal buckle” and showed 87 in stock. | This is not a mug and does not hold coffee. The page did not provide belt sizing details, so fit is unknown. |
| Ridge Ribbed Beanie | 1 | $17.60 | Good deal on something warm for winter | The clearest match for warmth at a sale price: it is explicitly described as a warm rib-knit beanie with a folded cuff, discounted from $22.00 to $17.60. Evidence: Product page lists $17.60 (was $22.00), describes “A warm rib-knit beanie with a folded cuff,” and showed 69 in stock. The cart displayed savings of $4.40. | No size or fit information appeared on the page. |

**Substitutions reported:**

- No mug/drinkware was found. Foundry Leather Belt is the everyday-accessory alternative placed in the cart, but it does not replace a mug's coffee function.
- Canyon V-Neck Tee is a tentative red-ish pick only; the storefront text does not confirm its color.

**Fit and unknowns:** The tee page had no size selector or sizing chart, and the user provided no fit preference or measurements, so I cannot claim a particular size or fit. The selected tee's color is not specified in its product text; its name alone is not reliable color evidence. The belt page likewise lacked sizing information. No order was placed.

**Agent’s explanation of time spent:**

| Phase | What the agent did | Why it took time | Measurement cited by agent |
| --- | --- | --- | --- |
| Discovery | Surveyed the 30-item collection and searched for a mug; the search returned no matching products. | The storefront search required using Enter after the visible Search button could not be clicked. | Controller measured 32.187 seconds for discovery, 4 calls, 1 failure. These are elapsed phase measurements, not an estimate. |
| Comparison | Inspected tee pages and the tees, accessories, and headwear categories, then checked the selected belt and beanie product details, availability, and sale prices. | This was the longest phase; I compared product evidence while checking whether color and sizing could actually be established. | Controller measured 142.311 seconds and 18 calls, the largest phase. Browser tool execution accounted for 2.109 seconds; the remaining measured elapsed time includes model generation, transport, scheduling, and orchestration, so it is not a pure reasoning-time measurement. |
| Cart | Added one Ridge Ribbed Beanie, one Canyon V-Neck Tee, and one Foundry Leather Belt. | The category add-to-cart interaction was asynchronous, so I took another snapshot to confirm the tee had been added before proceeding. | Controller measured 38.301 seconds, 8 calls, 0 failures. |
| Verification | Opened the full cart and checked all three quantities, line prices, subtotal, and displayed shipping/estimated total; then handed the page over. | The cart initially showed loading rows; a further snapshot was needed for the settled cart contents. | Controller measured 15.614 seconds, 3 calls, 0 failures. Handoff verified the cart page and three distinct one-unit lines. |
| Overall | Completed storefront exploration and left the full cart open without checking out. | Comparison dominated the measured elapsed time; most controller-measured elapsed time was outside browser tool execution. | Controller handoff receipt: 239.125 seconds wall time, 13.45 seconds browser tool time, 225.675 seconds outside browser tools, 35 calls, and 3 failed calls. Outside-tool time includes generation, transport, scheduling, and orchestration; it should not be interpreted as reasoning time. |

The self-report’s timing receipt stops at handoff; the controller’s table above includes subsequent final-report generation. The controller table is authoritative when discussing the full turn.

**Difficulties reported:**

| Issue | Impact | Resolution |
| --- | --- | --- |
| Clicking the Search button timed out because the sticky header intercepted pointer events. | The initial mug search did not run through the button. | Pressed Enter in the search field instead; the resulting mug search showed no matching products. |
| A regex-style product name locator was rejected, and a later exact “Tees” link click found multiple matching links. | These attempts delayed navigation during comparison. | Used the exact accessible product name, then selected the first Tees link after checking the snapshot. Both failures are included in the controller's three failed calls. |
| The storefront did not provide explicit color or size information for the selected tee. | I could not establish that the Canyon V-Neck Tee is actually red-ish or determine a personal size. | Selected it only as a tentative candidate, reported the color and fit uncertainty clearly, and did not claim a confirmed match. |

**Search and product evidence reported:**

- The shop home page showed 30 essentials and categories including Tees, Hoodies, Shirts, Headwear, and Accessories.
- Search for “mug” returned “No products were found matching your selection.” Accessories showed six items—belts and sunglasses—with no drinkware listed.
- The Tees category showed six tees. Canyon V-Neck Tee was on sale at $20.80 from $26.00; its page described a lightweight V-neck for warm days and layering and showed 21 in stock.
- A search for “red” returned Studio Everyday Polo, Weekend Jersey Polo, and Tide V-Neck Tee, but did not confirm a red tee. Tide's product image URL included “blue,” so that search was not reliable color evidence.
- Ridge Ribbed Beanie's page stated $17.60 from $22.00 and described a warm rib-knit beanie with a folded cuff; 69 were shown in stock.
- Foundry Leather Belt's page listed $39.00 and described smooth leather with a simple metal buckle; 87 were shown in stock.

**Cart summary reported:** Full cart left open at /cart/: Ridge Ribbed Beanie ×1 ($17.60), Canyon V-Neck Tee ×1 ($20.80), Foundry Leather Belt ×1 ($39.00). Merchandise subtotal: $77.40. Displayed standard shipping: $5.00; estimated total: $82.40. No purchase made.

| Independently verified product | SKU | Qty | Unit price | Discounted | In stock | Price visible |
| --- | --- | --- | --- | --- | --- | --- |
| Ridge Ribbed Beanie | CT-019 | 1 | $17.60 | True | True | True |
| Canyon V-Neck Tee | CT-003 | 1 | $20.80 | True | True | True |
| Foundry Leather Belt | CT-025 | 1 | $39.00 | False | True | True |

Cart/report match: **True**. Verification at completion: **True**. End-of-run recheck: **True**.

**Recorded failed interactions:**

| Action | Role / name | Duration s | Error summary |
| --- | --- | --- | --- |
| click | button / Search | 10.002 | locator.click: Timeout 10000ms exceeded. |
| click | link / {} | 0.005 | locator.click: InvalidSelectorError: Error while parsing selector `link[name=[object Object]]` - unexpected symbol "" at position 10 during parsing attribute value |
| click | link / Tees | 0.017 | locator.click: Error: strict mode violation: getByRole('link', { name: 'Tees', exact: true }) resolved to 3 elements: |

**Artifacts:** [original worker report (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/woocommerce-session-1-agent-1.agent-report.md`); exact assigned prompt (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/woocommerce-session-1-agent-1.prompt.txt`); saved storage state (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/woocommerce-session-1-agent-1.storage.json`); final screenshot (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/woocommerce-session-1-agent-1.png`).

WooCommerce 1: captured final browser page (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/woocommerce-session-1-agent-1.png`)

### WooCommerce 2

**Outcome:** FAIL — Agent timeout.

**Final page:** `http://localhost:8091/product-category/accessories/`.

**Measured:** 600.128 s turn wall time; 602.053 s including setup; 12.877 s in browser tools; 107,550 tokens excluding cached input; 26 page interactions, 2 failed. Largest phase: **comparison (517.752 s)**.

| Phase | Wall s | Browser tools s | Outside tools s | All calls | Failures |
| --- | --- | --- | --- | --- | --- |
| orientation | 10.701 | 0.038 | 10.663 | 2 | 0 |
| discovery | 71.674 | 10.141 | 61.533 | 4 | 1 |
| comparison | 517.752 | 2.697 | 515.055 | 22 | 1 |

**Recorded search inputs, in order:** `mug`, `red`, `red tee`, `maroon`, `red`.

**Controller-reconstructed diagnostic:** The original worker was interrupted by the 600-second timeout before a final self-report. This diagnostic uses only its own recorded phase notes and browser call trace. It does not infer private reasoning.

The audit recorded no successful Add to Cart call. The worker remained in comparison while searching for red/color evidence and inspecting tees and accessories. Its final page was the Accessories category; the final screenshot showed an empty cart badge. No full-cart verification or handoff occurred. The long comparison interval does not reveal private reasoning and cannot establish why the worker failed to decide.

**Recorded phase notes:**

| Elapsed s | Phase | Worker note |
| --- | --- | --- |
| 10.701 | discovery | Surveyed 30-item Common Thread storefront; checking requested mug, red tee, and winter warmth options. |
| 82.375 | comparison | Mug search returned no matching products; comparing tee colors/sizes and discounted winter options. |

**Recorded failed interactions:**

| Action | Role / name | Duration s | Error summary |
| --- | --- | --- | --- |
| click | button / Search | 10.005 | locator.click: Timeout 10000ms exceeded. |
| click | link / Tees | 0.023 | locator.click: Error: strict mode violation: getByRole('link', { name: 'Tees', exact: true }) resolved to 3 elements: |

**Artifacts:** controller diagnostic (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/woocommerce-session-1-agent-2.diagnostic.md`); exact assigned prompt (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/woocommerce-session-1-agent-2.prompt.txt`); saved storage state (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/woocommerce-session-1-agent-2.storage.json`); final screenshot (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/woocommerce-session-1-agent-2.png`).

WooCommerce 2: captured final browser page (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/woocommerce-session-1-agent-2.png`)

### PrestaShop 1

**Outcome:** PASS — completed, verified, and handed over.

**Final page:** `http://localhost:8092/cart?action=show`.

**Measured:** 349.725 s turn wall time; 352.032 s including setup; 23.565 s in browser tools; 167,299 tokens excluding cached input; 38 page interactions, 4 failed. Largest phase: **comparison (140.995 s)**.

| Phase | Wall s | Browser tools s | Outside tools s | All calls | Failures |
| --- | --- | --- | --- | --- | --- |
| orientation | 8.817 | 0.040 | 8.777 | 2 | 0 |
| discovery | 37.560 | 0.850 | 36.709 | 7 | 0 |
| comparison | 140.995 | 1.652 | 139.343 | 15 | 2 |
| cart | 74.566 | 20.767 | 53.799 | 16 | 2 |
| verification | 11.267 | 0.256 | 11.011 | 3 | 0 |
| reporting | 76.520 | 0.000 | 76.520 | 0 | 0 |

**Recorded search inputs, in order:** `mug`, `red`, `coffee`, `rust`.

**Agent summary:** The cart page is open with three distinct items, one each. Merchandise subtotal is $96.00; with $7.00 shipping, the displayed total is $103.00. No order was placed.

| Product | Quantity | Unit price | Requested need | Why chosen / evidence | Limitations |
| --- | --- | --- | --- | --- | --- |
| Canyon V-Neck Tee | 1 | $20.80 | Red-ish T-shirt | It is a tee currently discounted from $26.00, and “Canyon” was my cautious warm/earthy-name guess for your red-ish preference. That color inference is not confirmed by the storefront. Evidence: The product page lists $26.00, a $5.20 discount, and a current price of $20.80. Its copy says: “A lightweight V-neck for warm days and easy layering.” | The page did not state a color or show a size selector, measurements, or fit details. I cannot confirm it is red-ish or that it will fit you. |
| Ridge Ribbed Beanie | 1 | $17.60 | Mug for coffee; substituted because no mug or drinkware was found | The visible shop categories offered clothing and accessories, not drinkware. I chose this discounted, practical wearable accessory as an in-store alternative for a cold coffee outing, while noting that it is not a coffee vessel. Evidence: The product page lists $22.00, a $4.40 discount, and a current price of $17.60. Its copy says: “A warm rib-knit beanie with a folded cuff.” A search for “coffee” surfaced this beanie, not drinkware. | This does not hold coffee and is only a limited substitute for a mug. The page did not show sizing or fit information. |
| Trail Pocket Hoodie | 1 | $57.60 | A good deal on something warm for winter | It is a fleece hoodie with a generous front pocket, directly relevant to warmth, and is discounted by $14.40 from $72.00. Evidence: The product page lists $72.00, a $14.40 discount, and a current price of $57.60. Its copy says: “A fleece hoodie with a generous front pocket.” | No size selector, measurements, or fit information was visible. The page does not establish how warm it is for any particular winter climate. |

**Substitutions reported:**

- No mug or drinkware appeared in the visible storefront categories. Searching “mug” returned Tide V-Neck Tee, not a mug; the Accessories category listed belts and sunglasses. I substituted Ridge Ribbed Beanie as a useful wearable accessory for a cold coffee outing, but it cannot serve as a cup.

**Fit and unknowns:** No personal measurements or style preferences were supplied. The product pages showed no visible size or color variant controls, so no size was selected. In particular, the storefront did not confirm the Canyon V-Neck Tee's color; the “red” search returned six tees without explicit color details, so I treated it as inconclusive. The tee's fit and the clothing items' suitability for you remain unknown.

**Agent’s explanation of time spent:**

| Phase | What the agent did | Why it took time | Measurement cited by agent |
| --- | --- | --- | --- |
| Orientation | Read the initial storefront snapshot and marked the discovery phase. | Initial inspection of the shop and its visible range. | Controller-measured phase duration: 8.817 seconds; 2 calls, 0 failed. |
| Discovery | Opened the Tees and Accessories categories and searched for “mug” and “red.” | Checked whether the requested types were present and what the storefront search returned. | Controller-measured phase duration: 37.560 seconds; 7 calls, 0 failed. |
| Comparison | Inspected tee, hoodie, and beanie product pages; checked prices, descriptions, sale amounts, and searches for “coffee” and “rust.” | Color and fit details were not explicit, and search results did not reliably establish color or drinkware availability; I checked product copy and category listings to avoid inventing attributes. | Controller-measured phase duration: 140.995 seconds; 15 calls, 2 failed. This was the largest measured phase. Browser-tool execution was 1.652 seconds; the remaining 139.343 seconds was outside-browser time, which includes generation, transport, scheduling, and orchestration—not a pure reasoning-time measurement. |
| Cart | Added one Canyon V-Neck Tee, one Ridge Ribbed Beanie, and one Trail Pocket Hoodie. | The add-to-cart confirmations and cart count updated asynchronously; I used repeated snapshots to verify the additions and navigate past transient dialogs. | Controller-measured phase duration: 74.566 seconds; 16 calls, 2 failed. Browser-tool execution was 20.767 seconds; outside-browser time was 53.799 seconds. |
| Verification | Opened the cart summary, checked all three quantities and prices, then handed off the page. | Confirmed the final cart contents and displayed total without proceeding to an order. | Controller-measured phase duration: 11.267 seconds; 3 calls, 0 failed. |

The self-report’s timing receipt stops at handoff; the controller’s table above includes subsequent final-report generation. The controller table is authoritative when discussing the full turn.

**Difficulties reported:**

| Issue | Impact | Resolution |
| --- | --- | --- |
| The shop had no visible mug or drinkware category; searches were not conclusive product-type evidence. | A true coffee mug could not be selected. | Checked the visible categories and the Accessories listing; documented that “mug” returned a V-neck tee and used the discounted Ridge Ribbed Beanie as a limited, clearly disclosed alternative. |
| The tee's color and clothing sizes or fits were not stated in the visible product details. | I could not verify the red-ish preference or claim that any clothing item would fit. | Selected Canyon V-Neck Tee as a tentative name-based guess, disclosed that color is unconfirmed, and made no size or fit claim. Search “red” returned six tees without explicit color information; “rust” returned Dusk Long-Sleeve Tee but its visible copy also did not establish color. |
| Some product links had duplicate accessible names, and two dialog actions timed out after the cart confirmation dialog had disappeared. | Several clicks failed and cost time; no cart item was lost. | Used the inspected snapshot to select the first matching link where duplicates existed. After the dialog timeouts, took another snapshot and confirmed the dialog was gone and the cart count was correct. |

**Search and product evidence reported:**

- The homepage exposed Tees, Hoodies, Shirts, Headwear, and Accessories; no drinkware category was visible.
- The Tees category listed six products. Canyon V-Neck Tee was $26.00, reduced to $20.80.
- Searching “mug” returned Tide V-Neck Tee, not drinkware.
- The Accessories category listed three belts and three sunglasses, with no mug or drinkware.
- Searching “coffee” returned Ridge Ribbed Beanie; its detail page described a warm rib-knit beanie with a folded cuff, not a coffee item.
- The Hoodies category listed Trail Pocket Hoodie at $72.00, reduced to $57.60; its product page described a fleece hoodie with a generous front pocket.
- Searching “red” returned six tees but did not expose explicit color or variant details. Searching “rust” returned Dusk Long-Sleeve Tee, whose visible description did not confirm its color.

**Cart summary reported:** Verified cart page open: Canyon V-Neck Tee — 1 × $20.80; Ridge Ribbed Beanie — 1 × $17.60; Trail Pocket Hoodie — 1 × $57.60. Merchandise subtotal $96.00, shipping $7.00, displayed total $103.00. No order placed.

| Independently verified product | SKU | Qty | Unit price | Discounted | In stock | Price visible |
| --- | --- | --- | --- | --- | --- | --- |
| Canyon V-Neck Tee | CT-003 | 1 | $20.80 | True | True | True |
| Ridge Ribbed Beanie | CT-019 | 1 | $17.60 | True | True | True |
| Trail Pocket Hoodie | CT-011 | 1 | $57.60 | True | True | True |

Cart/report match: **True**. Verification at completion: **True**. End-of-run recheck: **True**.

**Recorded failed interactions:**

| Action | Role / name | Duration s | Error summary |
| --- | --- | --- | --- |
| click | link / Tees | 0.030 | locator.click: Error: strict mode violation: getByRole('link', { name: 'Tees', exact: true }) resolved to 2 elements: |
| click | link / Canyon V-Neck Tee | 0.012 | locator.click: Error: strict mode violation: getByRole('link', { name: 'Canyon V-Neck Tee', exact: true }) resolved to 2 elements: |
| click | button / Close | 10.002 | locator.click: Timeout 10000ms exceeded. |
| click | button / Continue shopping | 10.007 | locator.click: Timeout 10000ms exceeded. |

**Artifacts:** original worker report (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/prestashop-session-1-agent-1.agent-report.md`); exact assigned prompt (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/prestashop-session-1-agent-1.prompt.txt`); saved storage state (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/prestashop-session-1-agent-1.storage.json`); final screenshot (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/prestashop-session-1-agent-1.png`).

PrestaShop 1: captured final browser page (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/prestashop-session-1-agent-1.png`)

### PrestaShop 2

**Outcome:** PASS — completed, verified, and handed over.

**Final page:** `http://localhost:8092/cart?action=show`.

**Measured:** 392.240 s turn wall time; 394.165 s including setup; 33.392 s in browser tools; 162,215 tokens excluding cached input; 42 page interactions, 5 failed. Largest phase: **comparison (124.267 s)**.

| Phase | Wall s | Browser tools s | Outside tools s | All calls | Failures |
| --- | --- | --- | --- | --- | --- |
| orientation | 10.351 | 0.035 | 10.317 | 2 | 0 |
| discovery | 35.462 | 0.626 | 34.835 | 8 | 0 |
| comparison | 124.267 | 1.802 | 122.466 | 17 | 2 |
| cart | 70.403 | 10.603 | 59.799 | 13 | 1 |
| verification | 54.432 | 20.325 | 34.107 | 7 | 2 |
| reporting | 97.325 | 0.000 | 97.325 | 0 | 0 |

**Recorded search inputs, in order:** `mug`, `coffee`, `red`, `tumbler`.

**Agent summary:** Added one unit each of Harbor Everyday Tee, Ridge Ribbed Beanie, and Trail Pocket Hoodie. The full cart page is open; no order was placed. The mug is unavailable in the visible storefront, and the tee’s exact color and size could not be confirmed.

| Product | Quantity | Unit price | Requested need | Why chosen / evidence | Limitations |
| --- | --- | --- | --- | --- | --- |
| Harbor Everyday Tee | 1 | $24.00 | Red-ish T-shirt | A basic tee with a relaxed everyday fit is a reasonable starting point when your fit preferences are unknown. It appeared in the search results for “red,” but I could not verify that this particular tee is red or red-ish. Evidence: The Tees category listed six products, including Harbor Everyday Tee. Its product page describes “soft cotton jersey with a relaxed everyday fit” and lists it at $24.00; it is part of the Common Thread collection. | The page did not show a color selector or identify a shade; the “red” search returned all six tees, so it does not establish Harbor’s color. No size selector or measurements were shown, and I can’t establish whether its fit will suit you personally. |
| Ridge Ribbed Beanie | 1 | $17.60 | Coffee mug (substitute; no mug found) | The visible storefront did not offer drinkware. This discounted, warm beanie is a practical small accessory for cold-weather coffee outings, but it is not a mug and cannot hold coffee. Evidence: The Headwear category lists Ridge Ribbed Beanie at $22.00, reduced to $17.60 (saving $4.40). Its product page describes it as “a warm rib-knit beanie with a folded cuff.” Searches for “mug” and “coffee” returned unrelated apparel/headwear rather than drinkware. | This is an honest substitute, not a coffee vessel. No size or material beyond the rib-knit description was shown. |
| Trail Pocket Hoodie | 1 | $57.60 | Good deal on something to keep warm in winter | The product page identifies it as a fleece hoodie, and it has the largest visible discount among these selections: $14.40 off the listed $72.00 price. Evidence: The Hoodies category and product page show $72.00 reduced to $57.60, saving $14.40. The product description says “A fleece hoodie with a generous front pocket.” | No size selector, garment measurements, or further warmth rating was shown; a hoodie may not be sufficient by itself for severe winter weather. |

**Substitutions reported:**

- No mug or drinkware appeared in the visible storefront. I substituted Ridge Ribbed Beanie as a useful cold-weather accessory; it is not a mug.

**Fit and unknowns:** The tee’s listing describes a relaxed everyday fit and soft cotton jersey, but the product page did not expose a size selector, sizing chart, or color choice. Although Harbor Everyday Tee appeared among six results for “red,” that search did not establish its color. I therefore cannot promise a red-ish shade or a personal fit. The products are listed as part of the Common Thread collection; the storefront did not provide more specific brand information on these pages.

**Agent’s explanation of time spent:**

| Phase | What the agent did | Why it took time | Measurement cited by agent |
| --- | --- | --- | --- |
| orientation | Read the initial storefront snapshot and noted the visible product categories and featured items. | This was the initial survey of what the shop carried. | Controller receipt: 10.351 seconds wall time, 0.035 seconds browser-tool time, and 10.317 seconds outside browser tools. |
| discovery | Searched for mug, coffee, and red, then checked the Tees and Accessories categories. | Search results for drinkware terms were misleading, so I used category listings to check what was actually offered. | Controller receipt: 35.462 seconds wall time, 0.626 seconds browser-tool time, and 34.835 seconds outside browser tools. |
| comparison | Inspected tee product pages and compared hoodie and headwear listings and product details before choosing the three items. | The visible pages did not resolve the tee’s color or sizing, and the drinkware searches did not yield a mug; I checked the category listings and descriptions to make defensible choices. | Controller receipt: 124.267 seconds wall time, 1.802 seconds browser-tool time, and 122.466 seconds outside browser tools. This was the largest phase by wall time; outside-browser time includes generation, transport, scheduling, and orchestration, not just reasoning. |
| cart | Added one tee, one beanie, and one discounted hoodie, then checked the add-to-cart confirmations. | The add-to-cart confirmation dialogs had to be dismissed or allowed to clear before continuing between products. | Controller receipt: 70.403 seconds wall time, 10.603 seconds browser-tool time, and 59.799 seconds outside browser tools. |
| verification | Opened the full cart and checked that all three distinct products were present at quantity one with the expected prices and total. | The final add-to-cart dialog intercepted the cart-link click, so I waited for it to clear and retried from the product page. | Controller receipt: 54.432 seconds wall time, 20.325 seconds browser-tool time, and 34.107 seconds outside browser tools. Overall receipt: 294.915 seconds wall time, 33.392 seconds browser-tool time, 261.524 seconds outside browser tools, 47 tool calls, and 5 failed calls. |

The self-report’s timing receipt stops at handoff; the controller’s table above includes subsequent final-report generation. The controller table is authoritative when discussing the full turn.

**Difficulties reported:**

| Issue | Impact | Resolution |
| --- | --- | --- |
| Search results did not reliably match drinkware queries: “mug” returned Tide V-Neck Tee, “coffee” returned Ridge Ribbed Beanie, and “tumbler” returned Ember Pullover Hoodie. | Search alone could not identify an actual mug or reliably establish that drinkware was for sale. | Checked the visible categories and product titles instead. Accessories showed belts and sunglasses; Headwear showed caps and beanies. I used the beanie as an explicitly labeled alternative, not as a mug. |
| Some product/category names had duplicate accessible links, so clicks on Canyon V-Neck Tee and Tees initially failed with strict-mode violations. | The first clicks did not navigate to the intended product/category. | Retried using the first matching link after reviewing the snapshot. |
| Add-to-cart dialogs temporarily intercepted the cart link, and a repeated Continue shopping / Proceed to checkout interaction timed out after the dialog disappeared or blocked interaction. | The initial attempts did not open the cart and consumed extra verification time. | Closed or waited out the modal, then clicked the cart link successfully. The final cart remained open, and no checkout or order placement was performed. |
| The tee page did not show a shade choice or size selector. | I could not verify a red-ish color or choose a size based on your measurements. | Selected a relaxed-fit everyday tee as a reasonable general option and disclosed that its color and personal fit remain unconfirmed. |

**Search and product evidence reported:**

- The storefront showed Tees, Hoodies, Shirts, Headwear, and Accessories categories; no drinkware or home/kitchen category was visible.
- The Tees category listed six products, including Harbor Everyday Tee. A search for “red” returned those six tee products but did not identify Harbor’s color.
- A search for “mug” returned Tide V-Neck Tee, not a mug; “coffee” returned Ridge Ribbed Beanie; “tumbler” returned Ember Pullover Hoodie. These results were not evidence of drinkware.
- The Accessories category showed six products: belts and sunglasses. Headwear showed six products, including beanies and caps.
- The Hoodies category showed Trail Pocket Hoodie at $72.00 reduced to $57.60; its product page stated that it is a fleece hoodie with a generous front pocket.
- Final cart verification showed Harbor Everyday Tee $24.00, Ridge Ribbed Beanie $17.60, and Trail Pocket Hoodie $57.60, each quantity one. Merchandise subtotal was $99.20; shipping was $7.00; cart total was $106.20. The cart remained open without purchasing.

**Cart summary reported:** Full cart page open with Harbor Everyday Tee ×1 ($24.00), Ridge Ribbed Beanie ×1 ($17.60), and Trail Pocket Hoodie ×1 ($57.60). Merchandise subtotal: $99.20; shipping: $7.00; total shown: $106.20. No purchase made.

| Independently verified product | SKU | Qty | Unit price | Discounted | In stock | Price visible |
| --- | --- | --- | --- | --- | --- | --- |
| Harbor Everyday Tee | CT-001 | 1 | $24.00 | False | True | True |
| Ridge Ribbed Beanie | CT-019 | 1 | $17.60 | True | True | True |
| Trail Pocket Hoodie | CT-011 | 1 | $57.60 | True | True | True |

Cart/report match: **True**. Verification at completion: **True**. End-of-run recheck: **True**.

**Recorded failed interactions:**

| Action | Role / name | Duration s | Error summary |
| --- | --- | --- | --- |
| click | link / Canyon V-Neck Tee | 0.021 | locator.click: Error: strict mode violation: getByRole('link', { name: 'Canyon V-Neck Tee', exact: true }) resolved to 2 elements: |
| click | link / Tees | 0.027 | locator.click: Error: strict mode violation: getByRole('link', { name: 'Tees', exact: true }) resolved to 2 elements: |
| click | button / Continue shopping | 10.001 | locator.click: Timeout 10000ms exceeded. |
| click | link / Shopping cart link containing 3 product(s) | 10.007 | locator.click: Timeout 10000ms exceeded. |
| click | link /  Proceed to checkout | 10.008 | locator.click: Timeout 10000ms exceeded. |

**Artifacts:** original worker report (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/prestashop-session-1-agent-2.agent-report.md`); exact assigned prompt (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/prestashop-session-1-agent-2.prompt.txt`); saved storage state (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/prestashop-session-1-agent-2.storage.json`); final screenshot (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/prestashop-session-1-agent-2.png`).

PrestaShop 2: captured final browser page (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/prestashop-session-1-agent-2.png`)

### Magento 1

**Outcome:** PASS — completed, verified, and handed over.

**Final page:** `http://localhost:8093/checkout/cart/`.

**Measured:** 283.853 s turn wall time; 286.556 s including setup; 14.216 s in browser tools; 105,657 tokens excluding cached input; 31 page interactions, 2 failed. Largest phase: **reporting (78.099 s)**.

| Phase | Wall s | Browser tools s | Outside tools s | All calls | Failures |
| --- | --- | --- | --- | --- | --- |
| orientation | 10.370 | 0.047 | 10.323 | 2 | 0 |
| discovery | 50.240 | 11.484 | 38.756 | 8 | 1 |
| comparison | 73.823 | 1.559 | 72.264 | 10 | 1 |
| cart | 52.436 | 0.689 | 51.747 | 14 | 0 |
| verification | 18.885 | 0.436 | 18.449 | 3 | 0 |
| reporting | 78.099 | 0.000 | 78.099 | 0 | 0 |

**Recorded search inputs, in order:** `mug`, `red`.

**Agent summary:** Added one each of Harbor Everyday Tee, Trail Pocket Hoodie, and Foundry Leather Belt to the cart. The belt is a substitute because I couldn't find a mug. The full shopping cart is open; no purchase was made.

| Product | Quantity | Unit price | Requested need | Why chosen / evidence | Limitations |
| --- | --- | --- | --- | --- | --- |
| Harbor Everyday Tee | 1 | $24.00 | Red-ish T-shirt | A straightforward, in-stock everyday T-shirt; its described relaxed fit made it a reasonable starting pick without assuming your preferred fit. Evidence: The product page showed $24.00, In stock, and “Soft cotton jersey with a relaxed everyday fit.” The Tees category listed six items. | The page showed no color or size selector, and a storefront search for “red” returned no results. I cannot verify that this tee is red-ish or determine which size would suit you. |
| Trail Pocket Hoodie | 1 | $57.60 | A good deal on something warm for winter | A fleece hoodie is a plausible warm layer, and this one was on sale: $57.60 instead of $72.00, a $14.40 reduction. Evidence: The product page showed the special price of $57.60, regular price of $72.00, In stock, and described it as “A fleece hoodie with a generous front pocket.” | The page showed no size selector or warmth rating, so I can't assess fit or how warm it will be for your winter conditions. |
| Foundry Leather Belt | 1 | $39.00 | Coffee mug; substitute because no mug was found | The shop's Accessories category showed belts and sunglasses, but no mug. I chose an in-stock, practical accessory from the available range rather than suggesting an unavailable item. Evidence: The product page showed $39.00, In stock, and described it as “A smooth leather belt with a simple metal buckle.” | This is not a like-for-like coffee or drinkware substitute. The page showed no sizing information, so belt fit is unknown. |

**Substitutions reported:**

- No mug was found: the search for “mug” returned no results, and the Accessories category listed belts and sunglasses. Foundry Leather Belt is the available practical-accessory alternative, not a coffee-related replacement.

**Fit and unknowns:** The pages showed no size choices for the selected products, so I did not choose or infer sizes. Harbor Everyday Tee is described as having a relaxed everyday fit, but I cannot determine whether it will suit you personally. The tee's color was not stated in accessible product details, so its match to “red-ish” is unverified. No separate manufacturer brand attribute was shown; the storefront identifies the collection as Common Thread.

**Agent’s explanation of time spent:**

| Phase | What the agent did | Why it took time | Measurement cited by agent |
| --- | --- | --- | --- |
| orientation | Reviewed the storefront and its 30-item collection. | This established what types of products the shop carried before narrowing the search. | Controller-measured phase duration: 10.37 seconds. Controller notes phase elapsed time includes time outside browser calls. |
| discovery | Checked Accessories and searched for a mug, then opened Tees and Hoodies categories. | I needed to establish whether the requested mug was available and what clothing categories the shop offered. The first attempt to click Tees as a link timed out because it was exposed as a menu item instead. | Controller-measured phase duration: 50.24 seconds; one failed browser call. Handoff reports 11.484 seconds of browser-tool time and 38.756 seconds outside browser calls for this phase. |
| comparison | Inspected product details for the tee, hoodie, and belt, comparing their descriptions, stock status, and prices. | The color and size details were not exposed, so I checked product pages and searched for “red” rather than assume a color or fit. | Controller-measured phase duration: 73.823 seconds; one failed browser call. Handoff reports 1.559 seconds of browser-tool time and 72.264 seconds outside browser calls. The outside-call duration includes model generation, transport, scheduling, and orchestration, not just reasoning. |
| cart | Added one unit of each chosen product and waited for the add-to-cart confirmations. | Each product was added in turn, and the cart updated asynchronously, so I checked that each add completed before moving on. | Controller-measured phase duration: 52.436 seconds; 0 failed calls. Handoff reports 0.689 seconds of browser-tool time and 51.747 seconds outside browser calls. |
| verification | Opened the cart and checked the listed products, quantities, and prices. | The header cart opened a mini-cart first; I then used “View and Edit Cart” to reach the full cart page and verify its line items. | Controller-measured phase duration: 18.885 seconds; 0 failed calls. Handoff verified the cart page and three distinct items at quantity one each. |

The self-report’s timing receipt stops at handoff; the controller’s table above includes subsequent final-report generation. The controller table is authoritative when discussing the full turn.

**Difficulties reported:**

| Issue | Impact | Resolution |
| --- | --- | --- |
| The search for “mug” returned no results, and the Accessories category showed six items—belts and sunglasses, not drinkware. | I could not recommend or add a mug. | I selected an in-stock belt as a practical accessory alternative and have clearly identified that it is not a like-for-like substitute. |
| The search for “red” returned no results, and the tee page did not expose a color selector or stated color. | I could not confirm the selected T-shirt meets the red-ish preference. | I chose the in-stock Harbor Everyday Tee as the closest basic T-shirt option and disclosed that its color is unverified. |
| A click on “Tees” using the link role timed out; another click on Harbor Everyday Tee found two matching links and failed strict matching. | These attempts delayed navigation to the product details. | The page exposed Tees as a menu item, so I clicked that role instead. For the duplicate Harbor links, I used the first matching product link. |
| The header cart control opened a mini-cart rather than the full cart page. | The full cart was not initially open for final review. | I selected “View and Edit Cart” in the mini-cart to open the full Shopping Cart page. |

**Search and product evidence reported:**

- The storefront collection page described 30 everyday essentials and displayed Tees, Hoodies, Shirts, Headwear, and Accessories categories.
- The Accessories category showed six items: three belts and three sunglasses; it listed no mugs.
- The search results page for “mug” stated: “Your search returned no results.”
- The search results page for “red” stated: “Your search returned no results.”
- The Tees category listed six items. Harbor Everyday Tee was shown at $24.00; its product page said it was in stock and described soft cotton jersey with a relaxed everyday fit.
- The Hoodies category listed six items. Trail Pocket Hoodie was shown at $57.60 special price versus $72.00 regular price; its product page described a fleece hoodie with a generous front pocket and showed it in stock.
- Foundry Leather Belt's product page showed $39.00, in stock, with a smooth leather and simple metal buckle description.
- The final cart page listed all three products at quantity 1 each. The controller's handoff verification reported a merchandise subtotal of $120.60.

**Cart summary reported:** Full Shopping Cart page left open at /checkout/cart/. Foundry Leather Belt $39.00 × 1; Harbor Everyday Tee $24.00 × 1; Trail Pocket Hoodie $57.60 × 1. Merchandise subtotal: $120.60. Shipping and tax were not estimated. No order was placed.

| Independently verified product | SKU | Qty | Unit price | Discounted | In stock | Price visible |
| --- | --- | --- | --- | --- | --- | --- |
| Foundry Leather Belt | CT-025 | 1 | $39.00 | False | True | True |
| Harbor Everyday Tee | CT-001 | 1 | $24.00 | False | True | True |
| Trail Pocket Hoodie | CT-011 | 1 | $57.60 | True | True | True |

Cart/report match: **True**. Verification at completion: **True**. End-of-run recheck: **True**.

**Recorded failed interactions:**

| Action | Role / name | Duration s | Error summary |
| --- | --- | --- | --- |
| click | link / Tees | 10.006 | locator.click: Timeout 10000ms exceeded. |
| click | link / Harbor Everyday Tee | 0.015 | locator.click: Error: strict mode violation: getByRole('link', { name: 'Harbor Everyday Tee', exact: true }) resolved to 2 elements: |

**Artifacts:** original worker report (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/magento-session-1-agent-1.agent-report.md`); exact assigned prompt (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/magento-session-1-agent-1.prompt.txt`); saved storage state (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/magento-session-1-agent-1.storage.json`); final screenshot (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/magento-session-1-agent-1.png`).

Magento 1: captured final browser page (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/magento-session-1-agent-1.png`)

### Magento 2

**Outcome:** FAIL — Agent timeout.

**Final page:** `http://localhost:8093/compass-everyday-cap.html`.

**Measured:** 600.129 s turn wall time; 602.054 s including setup; 2.641 s in browser tools; 86,198 tokens excluding cached input; 23 page interactions, 1 failed. Largest phase: **comparison (257.312 s)**.

| Phase | Wall s | Browser tools s | Outside tools s | All calls | Failures |
| --- | --- | --- | --- | --- | --- |
| orientation | 44.853 | 0.033 | 44.820 | 2 | 0 |
| discovery | 162.138 | 0.615 | 161.523 | 8 | 1 |
| comparison | 257.312 | 1.488 | 255.824 | 11 | 0 |
| cart | 130.557 | 0.505 | 130.052 | 6 | 0 |
| verification | 5.269 | 0.000 | 5.269 | 0 | 0 |

**Recorded search inputs, in order:** `mug`, `red`.

**Controller-reconstructed diagnostic:** The original worker was interrupted by the 600-second timeout before a final self-report. This diagnostic uses only its own recorded phase notes and browser call trace. It does not infer private reasoning.

The audit recorded successful Add to Cart calls on Canyon V-Neck Tee, Ridge Ribbed Beanie, and Compass Everyday Cap. The final screenshot showed a three-item cart badge and an add confirmation, but the worker stayed on the Compass product page. It marked verification at 594.860 seconds without then opening/verifying the full cart before interruption. The chosen items’ catalog prices sum to $65.40, but final quantities, cart subtotal, and handoff were not independently established.

**Recorded phase notes:**

| Elapsed s | Phase | Worker note |
| --- | --- | --- |
| 44.853 | discovery | Surveying the 30-item collection and checking for T-shirts, drinkware, and warm winter items. |
| 206.991 | comparison | Comparing tee details and checking candidate winter-value products after confirming no mug search result. |
| 464.303 | cart | Adding one tee and discounted beanie; selecting a practical accessory alternative because no mug is sold. |
| 594.860 | verification | Opening the full cart to verify all three one-unit selections and the subtotal without checking out. |

| Product with successful add call | Page | Evidence limitation |
| --- | --- | --- |
| Canyon V-Neck Tee | http://localhost:8093/canyon-v-neck-tee.html | Recorded successful Add to Cart call; not a verified final full-cart line. |
| Ridge Ribbed Beanie | http://localhost:8093/ridge-ribbed-beanie.html | Recorded successful Add to Cart call; not a verified final full-cart line. |
| Compass Everyday Cap | http://localhost:8093/compass-everyday-cap.html | Recorded successful Add to Cart call; not a verified final full-cart line. |

**Recorded failed interactions:**

| Action | Role / name | Duration s | Error summary |
| --- | --- | --- | --- |
| click | link / Harbor Everyday Tee | 0.024 | locator.click: Error: strict mode violation: getByRole('link', { name: 'Harbor Everyday Tee', exact: true }) resolved to 2 elements: |

**Artifacts:** controller diagnostic (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/magento-session-1-agent-2.diagnostic.md`); exact assigned prompt (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/magento-session-1-agent-2.prompt.txt`); saved storage state (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/magento-session-1-agent-2.storage.json`); final screenshot (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/magento-session-1-agent-2.png`).

Magento 2: captured final browser page (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/magento-session-1-agent-2.png`)

## 7. Earlier runs in this testing session

Earlier runs used different tasks and reporting requirements. Their totals are shown separately; they should not be interpreted as a controlled performance comparison with the vague task. No additional workers were launched to write this report.

| Run | Purpose | Result | Worker trials | Rounds | Run wall s | Tokens excl. cache | Cached input | Tokens incl. cache |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-10-05T12-19-43.108Z-716d2502 | Initial fixture validation; tool configuration failed | FAIL | 4 | 2 | 30.414 | 35,185 | 29,184 | 64,369 |
| 2026-10-05T12-20-36.678Z-8d965ebb | Fixed two-agent fixture validation | PASS | 4 | 2 | 45.439 | 67,129 | 130,560 | 197,689 |
| 2026-10-05T12-22-51.471Z-a0329dd1 | Two-agent fixture validation with live handoff | PASS | 4 | 2 | 57.083 | 63,657 | 134,656 | 198,313 |
| 2026-10-05T12-36-29.224Z-698a8251 | Exact-product comparison, two agents per shop | PASS | 6 | 1 | 78.980 | 218,413 | 663,552 | 881,965 |

### 2026-10-05T12-19-43.108Z-716d2502

Raw report: report.json (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T12-19-43.108Z-716d2502/report.json`).

All four fixture trials ended without accessing the browser because the code-mode host was disabled. Worker messages explicitly reported the unavailable assigned browser tool. No page interaction or handoff was recorded. The configuration was corrected before the next run.

| Trial | Result | Assigned product | Qty | Expected merchandise total | Turn s | Incl. setup s | Handoff s | Page interactions | Failures | All calls | Uncached input | Cached input | Output | Reasoning subset | Excl. cache | Incl. cache |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| session-1-agent-1 | FAIL | Blue Ceramic Mug | 3 | $36.00 | 11.836 | 12.218 | — | 0 | 0 | 0 | 5,817 | 9,728 | 364 | 229 | 6,181 | 15,909 |
| session-1-agent-2 | FAIL | Canvas Tote Bag | 1 | $18.00 | 12.859 | 13.241 | — | 0 | 0 | 0 | 10,712 | 4,864 | 345 | 205 | 11,057 | 15,921 |
| session-2-agent-1 | FAIL | Blue Ceramic Mug | 1 | $12.00 | 28.928 | 29.310 | — | 0 | 0 | 0 | 10,830 | 4,864 | 748 | 612 | 11,578 | 16,442 |
| session-2-agent-2 | FAIL | Canvas Tote Bag | 2 | $36.00 | 17.810 | 18.192 | — | 0 | 0 | 0 | 5,887 | 9,728 | 482 | 332 | 6,369 | 16,097 |

### 2026-10-05T12-20-36.678Z-8d965ebb

Raw report: report.json (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T12-20-36.678Z-8d965ebb/report.json`).

Fixture tasks searched a named product, set the assigned quantity, added it, and opened the cart. The controller verified cookie/local-storage/session-storage ownership markers and the exact cart. Earlier handed-off pages were rechecked after the second round.

| Trial | Result | Assigned product | Qty | Expected merchandise total | Turn s | Incl. setup s | Handoff s | Page interactions | Failures | All calls | Uncached input | Cached input | Output | Reasoning subset | Excl. cache | Incl. cache |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| session-1-agent-1 | PASS | Blue Ceramic Mug | 3 | $36.00 | 20.699 | 20.965 | 19.079 | 6 | Not recorded | 7 | 17,709 | 31,232 | 529 | 67 | 18,238 | 49,470 |
| session-1-agent-2 | PASS | Canvas Tote Bag | 1 | $18.00 | 22.351 | 22.616 | 20.853 | 6 | Not recorded | 7 | 17,695 | 31,232 | 528 | 90 | 18,223 | 49,455 |
| session-2-agent-1 | PASS | Blue Ceramic Mug | 1 | $12.00 | 20.117 | 20.212 | 18.687 | 6 | Not recorded | 7 | 17,550 | 31,232 | 513 | 63 | 18,063 | 49,295 |
| session-2-agent-2 | PASS | Canvas Tote Bag | 2 | $36.00 | 21.817 | 21.912 | 19.724 | 6 | Not recorded | 7 | 12,069 | 36,864 | 536 | 75 | 12,605 | 49,469 |

### 2026-10-05T12-22-51.471Z-a0329dd1

Raw report: report.json (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T12-22-51.471Z-a0329dd1/report.json`).

Fixture tasks searched a named product, set the assigned quantity, added it, and opened the cart. The controller verified cookie/local-storage/session-storage ownership markers and the exact cart. Earlier handed-off pages were rechecked after the second round.

| Trial | Result | Assigned product | Qty | Expected merchandise total | Turn s | Incl. setup s | Handoff s | Page interactions | Failures | All calls | Uncached input | Cached input | Output | Reasoning subset | Excl. cache | Incl. cache |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| session-1-agent-1 | PASS | Blue Ceramic Mug | 3 | $36.00 | 22.887 | 23.725 | 21.421 | 6 | Not recorded | 7 | 17,728 | 31,232 | 541 | 70 | 18,269 | 49,501 |
| session-1-agent-2 | PASS | Canvas Tote Bag | 1 | $18.00 | 23.411 | 24.249 | 21.502 | 6 | Not recorded | 7 | 11,080 | 38,144 | 598 | 132 | 11,678 | 49,822 |
| session-2-agent-1 | PASS | Blue Ceramic Mug | 1 | $12.00 | 29.010 | 29.312 | 26.993 | 6 | Not recorded | 7 | 21,760 | 27,136 | 531 | 90 | 22,291 | 49,427 |
| session-2-agent-2 | PASS | Canvas Tote Bag | 2 | $36.00 | 20.454 | 20.797 | 19.079 | 6 | Not recorded | 7 | 10,874 | 38,144 | 545 | 93 | 11,419 | 49,563 |

### 2026-10-05T12-36-29.224Z-698a8251

Raw report: report.json (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T12-36-29.224Z-698a8251/report.json`).

Shared task:

```text
Find Canyon V-Neck Tee (SKU CT-003) in the assigned store. Open its product page and verify that the current unit price is $20.80. Add exactly two units to an otherwise empty cart. Open the full shopping cart page and verify that it contains only Canyon V-Neck Tee, quantity 2, with a merchandise subtotal of $41.60 before shipping. Leave that cart page open and hand over the browser. Do not proceed with an order or payment.
```

| Trial | Result | Assigned product | Qty | Expected merchandise total | Turn s | Incl. setup s | Handoff s | Page interactions | Failures | All calls | Uncached input | Cached input | Output | Reasoning subset | Excl. cache | Incl. cache |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| magento-session-1-agent-1 | PASS | Canyon V-Neck Tee | 2 | $41.60 | 40.273 | 43.327 | 37.799 | 7 | Not recorded | 8 | 36,164 | 94,976 | 1,351 | 740 | 37,515 | 132,491 |
| magento-session-1-agent-2 | PASS | Canyon V-Neck Tee | 2 | $41.60 | 37.542 | 39.323 | 35.269 | 6 | Not recorded | 7 | 22,251 | 90,112 | 1,166 | 605 | 23,417 | 113,529 |
| prestashop-session-1-agent-1 | PASS | Canyon V-Neck Tee | 2 | $41.60 | 41.188 | 43.461 | 38.487 | 8 | Not recorded | 9 | 34,694 | 143,104 | 974 | 295 | 35,668 | 178,772 |
| prestashop-session-1-agent-2 | PASS | Canyon V-Neck Tee | 2 | $41.60 | 54.766 | 57.046 | 52.059 | 9 | Not recorded | 10 | 46,362 | 184,576 | 1,101 | 344 | 47,463 | 232,039 |
| woocommerce-session-1-agent-1 | PASS | Canyon V-Neck Tee | 2 | $41.60 | 75.748 | 77.624 | 73.179 | 6 | Not recorded | 7 | 39,011 | 72,704 | 747 | 161 | 39,758 | 112,462 |
| woocommerce-session-1-agent-2 | PASS | Canyon V-Neck Tee | 2 | $41.60 | 31.893 | 35.246 | 29.728 | 6 | Not recorded | 7 | 33,759 | 78,080 | 833 | 289 | 34,592 | 112,672 |

### Totals across all recorded worker runs

| Metric | All recorded runs |
| --- | --- |
| Runs | 5 |
| Worker trials | 24 |
| Passed worker trials | 18 |
| Failed/blocked/timed-out trials | 6 |
| Page interactions | 280 |
| Failed page interactions | 17 in latest run; earlier call-success flags not recorded |
| All worker tool calls | 321 |
| totalIncludingCached | 9,953,897 |
| cachedInput | 8,824,576 |
| uncachedInput | 1,056,062 |
| inputIncludingCached | 9,880,638 |
| outputIncludingReasoning | 73,259 |
| reasoningOutput | 43,730 |
| totalExcludingCached | 1,129,321 |
| Sum of measured run wall times | 815.134 s |

These totals exclude coordinator usage and human pauses between runs. A sum of measured run durations is not the duration of the whole conversation. The initial blocked configuration trials are included in the usage totals, and the 24 worker trials are repeated independent tasks rather than 24 simultaneous workers.

## 8. Reproduction, code, and retained artifacts

Latest-run command, executed from the project root:

```sh
node experiments/agent-browser/run.mjs --agents 2 --sessions 1 --task experiments/agent-browser/vague-commerce-task.json --timeout 600 --keep-open
```

Dual-round validation and configured ten-worker invocation:

```sh
cd experiments/agent-browser
npm run dual
npm run ten
```

The ten-worker command is documented for reproduction; it was not executed in this recorded session. The local shops must be running on ports 8091–8093 before replaying the commerce task. Replaying launches new workers and consumes additional usage.

| Source | Purpose |
| --- | --- |
| [run.mjs](run.mjs) | Run configuration, isolated contexts, worker lifecycle, timeout, verification and artifacts |
| [app-server.mjs](app-server.mjs) | Local Codex app-server protocol transport |
| [broker.mjs](broker.mjs) | Thread/handle-bound Playwright actions and audit log |
| [metrics.mjs](metrics.mjs) | Token subsets and measured phase timing |
| [detailed-report.mjs](detailed-report.mjs) | Worker report schema and instructions |
| [commerce-verifier.mjs](commerce-verifier.mjs) | Independent full-cart assertions |
| [isolation.txt](isolation.txt) | Exact isolation pre-prompt |
| [vague-commerce-task.json](vague-commerce-task.json) | Latest shared shopping prompt and three targets |
| [commerce-task.json](commerce-task.json) | Earlier exact-product prompt |
| [fixture.html](fixture.html) | Deterministic cart and storage-isolation fixture |
| [broker.test.mjs](broker.test.mjs) | Broker isolation, handoff and denied-access checks |
| [metrics.test.mjs](metrics.test.mjs) | Token and timing accounting checks |
| [README.md](README.md) | Usage and design documentation |

The implementation had nine passing unit checks during development, covering the broker/metrics behavior. Browser outcomes above come from the recorded live runs rather than from those unit checks.

| Latest-run artifact | Contents |
| --- | --- |
| [report.json](results/2026-10-05T13-21-59.909Z-4ffa6cab/report.json) | Authoritative controller result objects, usage, verification, timings and full action audit |
| report.md (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/report.md`) | Generated run summary |
| events.jsonl (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/events.jsonl`) | Raw app-server events and token-usage updates |
| model.json (local-only artifact: `../../output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab/model.json`) | Discovered Luna model capabilities and xhigh support |

Every worker has a saved `.prompt.txt`, `.png`, and `.storage.json`. Four also have original `.agent-report.json` and `.agent-report.md`; the two timeout cases have `.diagnostic.json` and `.diagnostic.md` explicitly labeled as controller reconstructions. Saved storage contains cookies/local storage, not a saved live page or exported session storage.

At run completion, `--keep-open` retained all six contexts for inspection and takeover, with worker access revoked. The screenshots and state files remain usable independently of whether the browser process is still running. Ctrl-C on the retained runner closes its browser. No claim is made here that a process has remained live indefinitely.

## 9. Complete latest-run interaction ledger

The ledger includes all **217 worker tool calls**, grouped by agent and ordered within each agent. “Page #” numbers only the **190 counted page interactions**; phase and handoff rows have no page number. Durations and queue waits are controller measurements. Complete error logs and before/after URLs are retained in `report.json`. Ledger durations are rounded for readability; the raw audit preserves finer precision.

### WooCommerce 1 — call ledger

| Call # | Page # | Approx. elapsed s | Action | Target / value | Duration s | Queue ms | Result | Page after |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 6.030 | snapshot | — | 0.039 | 0.077 | OK | / |
| 2 | — | 10.713 | phase | discovery | 0.000 | 0.037 | OK | / |
| 3 | 2 | 18.415 | fill | searchbox: Search for: ← mug | 0.025 | 0.016 | OK | / |
| 4 | 3 | 22.044 | click | button: Search | 10.002 | 0.012 | FAILED | / |
| 5 | 4 | 37.222 | press | searchbox: Search for: ← Enter | 0.119 | 0.007 | OK | / |
| 6 | — | 42.900 | phase | comparison | 0.000 | 0.022 | OK | / |
| 7 | 5 | 47.276 | click | link: Shop all | 0.175 | 0.008 | OK | / |
| 8 | 6 | 50.929 | click | link:  | 0.005 | 0.052 | FAILED | / |
| 9 | 7 | 54.750 | click | link: Canyon V-Neck Tee Canyon V-Neck Tee Sale! Original price was: $26.00. Current price is: $20.80. | 0.171 | 0.063 | OK | /product/canyon-v-neck-tee/ |
| 10 | 8 | 59.763 | click | link: Signal Graphic Tee Signal Graphic Tee $28.00 | 0.179 | 0.022 | OK | /product/signal-graphic-tee/ |
| 11 | 9 | 63.257 | click | tab: Additional information | 0.031 | 0.008 | OK | /product/signal-graphic-tee/ |
| 12 | 10 | 69.262 | fill | searchbox: Search for: ← red | 0.016 | 0.013 | OK | /product/signal-graphic-tee/ |
| 13 | 11 | 73.248 | press | searchbox: Search for: ← Enter | 0.116 | 0.083 | OK | / |
| 14 | 12 | 78.263 | click | link: Tide V-Neck Tee Tide V-Neck Tee $26.00 | 0.138 | 0.008 | OK | /product/tide-v-neck-tee/ |
| 15 | 13 | 85.166 | click | link: Grove V-Neck Tee Grove V-Neck Tee $26.00 | 0.146 | 0.033 | OK | /product/grove-v-neck-tee/ |
| 16 | 14 | 98.283 | click | link: Tees | 0.017 | 0.009 | FAILED | /product/grove-v-neck-tee/ |
| 17 | 15 | 102.759 | click | link: Tees [index 0] | 0.156 | 0.051 | OK | /product-category/tees/ |
| 18 | 16 | 109.015 | click | link: Dusk Long-Sleeve Tee Dusk Long-Sleeve Tee $34.00 | 0.151 | 0.011 | OK | /product/dusk-long-sleeve-tee/ |
| 19 | 17 | 116.876 | click | link: Harbor Everyday Tee Harbor Everyday Tee  | 0.157 | 0.025 | OK | /product/harbor-everyday-tee/ |
| 20 | 18 | 148.993 | click | link: Accessories [index 0] | 0.139 | 0.065 | OK | /product-category/accessories/ |
| 21 | 19 | 165.642 | click | link: Foundry Leather Belt Foundry Leather Belt $39.00 | 0.162 | 0.022 | OK | /product/foundry-leather-belt/ |
| 22 | 20 | 170.036 | click | link: Headwear [index 0] | 0.188 | 0.007 | OK | /product-category/headwear/ |
| 23 | 21 | 174.753 | click | link: Ridge Ribbed Beanie Ridge Ribbed Beanie Sale! Original price was: $22.00. Current price is: $17.60. | 0.161 | 0.022 | OK | /product/ridge-ribbed-beanie/ |
| 24 | — | 185.211 | phase | cart | 0.000 | 0.009 | OK | /product/ridge-ribbed-beanie/ |
| 25 | 22 | 190.174 | click | button: Add to cart | 0.180 | 0.020 | OK | /product/ridge-ribbed-beanie/ |
| 26 | 23 | 194.634 | click | link: Tees [index 0] | 0.136 | 0.007 | OK | /product-category/tees/ |
| 27 | 24 | 198.783 | click | button: Add to cart: “Canyon V-Neck Tee” | 0.024 | 0.010 | OK | /product-category/tees/ |
| 28 | 25 | 201.892 | snapshot | — | 0.007 | 0.008 | OK | /product-category/tees/ |
| 29 | 26 | 207.627 | click | link: Accessories [index 0] | 0.165 | 0.012 | OK | /product-category/accessories/ |
| 30 | 27 | 212.080 | click | button: Add to cart: “Foundry Leather Belt” | 0.035 | 0.010 | OK | /product-category/accessories/ |
| 31 | 28 | 215.832 | snapshot | — | 0.010 | 0.028 | OK | /product-category/accessories/ |
| 32 | — | 223.512 | phase | verification | 0.000 | 0.037 | OK | /product-category/accessories/ |
| 33 | 29 | 227.916 | click | link: $77.40 3 items  | 0.345 | 0.028 | OK | /cart/ |
| 34 | 30 | 231.957 | snapshot | — | 0.010 | 0.013 | OK | /cart/ |
| 35 | — | 238.882 | handoff | — | 0.244 | 0.009 | OK | /cart/ |

### WooCommerce 2 — call ledger

| Call # | Page # | Approx. elapsed s | Action | Target / value | Duration s | Queue ms | Result | Page after |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 5.048 | snapshot | — | 0.038 | 0.062 | OK | / |
| 2 | — | 10.701 | phase | discovery | 0.000 | 0.012 | OK | / |
| 3 | 2 | 14.454 | fill | searchbox: Search for: ← mug | 0.019 | 0.008 | OK | / |
| 4 | 3 | 18.042 | click | button: Search | 10.005 | 0.012 | FAILED | / |
| 5 | 4 | 46.243 | press | searchbox: Search for: ← Enter | 0.118 | 0.027 | OK | / |
| 6 | — | 82.375 | phase | comparison | 0.000 | 0.045 | OK | / |
| 7 | 5 | 105.017 | fill | searchbox: Search for: ← red | 0.014 | 0.056 | OK | / |
| 8 | 6 | 124.664 | press | searchbox: Search for: ← Enter | 0.155 | 0.022 | OK | / |
| 9 | 7 | 152.582 | click | link: Tide V-Neck Tee Tide V-Neck Tee $26.00 | 0.157 | 0.048 | OK | /product/tide-v-neck-tee/ |
| 10 | 8 | 159.040 | fill | searchbox: Search for: ← red tee | 0.018 | 0.042 | OK | /product/tide-v-neck-tee/ |
| 11 | 9 | 163.944 | press | searchbox: Search for: ← Enter | 0.167 | 0.052 | OK | /product/tide-v-neck-tee/ |
| 12 | 10 | 194.674 | click | link: Tees | 0.023 | 0.015 | FAILED | /product/tide-v-neck-tee/ |
| 13 | 11 | 198.617 | click | link: Tees [index 0] | 0.139 | 0.009 | OK | /product-category/tees/ |
| 14 | 12 | 223.418 | click | link: Canyon V-Neck Tee Canyon V-Neck Tee Sale! Original price was: $26.00. Current price is: $20.80. | 0.168 | 0.029 | OK | /product/canyon-v-neck-tee/ |
| 15 | 13 | 254.412 | click | tab: Additional information | 0.027 | 0.007 | OK | /product/canyon-v-neck-tee/ |
| 16 | 14 | 286.512 | fill | searchbox: Search for: ← maroon | 0.012 | 0.006 | OK | /product/canyon-v-neck-tee/ |
| 17 | 15 | 309.760 | press | searchbox: Search for: ← Enter | 0.130 | 0.007 | OK | / |
| 18 | 16 | 332.763 | fill | searchbox: Search for: ← red | 0.023 | 0.015 | OK | / |
| 19 | 17 | 353.984 | press | searchbox: Search for: ← Enter | 0.122 | 0.013 | OK | / |
| 20 | 18 | 372.541 | click | link: Studio Everyday Polo Studio Everyday Polo $46.00 | 0.182 | 0.006 | OK | /product/studio-everyday-polo/ |
| 21 | 19 | 413.246 | click | link: Shop all | 0.190 | 0.011 | OK | / |
| 22 | 20 | 430.853 | click | link: Trail Pocket Hoodie Trail Pocket Hoodie Sale! Original price was: $72.00. Current price is: $57.60. | 0.174 | 0.017 | OK | /product/trail-pocket-hoodie/ |
| 23 | 21 | 435.438 | click | link: Accessories | 0.153 | 0.080 | OK | /product-category/accessories/ |
| 24 | 22 | 464.402 | click | link: Tees [index 0] | 0.155 | 0.041 | OK | /product-category/tees/ |
| 25 | 23 | 481.869 | click | link: Signal Graphic Tee Signal Graphic Tee $28.00 | 0.171 | 0.048 | OK | /product/signal-graphic-tee/ |
| 26 | 24 | 513.248 | click | link: Grove V-Neck Tee Grove V-Neck Tee $26.00 | 0.184 | 0.045 | OK | /product/grove-v-neck-tee/ |
| 27 | 25 | 538.417 | click | link: Harbor Everyday Tee Harbor Everyday Tee $24.00 | 0.159 | 0.008 | OK | /product/harbor-everyday-tee/ |
| 28 | 26 | 580.136 | click | link: Accessories | 0.175 | 0.035 | OK | /product-category/accessories/ |

### PrestaShop 1 — call ledger

| Call # | Page # | Approx. elapsed s | Action | Target / value | Duration s | Queue ms | Result | Page after |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 4.666 | snapshot | — | 0.040 | 0.793 | OK | / |
| 2 | — | 8.817 | phase | discovery | 0.000 | 0.028 | OK | / |
| 3 | 2 | 11.672 | click | link: Tees | 0.375 | 0.010 | OK | /10-tees |
| 4 | 3 | 15.682 | fill | textbox: Search ← mug | 0.016 | 0.009 | OK | /10-tees |
| 5 | 4 | 18.262 | press | textbox: Search ← Enter | 0.112 | 0.010 | OK | /search |
| 6 | 5 | 22.388 | fill | textbox: Search ← red | 0.022 | 0.111 | OK | /search |
| 7 | 6 | 25.222 | press | textbox: Search ← Enter | 0.139 | 0.015 | OK | /search |
| 8 | 7 | 30.181 | click | link: Accessories | 0.187 | 0.047 | OK | /14-accessories |
| 9 | — | 46.377 | phase | comparison | 0.000 | 0.021 | OK | /14-accessories |
| 10 | 8 | 50.231 | click | link: Tees | 0.030 | 0.054 | FAILED | /14-accessories |
| 11 | 9 | 54.551 | click | link: Tees [index 0] | 0.155 | 0.012 | OK | /10-tees |
| 12 | 10 | 57.291 | click | link: Canyon V-Neck Tee | 0.012 | 0.019 | FAILED | /10-tees |
| 13 | 11 | 60.247 | click | link: Canyon V-Neck Tee [index 0] | 0.215 | 0.007 | OK | /22-canyon-v-neck-tee.html |
| 14 | 12 | 64.068 | click | tab: Product Details | 0.030 | 0.044 | OK | /22-canyon-v-neck-tee.html |
| 15 | 13 | 73.470 | click | link: Harbor Everyday Tee [index 0] | 0.173 | 0.007 | OK | /20-harbor-everyday-tee.html |
| 16 | 14 | 96.647 | click | link: Hoodies [index 0] | 0.178 | 0.045 | OK | /11-hoodies |
| 17 | 15 | 99.754 | click | link: Trail Pocket Hoodie [index 0] | 0.243 | 0.008 | OK | /30-trail-pocket-hoodie.html |
| 18 | 16 | 110.146 | fill | textbox: Search ← coffee | 0.023 | 0.014 | OK | /30-trail-pocket-hoodie.html |
| 19 | 17 | 117.959 | press | textbox: Search ← Enter | 0.117 | 0.055 | OK | /search |
| 20 | 18 | 124.086 | click | link: Ridge Ribbed Beanie [index 0] | 0.175 | 0.022 | OK | /38-ridge-ribbed-beanie.html |
| 21 | 19 | 144.597 | fill | textbox: Search ← rust | 0.019 | 0.060 | OK | /38-ridge-ribbed-beanie.html |
| 22 | 20 | 147.199 | press | textbox: Search ← Enter | 0.114 | 0.018 | OK | /search |
| 23 | 21 | 150.553 | click | link: Dusk Long-Sleeve Tee [index 0] | 0.166 | 0.032 | OK | /25-dusk-long-sleeve-tee.html |
| 24 | — | 187.371 | phase | cart | 0.000 | 0.043 | OK | /25-dusk-long-sleeve-tee.html |
| 25 | 22 | 191.922 | click | link: Canyon V-Neck Tee [index 0] | 0.175 | 0.010 | OK | /22-canyon-v-neck-tee.html |
| 26 | 23 | 194.917 | click | button:  Add to cart | 0.038 | 0.047 | OK | /22-canyon-v-neck-tee.html |
| 27 | 24 | 197.712 | snapshot | — | 0.009 | 0.007 | OK | /22-canyon-v-neck-tee.html |
| 28 | 25 | 201.150 | click | button: Continue shopping | 0.030 | 0.009 | OK | /22-canyon-v-neck-tee.html |
| 29 | 26 | 205.302 | click | button: Close | 10.002 | 0.018 | FAILED | /22-canyon-v-neck-tee.html |
| 30 | 27 | 218.225 | snapshot | — | 0.009 | 0.007 | OK | /22-canyon-v-neck-tee.html |
| 31 | 28 | 221.414 | click | link: Ridge Ribbed Beanie [index 0] | 0.178 | 0.043 | OK | /38-ridge-ribbed-beanie.html |
| 32 | 29 | 224.213 | click | button:  Add to cart | 0.041 | 0.008 | OK | /38-ridge-ribbed-beanie.html |
| 33 | 30 | 226.633 | snapshot | — | 0.018 | 0.012 | OK | /38-ridge-ribbed-beanie.html |
| 34 | 31 | 230.933 | click | button: Continue shopping | 0.028 | 0.028 | OK | /38-ridge-ribbed-beanie.html |
| 35 | 32 | 235.501 | click | button: Continue shopping | 10.007 | 0.025 | FAILED | /38-ridge-ribbed-beanie.html |
| 36 | 33 | 248.178 | snapshot | — | 0.011 | 0.007 | OK | /38-ridge-ribbed-beanie.html |
| 37 | 34 | 250.947 | click | link: Trail Pocket Hoodie [index 0] | 0.182 | 0.007 | OK | /30-trail-pocket-hoodie.html |
| 38 | 35 | 253.657 | click | button:  Add to cart | 0.026 | 0.012 | OK | /30-trail-pocket-hoodie.html |
| 39 | 36 | 256.531 | snapshot | — | 0.013 | 0.007 | OK | /30-trail-pocket-hoodie.html |
| 40 | — | 261.938 | phase | verification | 0.000 | 0.021 | OK | /30-trail-pocket-hoodie.html |
| 41 | 37 | 265.508 | click | link:  Proceed to checkout | 0.167 | 0.008 | OK | /cart |
| 42 | 38 | 269.263 | snapshot | — | 0.011 | 0.009 | OK | /cart |
| 43 | — | 273.127 | handoff | — | 0.077 | 0.012 | OK | /cart |

### PrestaShop 2 — call ledger

| Call # | Page # | Approx. elapsed s | Action | Target / value | Duration s | Queue ms | Result | Page after |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 5.065 | snapshot | — | 0.034 | 0.006 | OK | / |
| 2 | — | 10.351 | phase | discovery | 0.001 | 0.010 | OK | / |
| 3 | 2 | 13.756 | fill | textbox: Search ← mug | 0.021 | 0.027 | OK | / |
| 4 | 3 | 17.559 | press | textbox: Search ← Enter | 0.142 | 0.014 | OK | /search |
| 5 | 4 | 24.330 | fill | textbox: Search ← coffee | 0.020 | 0.007 | OK | /search |
| 6 | 5 | 29.013 | press | textbox: Search ← Enter | 0.113 | 0.028 | OK | /search |
| 7 | 6 | 34.582 | click | link: Tees | 0.188 | 0.023 | OK | /10-tees |
| 8 | 7 | 38.265 | fill | textbox: Search ← red | 0.017 | 0.009 | OK | /10-tees |
| 9 | 8 | 41.247 | press | textbox: Search ← Enter | 0.127 | 0.009 | OK | /search |
| 10 | — | 45.814 | phase | comparison | 0.000 | 0.065 | OK | /search |
| 11 | 9 | 49.086 | click | link: Canyon V-Neck Tee | 0.021 | 0.010 | FAILED | /search |
| 12 | 10 | 52.729 | click | link: Canyon V-Neck Tee [index 0] | 0.180 | 0.011 | OK | /22-canyon-v-neck-tee.html |
| 13 | 11 | 57.691 | click | tab: Product Details | 0.024 | 0.004 | OK | /22-canyon-v-neck-tee.html |
| 14 | 12 | 61.460 | snapshot | — | 0.013 | 0.013 | OK | /22-canyon-v-neck-tee.html |
| 15 | 13 | 76.968 | click | link: Accessories | 0.148 | 0.022 | OK | /14-accessories |
| 16 | 14 | 93.476 | click | link: Tees | 0.027 | 0.057 | FAILED | /14-accessories |
| 17 | 15 | 97.121 | click | link: Tees [index 0] | 0.163 | 0.008 | OK | /10-tees |
| 18 | 16 | 102.301 | click | link: Signal Graphic Tee [index 0] | 0.156 | 0.028 | OK | /21-signal-graphic-tee.html |
| 19 | 17 | 116.387 | fill | textbox: Search ← tumbler | 0.022 | 0.047 | OK | /21-signal-graphic-tee.html |
| 20 | 18 | 119.435 | press | textbox: Search ← Enter | 0.119 | 0.016 | OK | /search |
| 21 | 19 | 134.595 | click | link: Hoodies [index 0] | 0.153 | 0.010 | OK | /11-hoodies |
| 22 | 20 | 138.217 | click | link: Trail Pocket Hoodie [index 0] | 0.173 | 0.058 | OK | /30-trail-pocket-hoodie.html |
| 23 | 21 | 143.457 | click | link: Headwear [index 0] | 0.144 | 0.047 | OK | /13-headwear |
| 24 | 22 | 147.974 | click | link: Ridge Ribbed Beanie [index 0] | 0.149 | 0.011 | OK | /38-ridge-ribbed-beanie.html |
| 25 | 23 | 157.705 | click | link: Tees [index 0] | 0.146 | 0.012 | OK | /10-tees |
| 26 | 24 | 162.805 | click | link: Harbor Everyday Tee [index 0] | 0.163 | 0.019 | OK | /20-harbor-everyday-tee.html |
| 27 | — | 170.081 | phase | cart | 0.000 | 0.019 | OK | /20-harbor-everyday-tee.html |
| 28 | 25 | 174.241 | click | button:  Add to cart | 0.036 | 0.008 | OK | /20-harbor-everyday-tee.html |
| 29 | 26 | 177.665 | snapshot | — | 0.012 | 0.009 | OK | /20-harbor-everyday-tee.html |
| 30 | 27 | 181.389 | click | button: Continue shopping | 0.036 | 0.051 | OK | /20-harbor-everyday-tee.html |
| 31 | 28 | 185.794 | click | button: Continue shopping | 10.001 | 0.065 | FAILED | /20-harbor-everyday-tee.html |
| 32 | 29 | 199.730 | snapshot | — | 0.015 | 0.030 | OK | /20-harbor-everyday-tee.html |
| 33 | 30 | 203.379 | click | link: Ridge Ribbed Beanie [index 0] | 0.205 | 0.039 | OK | /38-ridge-ribbed-beanie.html |
| 34 | 31 | 206.736 | click | button:  Add to cart | 0.029 | 0.015 | OK | /38-ridge-ribbed-beanie.html |
| 35 | 32 | 210.190 | snapshot | — | 0.024 | 0.031 | OK | /38-ridge-ribbed-beanie.html |
| 36 | 33 | 215.647 | click | button: Continue shopping | 0.030 | 0.054 | OK | /38-ridge-ribbed-beanie.html |
| 37 | 34 | 223.740 | click | link: Trail Pocket Hoodie [index 0] | 0.165 | 0.010 | OK | /30-trail-pocket-hoodie.html |
| 38 | 35 | 230.288 | click | button:  Add to cart | 0.034 | 0.040 | OK | /30-trail-pocket-hoodie.html |
| 39 | 36 | 234.513 | snapshot | — | 0.017 | 0.036 | OK | /30-trail-pocket-hoodie.html |
| 40 | — | 240.484 | phase | verification | 0.000 | 0.007 | OK | /30-trail-pocket-hoodie.html |
| 41 | 37 | 245.105 | click | link: Shopping cart link containing 3 product(s) | 10.007 | 0.023 | FAILED | /30-trail-pocket-hoodie.html |
| 42 | 38 | 260.250 | snapshot | — | 0.013 | 0.011 | OK | /30-trail-pocket-hoodie.html |
| 43 | 39 | 264.049 | click | button: Close | 0.031 | 0.007 | OK | /30-trail-pocket-hoodie.html |
| 44 | 40 | 271.866 | click | link:  Proceed to checkout | 10.008 | 0.033 | FAILED | /30-trail-pocket-hoodie.html |
| 45 | 41 | 286.226 | snapshot | — | 0.008 | 0.012 | OK | /30-trail-pocket-hoodie.html |
| 46 | 42 | 289.738 | click | link: Shopping cart link containing 3 product(s) | 0.171 | 0.015 | OK | /cart |
| 47 | — | 294.829 | handoff | — | 0.087 | 0.012 | OK | /cart |

### Magento 1 — call ledger

| Call # | Page # | Approx. elapsed s | Action | Target / value | Duration s | Queue ms | Result | Page after |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 5.761 | snapshot | — | 0.047 | 0.015 | OK | / |
| 2 | — | 10.370 | phase | discovery | 0.000 | 0.013 | OK | / |
| 3 | 2 | 13.814 | click | menuitem: Accessories | 0.768 | 0.008 | OK | /accessories.html |
| 4 | 3 | 18.877 | fill | combobox:  Search ← mug | 0.029 | 0.014 | OK | /accessories.html |
| 5 | 4 | 23.544 | press | combobox:  Search ← Enter | 0.333 | 0.072 | OK | /catalogsearch/result/ |
| 6 | — | 36.152 | phase | discovery | 0.000 | 0.048 | OK | /catalogsearch/result/ |
| 7 | 5 | 40.287 | click | link: Tees | 10.006 | 0.022 | FAILED | /catalogsearch/result/ |
| 8 | 6 | 52.933 | snapshot | — | 0.006 | 0.144 | OK | /catalogsearch/result/ |
| 9 | 7 | 56.404 | click | menuitem: Tees | 0.343 | 0.012 | OK | /tees.html |
| 10 | — | 60.610 | phase | comparison | 0.000 | 0.011 | OK | /tees.html |
| 11 | 8 | 63.808 | click | link: Harbor Everyday Tee | 0.015 | 0.010 | FAILED | /tees.html |
| 12 | 9 | 67.777 | click | link: Harbor Everyday Tee [index 0] | 0.279 | 0.010 | OK | /harbor-everyday-tee.html |
| 13 | 10 | 72.156 | snapshot | — | 0.009 | 0.028 | OK | /harbor-everyday-tee.html |
| 14 | 11 | 83.606 | fill | combobox:  Search ← red | 0.015 | 0.028 | OK | /harbor-everyday-tee.html |
| 15 | 12 | 87.117 | press | combobox:  Search ← Enter | 0.211 | 0.008 | OK | /catalogsearch/result/ |
| 16 | 13 | 100.334 | click | menuitem: Hoodies | 0.318 | 0.057 | OK | /hoodies.html |
| 17 | 14 | 104.413 | click | link: Trail Pocket Hoodie [index 0] | 0.288 | 0.015 | OK | /trail-pocket-hoodie.html |
| 18 | 15 | 125.289 | click | menuitem: Accessories | 0.146 | 0.030 | OK | /accessories.html |
| 19 | 16 | 128.929 | click | link: Foundry Leather Belt [index 0] | 0.277 | 0.007 | OK | /foundry-leather-belt.html |
| 20 | — | 134.433 | phase | cart | 0.000 | 0.048 | OK | /foundry-leather-belt.html |
| 21 | 17 | 138.402 | snapshot | — | 0.014 | 0.049 | OK | /foundry-leather-belt.html |
| 22 | 18 | 142.123 | click | button: Add to Cart | 0.033 | 0.020 | OK | /foundry-leather-belt.html |
| 23 | 19 | 145.958 | snapshot | — | 0.007 | 0.022 | OK | /foundry-leather-belt.html |
| 24 | 20 | 149.477 | click | menuitem: Tees | 0.135 | 0.058 | OK | /tees.html |
| 25 | 21 | 153.527 | click | link: Harbor Everyday Tee [index 0] | 0.126 | 0.022 | OK | /harbor-everyday-tee.html |
| 26 | 22 | 156.856 | snapshot | — | 0.015 | 0.015 | OK | /harbor-everyday-tee.html |
| 27 | 23 | 160.609 | click | button: Add to Cart | 0.038 | 0.010 | OK | /harbor-everyday-tee.html |
| 28 | 24 | 164.195 | snapshot | — | 0.009 | 0.042 | OK | /harbor-everyday-tee.html |
| 29 | 25 | 167.873 | click | menuitem: Hoodies | 0.146 | 0.008 | OK | /hoodies.html |
| 30 | 26 | 171.109 | click | link: Trail Pocket Hoodie [index 0] | 0.122 | 0.008 | OK | /trail-pocket-hoodie.html |
| 31 | 27 | 174.646 | snapshot | — | 0.010 | 0.010 | OK | /trail-pocket-hoodie.html |
| 32 | 28 | 178.924 | click | button: Add to Cart | 0.025 | 0.008 | OK | /trail-pocket-hoodie.html |
| 33 | 29 | 181.916 | snapshot | — | 0.008 | 0.011 | OK | /trail-pocket-hoodie.html |
| 34 | — | 186.869 | phase | verification | 0.000 | 0.008 | OK | /trail-pocket-hoodie.html |
| 35 | 30 | 192.538 | click | link:  My Cart 3 3 items | 0.040 | 0.010 | OK | /trail-pocket-hoodie.html |
| 36 | 31 | 197.108 | click | link: View and Edit Cart | 0.297 | 0.021 | OK | /checkout/cart/ |
| 37 | — | 205.656 | handoff | — | 0.098 | 0.011 | OK | /checkout/cart/ |

### Magento 2 — call ledger

| Call # | Page # | Approx. elapsed s | Action | Target / value | Duration s | Queue ms | Result | Page after |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 20.173 | snapshot | — | 0.033 | 0.012 | OK | / |
| 2 | — | 44.853 | phase | discovery | 0.000 | 0.011 | OK | / |
| 3 | 2 | 75.959 | click | link: Harbor Everyday Tee | 0.024 | 0.010 | FAILED | / |
| 4 | 3 | 94.677 | click | link: Harbor Everyday Tee [index 0] | 0.153 | 0.050 | OK | /harbor-everyday-tee.html |
| 5 | 4 | 101.725 | fill | combobox:  Search ← mug | 0.015 | 0.008 | OK | /harbor-everyday-tee.html |
| 6 | 5 | 123.232 | press | combobox:  Search ← Enter | 0.230 | 0.012 | OK | /catalogsearch/result/ |
| 7 | 6 | 130.104 | fill | combobox:  Search ← red | 0.014 | 0.020 | OK | /catalogsearch/result/ |
| 8 | 7 | 155.485 | press | combobox:  Search ← Control+A | 0.019 | 0.051 | OK | /catalogsearch/result/ |
| 9 | 8 | 179.187 | click | menuitem: Tees | 0.160 | 0.024 | OK | /tees.html |
| 10 | — | 206.991 | phase | comparison | 0.000 | 0.006 | OK | /tees.html |
| 11 | 9 | 236.821 | click | link: Signal Graphic Tee [index 0] | 0.256 | 0.012 | OK | /signal-graphic-tee.html |
| 12 | 10 | 264.047 | snapshot | — | 0.015 | 0.028 | OK | /signal-graphic-tee.html |
| 13 | 11 | 294.761 | click | link: Tees | 0.177 | 0.015 | OK | /tees.html |
| 14 | 12 | 299.179 | click | link: Canyon V-Neck Tee [index 0] | 0.112 | 0.009 | OK | /canyon-v-neck-tee.html |
| 15 | 13 | 328.137 | snapshot | — | 0.018 | 0.020 | OK | /canyon-v-neck-tee.html |
| 16 | 14 | 352.522 | click | button: Add to Cart | 0.044 | 0.039 | OK | /canyon-v-neck-tee.html |
| 17 | 15 | 371.902 | snapshot | — | 0.007 | 0.008 | OK | /canyon-v-neck-tee.html |
| 18 | 16 | 393.098 | click | menuitem: Headwear | 0.392 | 0.007 | OK | /headwear.html |
| 19 | 17 | 415.986 | click | link: Ridge Ribbed Beanie [index 0] | 0.428 | 0.008 | OK | /ridge-ribbed-beanie.html |
| 20 | 18 | 444.027 | click | button: Add to Cart | 0.039 | 0.010 | OK | /ridge-ribbed-beanie.html |
| 21 | — | 464.304 | phase | cart | 0.000 | 0.049 | OK | /ridge-ribbed-beanie.html |
| 22 | 19 | 482.279 | click | menuitem: Headwear | 0.142 | 0.008 | OK | /headwear.html |
| 23 | 20 | 499.492 | click | link: Compass Everyday Cap [index 0] | 0.292 | 0.133 | OK | /compass-everyday-cap.html |
| 24 | 21 | 519.014 | snapshot | — | 0.016 | 0.052 | OK | /compass-everyday-cap.html |
| 25 | 22 | 542.786 | click | button: Add to Cart | 0.044 | 0.045 | OK | /compass-everyday-cap.html |
| 26 | 23 | 567.580 | snapshot | — | 0.011 | 0.009 | OK | /compass-everyday-cap.html |
| 27 | — | 594.860 | phase | verification | 0.000 | 0.070 | OK | /compass-everyday-cap.html |

Approximate elapsed values in the ledger are reconstructed from the first discovery annotation and rounded to milliseconds. Phase tables and turn totals are taken directly from the controller report.

## 10. Practical interpretation and remaining limits

The harness demonstrated concurrent isolation, repeated independent rounds, usage collection, independently verified carts, and live-browser handoff. The vague workload exposed a decision-time problem and weaker semantic shopping matches: two agents timed out, two completed agents selected gray tees, and all completed agents substituted a wearable accessory for an unavailable mug. The reports disclosed these limitations, but disclosure does not make every substitution useful.

A follow-up experiment could give workers image observations and a clear exploration budget, require a decision by a fixed deadline, and reserve time for full-cart verification and final reporting. Semantic checks could score color, functional substitution, and fit uncertainty separately from process completion. Those changes and a ten-agent execution were not performed as part of this report.

The largest improvement opportunity is reducing agent round trips for basket evidence and panel management. The existing Glovo mutations were already fast. The logs also show substantial benchmark overhead from writing reports.

This audit uses the actual JSONL session records for all four agents, rather than their final summaries. [Run 3's observable transcript](/Users/wende/projects/shopping-assistant/experiments/glovo/benchmark/transcript-run-3.md) and [run 4's observable transcript](/Users/wende/projects/shopping-assistant/experiments/glovo/benchmark/transcript-run-4.md) preserve exact tool inputs, returned text, UTC timestamps, call IDs and source line numbers. Internal reasoning and image payloads are omitted. [audit-details.json](/Users/wende/projects/shopping-assistant/experiments/glovo/benchmark/audit-details.json) contains the calculated intervals and token usage per phase.

| Observed phase | Run 3 | Run 4 | Model responses, run 3 / 4 |
|---|---:|---:|---:|
| Setup through fresh empty basket | 32.826 s | 37.270 s | 7 / 7 |
| Product searches, four additions, fresh basket read | 35.840 s | 43.982 s | 7 / 10 |
| Native basket screenshot preparation and inspection | **74.408 s** | **52.732 s** | 11 / 9 |
| Four removals and empty-basket screenshot inspection | 39.362 s | 36.964 s | 8 / 7 |
| Final checks, timing and report | **93.465 s** | **89.699 s** | 6 / 7 |
| Total | 275.901 s | 260.647 s | 39 / 40 |

Phase boundaries are tool-result timestamps: initial fresh empty read, fresh four-item read, inspection of the final usable basket screenshot, inspection of the empty screenshot, and final task completion. They are mutually exclusive and sum to the measured runtime. Token usage is assigned by each model response's logged timestamp; the phase totals reproduce each agent's exact cumulative usage.

Across every observable tool call, logged call-to-result intervals totaled **15.509 s** for run 3 and **14.132 s** for run 4. About 94% of elapsed time was outside those intervals. The logs do not separate model processing, response composition, scheduling and other overhead within the gaps; they cannot be described as pure network latency or pure reasoning time.

The key evidence from run 3 is:

- **13:22:04.954–13:22:05.513:** Call 8 grouped all four searches into one tool invocation by running four CLI commands. The entire tool interval was **0.559 s**. Search returned the requested products, including the required shake groups. No fuzzy fallback or second query was used.
- **13:22:13.147–13:22:25.196:** Calls 10–13 added the products in four separate tool turns. Their intervals totaled **3.450 s** within a **12.049 s** span. The gaps between them totaled **8.599 s**.
- **13:22:36.008–13:23:50.416:** After the fresh read already showed four items, it took **74.408 s** to obtain and inspect the usable native basket screenshot. Calls 14–17 and 20 attempted several accessibility-tree filters. Call 16 returned only `Order again` twice. The native basket was outside the useful truncated tree.
- **13:23:27.378:** Call 21 searched `document.querySelectorAll("button")` for close/adapter controls and returned **`[]`**. It did not traverse the panel's shadow root.
- **13:23:35.024:** Call 22 read `panel.js`, returning **12,203 characters** of source and wrapper text.
- **13:23:43.168:** Call 23 finally used `document.querySelector("#shopping-assistant-glovo-panel")?.shadowRoot?.querySelector(".close")?.click()`. The result was `panelHidden: true`. Calls 24–25 retook and inspected the screenshot.
- **13:23:58.716–13:24:13.196:** Calls 26–29 removed the four exact lines. Tool intervals totaled **2.597 s** within **14.480 s**; inter-call gaps totaled **11.883 s**.
- **13:24:51.988–13:26:03.243:** After the recorded browser-task end, the report/finalization tail lasted **71.255 s**. The largest single inter-call gap, **54.124 s**, preceded the call that wrote the report JSON.

Run 4 repeated much of the same work:

- **13:27:20.330–13:27:28.350:** Calls 8–11 searched separately. The span was **8.020 s**, while the four tool intervals totaled **0.727 s**. The inter-call gaps were **7.293 s**.
- **13:27:35.967–13:27:47.916:** Calls 13–16 added separately: **11.949 s** elapsed, **3.344 s** in tool intervals, **8.605 s** between calls.
- **13:27:56.946–13:28:49.678:** Basket screenshot work took **52.732 s** after the fresh server read had already confirmed four items. Calls 18–20 inspected filtered/sliced snapshots; returned text contained product cards, quantities, and the `truncated: true` marker rather than the desired order panel.
- **13:28:29.592:** Call 23 read `panel.js`, again returning **12,203 characters**. Call 24 closed it by directly accessing its shadow root. Calls 25–26 captured and inspected the usable screenshot.
- **13:28:58.634–13:29:12.501:** Four removals: **13.867 s** elapsed, **2.725 s** in tool intervals, **11.142 s** between calls.
- **13:29:45.845–13:30:56.341:** The report/finalization tail after the recorded browser-task end was **70.496 s**. The gap preceding the report-writing call was **38.086 s**.

Both agents interacted with the adapter's JavaScript API for searches, additions and removals. Their only panel interaction was closing it. Neither used its Find products, Choose options, Add 1 or Remove 1 controls. Thus these runs measured the API plus an obstructing UI overlay; they did not test the panel's product-selection workflow.

The four-run operation counts support the same pattern:

| Run | All tool invocations | Model responses | Snapshot requests | Screenshot requests | Logged tool-result waiting |
|---|---:|---:|---:|---:|---:|
| 1, UI | 90 | 92 | 15 | 3 | 15.981 s |
| 2, UI | 77 | 78 | 16 | 7 | 15.200 s |
| 3, adapter | 38 | 39 | 7 | 3 | 15.509 s |
| 4, adapter | 39 | 40 | 4 | 3 | 14.132 s |

Tool counts include coordination, filesystem reads, images and clock calls. One invocation can contain several commands. Run 1 includes its initial stopped attempt and resumed turn. These are operation counts, not counts of individual Glovo HTTP requests.

UI-only evidence is consistent with the adapter eliminating product-control discovery. Run 2 spent **177.413 s**, across calls 19–36, from opening the shake modal to releasing the final Add-button click. Its transcript shows omitted modal content, empty radio IDs/names/ARIA labels, DOM ancestor inspection and separate mouse-press/release calls. Looking up and adding the pie then took **86.850 s**, calls 40–52, with repeated empty snapshot matches before a DOM lookup found the visible control. In run 1, a snapshot expansion returned only a price; the next DOM scroll fallback arrived **80.660 s** later. These gaps are observable elapsed intervals, not an attribution of their entire duration to any single internal cause.

Concrete improvements, in priority order:

1. **Expose panel and basket-evidence controls through the adapter.** The panel already has an accessible close label and is injected by the CLI alongside `adapter.js`; adding another panel would not address the failure. Its lifecycle is absent from `glovoBridge`, and full-page snapshots omit it. Add a public `panel.hide()/show()/state()` API, an injection option such as `{panel:false}` or a collapsed mode, and a `prepareBasketScreenshot()` helper that hides/relocates the panel and returns a scoped native basket summary/rectangle. This addresses the actual 74 s / 53 s workflows and eliminates source inspection and custom shadow-DOM code. Keep the human panel available, with placement that avoids the order panel.

2. **Generate operation receipts and reports mechanically.** Final checks/reporting consumed 93 s / 90 s, including approximately 71 s / 70 s after each agent's declared browser-task end. That phase accounted for **4,608 / 4,226 output tokens**, about 42% / 40% of all generated output. The bridge can capture timestamps, query results, selected options, mutation receipts, verification results and screenshot paths and write them directly as JSON. Have the agent supply only brief difficulty notes. This is benchmark/workflow overhead, separate from shopping latency.

3. **Add `addMany` and exact-line `removeMany`.** Each agent used eight mutation tool turns. Two batch calls would eliminate six model round trips. The observed gaps between those individual writes total **20.482 s** in run 3 and **19.747 s** in run 4; these are opportunity sizes, not measured savings from an implemented batch API. Prevalidate the entire batch, execute native SDK writes sequentially, and return one final basket plus per-item receipts. Preserve the existing mutation lock and unknown-outcome behavior. Cleanup should use receipts for the items added, rather than indiscriminately clearing a user's basket.

4. **Add compact `searchMany` results.** Run 3 already batched four searches into one tool turn, demonstrating that transport batching is possible now. Run 4 unnecessarily used four turns, creating 7.293 s of inter-call gaps. A supported method makes grouping discoverable and scans the store catalog once. Return compact candidates and full options only for the selected product. In run 4, McChicken alone returned **5,044 characters**, largely because it also included all customization groups for the unrequested McZestaw meal. All four search outputs totaled 8,026 characters. Both standalone and meal candidates are legitimate, but the exact-name match can be explicit and the unused meal options can be omitted initially.

5. **Improve matching with ranked exact matches, aliases, then typo tolerance.** There was no failed product search in either adapter transcript. The existing implementation already handles case, Polish diacritics, trademark symbols and word-order-independent substring terms. Neither run searched the original English `chocolate shake`; the agent prompt supplied `Shake o smaku czekoladowym`. Consequently this benchmark does not measure translation or misspelling handling. English/Polish aliases would address that untested input more directly than edit-distance matching alone. Add fuzzy fallback for typos such as `mcchiken`, while retaining exact-match priority and distinguishing single burgers from meals. Return match type/confidence and candidates on ambiguity rather than silently picking a meal. Test this with the original user phrasing in the next benchmark.

6. **Provide a short agent quickstart and a machine-readable schema.** Each agent read the protocol skill, README and full bridge implementation, producing **22,866 characters** in one result. Reading `panel.js` added another **12,203 characters**. Together those reads were about **48% / 39%** of all returned text in runs 3 / 4. The protocol skill was required by the task; a concise adapter usage surface can replace full implementation reads while keeping that requirement. Public lifecycle controls make the extra panel-source read unnecessary. Mutations can also return compact receipts instead of the progressively repeated basket; the eight write outputs totaled **8,038 characters** in each run.

The proposed methods above are design recommendations; this audit did not change the adapter. The next comparison should retain Luna/xhigh, use original-language queries, collect reports automatically, and measure the shopping/evidence phase separately from final report production. Retest the observed operations before assigning any speedup to the proposed API changes.

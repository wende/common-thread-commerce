Four agents completed the McDonald's basket task sequentially on October 5, 2026. Each used **gpt-6-luna with xhigh reasoning** and a fresh agent context. Runs 1–2 used Glovo's native UI with the adapter absent. Runs 3–4 injected the existing adapter version 0.3.0 and used its product search and basket methods. The adapter files stayed unchanged throughout.

Every run added one McDouble, one standalone McChicken®, one chocolate shake with **Mały** and **Kubek (opłata SUP)**, and one Ciastko Jabłkowe. Each photographed the native four-item basket, verified the displayed total of **63.90 PLN**, removed all four, and photographed the empty basket. All eight screenshots were visually inspected. No order was placed.

| Run | Method | Agent runtime | Total tokens, including cache | Uncached input + output | Basket | Cleanup |
|---|---|---:|---:|---:|---|---|
| 1 | UI only | 17m08s | 7,188,978 | 213,746 | [Screenshot](/Users/wende/projects/shopping-assistant/experiments/glovo/benchmark/run-1-ui-basket.png) | [Empty](/Users/wende/projects/shopping-assistant/experiments/glovo/benchmark/run-1-ui-empty.png) |
| 2 | UI only | 11m42s | 6,193,301 | 166,293 | [Screenshot](/Users/wende/projects/shopping-assistant/experiments/glovo/benchmark/run-2-ui-basket.png) | [Empty](/Users/wende/projects/shopping-assistant/experiments/glovo/benchmark/run-2-ui-empty.png) |
| 3 | Adapter | 4m36s | 2,136,179 | 78,707 | [Screenshot](/Users/wende/projects/shopping-assistant/experiments/glovo/benchmark/run-3-adapter-basket.png) | [Empty](/Users/wende/projects/shopping-assistant/experiments/glovo/benchmark/run-3-adapter-empty.png) |
| 4 | Adapter | 4m21s | 2,248,230 | 82,470 | [Screenshot](/Users/wende/projects/shopping-assistant/experiments/glovo/benchmark/run-4-adapter-basket.png) | [Empty](/Users/wende/projects/shopping-assistant/experiments/glovo/benchmark/run-4-adapter-empty.png) |

Runtime is the logged UTC `task_started` to final `task_complete`, including setup, tool calls, reasoning, and report writing. Run 1 includes an initial stop and resumed turn to clear a pre-existing Big Mac; its four-item task after establishing the empty baseline took **12m04s**. The agents reported browser-task intervals of **11m07s**, **3m09s**, and **2m50s** for runs 2–4. Those intervals have different boundaries from run 1 and are supplementary.

Token counts come from each agent's final cumulative `token_count.total_token_usage`. Total tokens equal input plus output across all calls; repeated cached input is included. Uncached input plus output equals input minus cached input plus output. Reasoning tokens are already included in output and must not be added again. Coordinator usage and final restoration are excluded.

| Run | Input | Cached input | Uncached input | Output | Reasoning within output |
|---|---:|---:|---:|---:|---:|
| 1 | 7,143,298 | 6,975,232 | 168,066 | 45,680 | 28,374 |
| 2 | 6,161,969 | 6,027,008 | 134,961 | 31,332 | 18,515 |
| 3 | 2,125,103 | 2,057,472 | 67,631 | 11,076 | 5,226 |
| 4 | 2,237,664 | 2,165,760 | 71,904 | 10,566 | 5,313 |

The adapter runs averaged **4m28s** versus **14m25s** for UI runs: 69.0% less elapsed time in this sample. Average total tokens fell 67.2%; average uncached input plus output fell 57.6%. This is a descriptive comparison of two runs per method in a fixed order; run 1's preparation is included in these averages.

The agents encountered these difficulties:

- **Run 1:** Found an existing Big Mac and initially stopped. After establishing an empty baseline, it dealt with a background-tab lookup failure, truncated accessibility snapshots, required shake choices, and removal selectors matching both product cards and the basket. It scoped later removals to the native order panel. [Detailed report](/Users/wende/projects/shopping-assistant/experiments/glovo/benchmark/run-1-report.json).
- **Run 2:** Accessibility snapshots omitted the shake configuration modal and lower menu entries. It used screenshots and DOM inspection to find visible controls and verified every change in the native order panel. No mutation retry was needed. [Detailed report](/Users/wende/projects/shopping-assistant/experiments/glovo/benchmark/run-2-report.json).
- **Run 3:** The initial accessibility snapshot was truncated. The adapter panel also overlapped the native basket; closing only that panel allowed a clear screenshot while retaining the adapter API for cleanup. No timeouts or mutation retries occurred. [Detailed report](/Users/wende/projects/shopping-assistant/experiments/glovo/benchmark/run-3-report.json).
- **Run 4:** Closed the overlapping adapter panel for the screenshot. Noted that shake metadata lists a 0.30 PLN cup price impact while Glovo's displayed shake price and basket total did not include it. Preserved the observed total. No timeouts or mutation retries occurred. [Detailed report](/Users/wende/projects/shopping-assistant/experiments/glovo/benchmark/run-4-report.json).

Each agent disabled focus emulation when finished. After all four runs, the coordinator restored the original **Big Mac® ×1**, with no customizations. A fresh server read and [native basket screenshot](/Users/wende/projects/shopping-assistant/experiments/glovo/benchmark/restored-original-basket.png) confirmed that it is the sole remaining item, priced at 26.90 PLN. The adapter API remains available in the open Chrome tab.

Exact timestamps and telemetry are saved in [measurements.json](/Users/wende/projects/shopping-assistant/experiments/glovo/benchmark/measurements.json), and the numeric table is available as [results.csv](/Users/wende/projects/shopping-assistant/experiments/glovo/benchmark/results.csv). [config.json](/Users/wende/projects/shopping-assistant/experiments/glovo/benchmark/config.json) records the conditions and adapter hashes; [restoration.json](/Users/wende/projects/shopping-assistant/experiments/glovo/benchmark/restoration.json) records the final basket state.

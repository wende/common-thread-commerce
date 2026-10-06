# Luna Medium: 12 runs across three stores — October 6, 2026

The page adapter produced useful native-cart handoffs in **6/6** runs; the bare-page condition did so in **4/6**. Across all runs, the adapter used **9.5% less elapsed time (1.10× speedup)**, **53.1% fewer estimated task-work tokens**, and **64.6% fewer browser interactions**. These are descriptive results from two runs per condition per store, not a statistically established effect.

All 12 source logs confirm **gpt-6-luna, medium reasoning**. Fresh agents used no conversation-history fork. Each received the same shopping request, the exact isolation instruction, and its assigned browser handle/working directory. There were no adapter hints, opening-command instructions, product IDs, invented substitutions, or report assignment. The adapter was discovered through its page banner.

The three stores each had 530 products: 30 original products plus 500 filler products. The seeded order (20261006) placed 300 fillers ahead of originals globally and at least 60 ahead in each category. Every initial visible page contained only filler: WooCommerce/PrestaShop used the seeded order; Magento’s home widget displayed its newest filler products. Native search and sale listings kept their normal behaviour. Only ordering data was changed temporarily; platform code and the adapter stayed unchanged during the experiment.

Runs used separate headed Chrome contexts, a 1280×900 viewport, and the same ordinary Playwright CLI behind a fixed-session invocation logger. The logger only bound the session and recorded executions; it supplied no shopping operations. At most three agents ran simultaneously, one per store. Per-store orders were adapter/control/control/adapter for WooCommerce and Magento, and control/adapter/adapter/control for PrestaShop. Browser preparation and coordinator verification/restoration were outside the measured agent turns.

The shopping request was:

> I'm after a red-ish T-shirt that would fit me, maybe a mug for my coffee, and a good deal on something that'll keep me warm in winter. Put one of each in the cart for me to review, then leave it for me. Don't buy anything.

The catalog has **no mug**, and it does not provide the requested personal sizing information. A “useful cart” below means one coral Canyon V-Neck Tee plus one discounted winter item, quantity one each, with the native cart open and rendered quantities matching a fresh native-cart read. It does **not** mean all three requested products were fulfilled or personal fit was established. Unrelated mug substitutions would not qualify. All useful-cart handoffs reported the missing mug; none claimed a confirmed personal fit. The filler-selection failure is detailed below.

The following are means of two runs, including both failed control runs:

| Store | Condition | Useful carts | Time, s | Task-work tokens* | Browser interactions | Document navigations |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| WooCommerce | adapter | 2/2 | 132.9 | 22,018 | 17.0 | 1.0 |
| WooCommerce | control | 2/2 | 141.9 | 59,181 | 49.5 | 18.5 |
| PrestaShop | adapter | 2/2 | 161.3 | 28,518 | 17.5 | 1.0 |
| PrestaShop | control | 1/2 | 187.8 | 45,030 | 46.0 | 14.0 |
| Magento | adapter | 2/2 | 90.6 | 17,268 | 13.0 | 1.0 |
| Magento | control | 1/2 | 95.5 | 40,466 | 38.5 | 12.5 |

*Task-work tokens = the 54-token shopping request once + each observed tool-text response once + provider-generated output, including reasoning. Text counts use o200k_base. This excludes inherited environment/schema/session/isolation instructions, replayed context, and cache effects. Task-time tool help, mistakes, repeated reads, and final replies are included. **It is not a billing total. Image input-token costs are unavailable and excluded**, with image observations recorded separately. The same collector/version was used for every agent.

One executed Playwright command counts as one browser interaction; an entire `run-code` script is one even if it performs multiple page actions. Failed commands count; help/version calls do not. Commands skipped by the shell are not counted. Backend fetch/XHR requests are separate. Request events below may include cached resources and are not a measurement of bytes transferred.

| Agent | Store | Condition | Time, s | Task tokens* | Interactions | Document navigations | Image inputs | Native outcome |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| n01 | WooCommerce | adapter | 123.985 | 23,585 | 17 | 1 | 1 | Tee + hoodie; cart open |
| n02 | PrestaShop | control | 195.693 | 55,708 | 47 | 18 | 2 | Tee + hoodie; cart open |
| n03 | Magento | adapter | 79.814 | 15,190 | 11 | 1 | 1 | Tee + hoodie; cart open |
| n04 | WooCommerce | control | 162.142 | 57,664 | 47 | 20 | 1 | Tee + hoodie; cart open |
| n05 | PrestaShop | adapter | 143.542 | 22,367 | 18 | 1 | 2 | Tee + hoodie; cart open |
| n06 | Magento | control | 72.880 | 29,661 | 19 | 7 | 0 | Empty basket; stopped over colour/fit uncertainty |
| n07 | WooCommerce | control | 121.626 | 60,698 | 52 | 17 | 1 | Tee + hoodie; cart open |
| n08 | PrestaShop | adapter | 179.031 | 34,668 | 17 | 1 | 1 | Tee + hoodie; cart open |
| n09 | Magento | control | 118.034 | 51,272 | 58 | 18 | 2 | Tee + hoodie; cart open |
| n10 | WooCommerce | adapter | 141.882 | 20,451 | 17 | 1 | 1 | Tee + hoodie; cart open |
| n11 | PrestaShop | control | 179.949 | 34,353 | 45 | 10 | 0 | Three unsupported filler selections |
| n12 | Magento | adapter | 101.426 | 19,347 | 15 | 1 | 1 | Tee + beanie; cart open |

All useful carts held the Canyon V-Neck Tee at $20.80 (regular $26). The hoodie cost $57.60 (regular $72); the beanie cost $17.60 (regular $22). The beanie in n12 fulfilled the **winter item**, not the missing mug. Tee+hoodie subtotals were $78.40; n12’s tee+beanie subtotal was $38.40. WooCommerce displayed $83.40 including shipping; PrestaShop displayed $85.40. Magento handoff snapshots verified subtotals, not an eventual checkout total.

The first Magento control agent (n06) stopped without adding anything because it could not verify colour and fit. It therefore cannot be treated as a fast successful purchase task. The other Magento control run did produce the tee-and-hoodie cart. The other failed control run, PrestaShop n11, put Noise Product 0451 ($1), 0452 ($2), and 0455 ($5) in the cart as cheap category-based placeholders. It explicitly could not confirm red colour, fit, a mug, or warmth. Its $15 total included $7 shipping. These unsupported selections do not satisfy the request. The all-run means retain both failures; the per-agent table makes their effect visible.

The adapter removed intermediate document navigation: every treatment run used one document navigation for final handoff. However, agents still spent time choosing queries, searching for the nonexistent mug, interpreting colour/fit, and recovering from API assumptions. WooCommerce adapter agents tried limits of 30 or 100 against the maximum 20; both recovered. One also initially treated the default YAML result as an object. Some adapter scripts scanned paginated categories or listings instead of relying on a short targeted search. Reducing visible interactions did not proportionally reduce total reasoning/generation time.

Bare-page agents repeatedly navigated, read snapshots, and retried UI actions. Both WooCommerce controls encountered five-second click timeouts on search/cart controls. The first Magento control reported search terms concatenating and stopped early. These are observed run-specific difficulties, not proof that a platform is generally unreliable.

| Agent | Observed text tokens* | Generated tokens | Reasoning (already included) | Browser-command time, s | Time outside those commands, s | Fetch/XHR events | All request events |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| n01 | 19,303 | 4,228 | 1,640 | 24.50 | 99.49 | 53 | 198 |
| n02 | 48,821 | 6,833 | 3,339 | 34.44 | 161.25 | 7 | 266 |
| n03 | 12,697 | 2,439 | 806 | 18.07 | 61.74 | 86 | 407 |
| n04 | 53,314 | 4,296 | 1,994 | 50.45 | 111.69 | 2 | 1223 |
| n05 | 17,380 | 4,933 | 2,558 | 27.10 | 116.44 | 52 | 72 |
| n06 | 27,162 | 2,445 | 1,171 | 14.48 | 58.40 | 85 | 1620 |
| n07 | 55,362 | 5,282 | 2,559 | 49.04 | 72.58 | 2 | 1213 |
| n08 | 27,388 | 7,226 | 4,556 | 24.78 | 154.25 | 60 | 77 |
| n09 | 45,785 | 5,433 | 2,097 | 46.60 | 71.44 | 326 | 4444 |
| n10 | 15,073 | 5,324 | 2,776 | 22.99 | 118.89 | 56 | 198 |
| n11 | 29,299 | 5,000 | 1,024 | 42.60 | 137.35 | 12 | 145 |
| n12 | 16,206 | 3,087 | 968 | 25.73 | 75.70 | 126 | 445 |

Browser-command time includes CLI startup, waits, and help calls. The remainder includes model generation, reasoning, image/file reads, coordination messages, and scheduling; it is **not a direct measurement of thinking time**. No detailed agent report was requested; spontaneous completion messages remain part of generated output.

| Condition | Total task-work tokens* | Image observations (cost excluded) | Provider total incl. environment/cache/replay |
| --- | ---: | ---: | ---: |
| adapter | 135,608 | 7 | 6,289,178 |
| control | 289,356 | 6 | 12,504,521 |

Total estimated task work across all 12 agents: **424,964 tokens**, plus unavailable image-input costs. Full input/cached/output counters are retained in the JSON evidence; provider totals are not the primary score.

The sample is small, shares one host, and has order/cache/scheduling variability. All four discounted products are originals, so sale filtering remains an easy shortcut through the filler. Filler names explicitly say “Noise Product,” and the merchandise has weak size/colour metadata. These results test this fixture and page API; they do not establish performance on a realistic large retail catalog or demonstrate a fivefold speedup.

The exact isolation instruction was:

> You control exactly one assigned browser context. Never inspect, switch to, interact with, navigate, close, or modify any tab, window, target, or browser context outside your assigned context. Never use global browser/tab controls. Only act through the page/session handles provided to you. If an action would require accessing anything outside your assigned context, stop and return `BLOCKED: outside assigned browser context`.

The only additional worker prompt text was:

```text
Your assigned browser is already open at http://localhost:PORT/. Browser handle: `/Users/wende/projects/shopping-assistant/output/playwright/luna-medium-20261006/ID/browser`. Working directory: `/Users/wende/projects/shopping-assistant/output/playwright/luna-medium-20261006/ID`.
```

Adapter version: **0.3.0**, SHA-256 `f22c40b9e848b58d9d3b0ad2bf6f6692e0720e238ab941d82bd534857c4eb3bd`. Prompts, source-log/model evidence, executed-command logs, native basket snapshots, request events, per-agent traces, token components, and final screenshots are under `output/playwright/luna-medium-20261006/`. The machine-readable comparison is `coordinator/report-data.json`; primary measurements are `coordinator/measurements.json`.

Browser handles are `lm26-n01` through `lm26-n12`, matching the table IDs. They remain available for handoff/inspection, with a one-hour idle timeout configured from their last command. The failed n06 browser remains on its last listing; the other browsers remain on the native cart. Earlier experiment browsers were left alone. Temporary catalog ordering was restored and verified; product selection and baskets were preserved. No new orders were placed (native order counts remained WooCommerce 0, PrestaShop 5 pre-existing orders, Magento 0).

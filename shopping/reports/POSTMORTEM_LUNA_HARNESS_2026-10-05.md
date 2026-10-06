# Postmortem: Luna shopping harness tested the wrong architecture

Date: 2026-10-05. Status: retired and removed at the user's request. This document supersedes the removed harness reports and performance summaries. It does not supersede or invalidate the separate Glovo experiment.

## Intended experiment

Test whether JavaScript added to a shop's page makes real shopping tasks easier for an agent. The addition should expose product discovery, useful product information, basket operations and verification through the page, using its real session. The agent should reach that interface using its normal browser tools and leave the same browser ready for the user. Platform source modifications were excluded from the research experiment; temporary page injection was compatible with that constraint.

The repo already contains an example of this architecture in [the Glovo adapter](../../glovo.js): injected page JavaScript, an exposed `window.glovoBridge`, calls into the page's existing cart SDK, and a DOM command form usable through browser tools. That implementation and its [experiment report](../../glovo/reports/EXPERIMENT_REPORT_2026-10-05.md) remain intact.

## What I built instead

The initial request for isolated concurrent workers led to a Node.js runner launching `codex app-server --stdio` and separate Playwright contexts. That was test infrastructure. I then put the shopping adapter inside the runner and registered a custom `assigned_shop` dynamic tool with each agent.

The resulting path was:

`agent → injected Codex tool → local Node.js broker/adapter → store HTTP APIs`

The required path was:

`agent → ordinary browser tools → adapter injected into the shop page → native page APIs/SDK → same browser basket`

The host-side adapter shared the browser's cookies, but sharing cookies does not make an adapter page-provided. The worker never had to discover or invoke a website addition. The browser tool interface also omitted JavaScript execution, a self-imposed restriction that made the intended page interface inaccessible through that route.

When the user exposed this mismatch, I initially suggested a proxy. That added another unnecessary component: the Glovo experiment already demonstrated a direct injection approach.

## Failures and causes

1. **The integration boundary was wrong.** I optimized the benchmark's custom tool instead of the website addition. Tests exercised capabilities supplied by the controller that a visiting agent would not receive from the shop.
2. **The scale fixture did not initially test discovery.** Adding 500 noise products left the useful original 30 on PrestaShop's first listing page. The adapter fetched that page; the agent selected from it. A correct basket was misrepresented as evidence that the larger-catalog task worked.
3. **Success criteria were too narrow.** Cart identity, quantity, price and handoff checks did not establish discovery coverage, relevance, fit, colour or successful use of a page-provided API.
4. **Optimizations removed work from the task without establishing generality.** Returning the entire small catalog, suppressing search/detail calls and removing a final report reduced measured work. Those changes did not demonstrate a scalable website adapter, and changing multiple conditions limited attribution of the speed differences.
5. **The attempted correction still retained the wrong architecture.** Scattering the products and adding bounded native search fixed the first-page shortcut, but the search implementation remained in the host process. That last run proved bounded host-side retrieval, not the requested integration.
6. **Communication obscured the implementation.** Repeated explanations such as “the agent calls the adapter” did not identify the actual mechanism: Codex emitted an `item/tool/call` message over stdout, the harness executed JavaScript, and a result was returned over stdin. The user had to repeatedly ask for that distinction.
7. **I failed to use the existing repo experiment as the reference.** I should have inspected the Glovo injection pattern before extending this architecture or proposing more infrastructure.

These were design, evaluation and communication mistakes by the implementing assistant. Luna executed the tools and instructions it was given; changing the worker model would not repair this boundary.

## What the measurements do and do not show

Recorded timings and token counts describe the removed harness. They are not fabricated, but they do **not** validate a website-provided adapter. The earlier small-catalog results are observations about those specific tool and reporting configurations. Claimed speedups must not be carried forward as product evidence or pooled with Glovo's browser-based runs.

Five key observations:

| Condition | Observed result | Valid interpretation |
| --- | --- | --- |
| Browser-only vague task, six workers | 603.218 s run wall time; four handoffs, two timeouts | Baseline for the restricted harness browser tools |
| First host-side API tools, six workers | 286.127 s; six handoffs, five strict passes | Host-side tools changed this workflow; one final report failed the strict grade |
| Catalog-once plus removal of final reports, six workers | 77.820 s; six passes | A small-catalog and reduced-reporting configuration; not a large-store architecture result |
| First 530-product PrestaShop run | 99.566 s worker time; 53,104 tokens excluding cache; selected from initial 30 | Cart/handoff success only; invalid as a buried-product discovery test |
| Scattered 530-product PrestaShop run | 89.631 s worker time; 62,619 tokens excluding cache; 41 unique products returned; selected positions 502, 303, 65 | Bounded native search worked through the host adapter; still not page-injected integration |

The final run used three search batches containing 25 terms, returned 94 records including duplicates, and made no manual page interactions. “Zero manual page interactions” was not evidence of a better website interface: the host process performed the commerce requests. Native search also produced weak matches, so returning a search hit did not establish relevance. The additional discovery assertions corrected one grading defect without repairing the architectural defect.

The following ledger was transcribed from the nine local controller reports before their deletion. It records **38 worker trials** and **12,308,822 total tokens including cached input**. Tokens excluding cached input across those reports: **1,703,510**. This is recorded worker usage only: it excludes coordinator conversation, development work and Glovo; it is not a monetary cost estimate. Run wall times include concurrent workers and must not be interpreted as per-worker time. Cached input is already included in input; reasoning output is already included in output.

| Run ID | Condition | Workers | Recorded grade | Run wall seconds | Tokens incl. cache | Tokens excl. cache |
| --- | --- | ---: | --- | ---: | ---: | ---: |
| 2026-10-05T12-19-43.108Z-716d2502 | Initial fixture validation (failed) | 4 | FAIL | 30.414 | 64,369 | 35185 |
| 2026-10-05T12-20-36.678Z-8d965ebb | Fixture validation | 4 | PASS | 45.439 | 197,689 | 67129 |
| 2026-10-05T12-22-51.471Z-a0329dd1 | Repeated fixture validation | 4 | PASS | 57.083 | 198,313 | 63657 |
| 2026-10-05T12-36-29.224Z-698a8251 | Initial three-store task | 6 | PASS | 78.980 | 881,965 | 218413 |
| 2026-10-05T13-21-59.909Z-4ffa6cab | Vague-task browser baseline | 6 | FAIL | 603.218 | 8,611,561 | 744937 |
| 2026-10-05T14-54-34.884Z-9624220f | Host-side commerce tools | 6 | FAIL | 286.127 | 1,316,061 | 287965 |
| 2026-10-05T15-58-06.510Z-1eab69da | Catalog-once + no final report | 6 | PASS | 77.820 | 541,189 | 170501 |
| 2026-10-05T20-44-30.020Z-b1b7d4f9 | 530 items, useful products on page one | 1 | PASS | 104.143 | 292,976 | 53104 |
| 2026-10-05T21-00-35.838Z-7c76eddc | Scattered PrestaShop + host-side search | 1 | PASS | 91.335 | 204,699 | 62619 |

## Cleanup performed

- Stopped the four retained Luna harness processes, allowing their own shutdown handlers to close their browser contexts and app-server children and remove their temporary Codex homes. Unrelated processes were not targeted.
- Removed the entire `experiments/agent-browser/` tree: runner, brokers, host-side adapters, fixtures, tests, helper scripts, local dependencies, lockfile, archived measurements, prompts, reports and infographic.
- Removed `output/playwright/agent-browser/`: generated session/cookie state, screenshots, protocol logs, raw reports, task files and fixture evidence. No replacement archive of those outputs was created.
- Restored 1,060 PrestaShop category/product positions from the saved pre-experiment snapshot, after checking that current positions still matched this experiment's changes. Verified the restored first listing page and retained 530-product count. Removed the scattering helper.
- Removed root README links and instructions referring to the retired harness, and removed its `.gitignore` exception. This postmortem is the retained explanation.
- Preserved the three native stores, Docker setup, catalog/import/verification support and the separately requested 500 image-free noise products per store. Preserved Glovo's files unchanged. The surviving generic noise catalog alone is not a valid future discovery fixture.

Committed historical harness files remain recoverable from Git commit `c8ecc63`; history was not rewritten. Uncommitted harness changes and generated run outputs were intentionally removed, rather than kept as an alternative implementation. Cleanup is a working-tree change; no new commit or push was made.

## Requirements for the replacement experiment

Use the Glovo pattern as the starting point: a self-contained script injected into each assigned page. The page addition owns search, product/variant information, basket operations and state verification. It should expose a small documented page API and a discoverable browser-accessible command interface. Browser execution capabilities determine whether an agent calls a method directly or uses the DOM command form; both routes must reach the same in-page implementation.

The coordinator may inject the script, isolate sessions, collect measurements and independently verify the result. It must not supply shopping-specific agent tools, execute shopping operations outside the page, or leak fixture answers. Browser session identity must survive all operations and the handoff. Reinjection/navigation behavior must be explicit.

Before measuring speed:

1. Demonstrate one complete search/add/verify flow through the injected page code using ordinary browser tools, with no host shopping bridge.
2. Confirm that the agent discovers the documented interface; record any adapter-specific instructions supplied in its prompt as part of the condition.
3. Validate a fixture with desired items genuinely outside the initial view and plausible competing products. Test bounded retrieval, variants, unavailable items and incomplete evidence. Do not supply a full catalog or predetermined candidate list to the worker.
4. Compare UI-only and injected-adapter conditions with the same shopping task, browser tools, reporting requirements and session setup. Account for injection/setup time separately and state what the comparison excludes.
5. Grade task correctness, discovery/relevance and session handoff separately. Attribute token/time differences only to controlled changes, with repeats and uncertainty.

No replacement harness or adapter was built as part of this cleanup.

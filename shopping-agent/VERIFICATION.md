# Shop Agent 0.3.0 verification

Verified October 6, 2026. This is implementation verification, not a new model benchmark.

- **24 adapter contract tests and 8 token-accounting tests passed.** Added coverage for filtered pagination without skipped candidates, bounded empty results, price/sale filter composition, per-query failures, larger detail batches, YAML output/escaping, and raw-object batching. Accounting tests prove invariance to inherited-context size and cache changes, retain the first shopping request, avoid double-counting reasoning, scope multiple turns, and mark unavailable image/usage costs.
- **All three native stores passed live integration checks** with the final script: bounded discovery beyond the first catalog page, cached repeated queries, add three products, replay without duplication, update/remove, and restore the original basket.
- YAML from help, search, details, cart verification, and the accessible command form parsed with PyYAML 6.0.3. Nested values, empty containers, Unicode/control characters, and scientific-notation numbers round-tripped. The shipped script has no YAML dependency.
- Seven comparison IDs paginated into six plus one on every store. The accessible request form still accepts JSON and returns YAML. No image evidence is claimed for absent images or native placeholders.
- Composed `hoodie` + `Hoodies` + sale + in-stock filtering took **2 native requests on WooCommerce, 4 on PrestaShop, and 2 on Magento** in the live fixture/cache state. Cheap listing filters precede stock-detail fetches, so irrelevant filler does not trigger individual product-detail requests. These are implementation request counts, not agent speed measurements.
- PrestaShop sale-plus-text now uses the native sale listing and locally checks text, instead of scanning broad text results for sale items. Category-plus-text uses bounded local word matching within the native category listing. Effective matching mode and coverage scope are exposed.
- `cart.finish()` was checked on all three stores: it opened the same native cart, rendered/native verification confirmed the selected item, and cleanup restored an empty test basket. Woo Blocks remains explicitly `unsupported-markup` before navigation; it verified after the cart rendered.
- All verification used a separate finite-timeout browser session. Test baskets were restored and that verification browser was closed. Earlier agent handoff browsers were not touched. No platform source, catalog, or backend service was changed.

Evidence: `output/playwright/shop-v3-check/coordinator/live.json`, `handoff.json`, and `verified.json` (final script SHA-256). Query-cache and local-filter limits remain explicit; this does not establish semantic absence, fit, configurable-product support, or better model task completion.

The corrected prompt and primary task-work token metric are documented in [benchmark accounting](../benchmarks/shopping/README.md). Retrospective Sol accounting is 23,665 versus 46,334 estimated task-work tokens, excluding unavailable image-input costs. That uses the old run’s actual prompt and does not fix its invalid mug substitutions. No new Luna/Sol benchmark was run in this update.

## Previous v0.2.0 verification

Verified on October 6, 2026 (Europe/Warsaw). The earlier v0.1 record is preserved below.

- **18 contract tests passed.** Added tests for public reference persistence across reload with fresh stock checks, category-name resolution, and JavaScript callback batching with compact output.
- **PrestaShop live check passed:** native sale listing, category names, images and full details, comparison rendering without navigation, reload and reuse of discovered IDs, add/verify/remove, and final empty test cart.
- **WooCommerce and Magento live read checks passed:** native categories, category-name lookup, product details with image URLs, and comparison rendering. Screenshots were inspected on all three stores. This round did not repeat their unchanged cart-write flows.
- The drop-in file now includes `categories()`, `view({ids})`, and `run(async shop => ...)`. No store source edits or runtime backend were added.
- Script execution uses ordinary page callbacks through the browser's JavaScript tool. No code-string evaluation or CSP `unsafe-eval` requirement was added. The callback is not a security sandbox.
- Required variants remain a native-page fallback. The local fixtures have no variants. Woo Blocks cart verification can still require opening the rendered cart.

Evidence: `output/playwright/page-adapter-retry-20261006/coordinator/check-initial.json`, `check-flow.json`, `check-other-stores.json`, and the three comparison screenshots in its `check/` directory. Agent timings are recorded separately from these implementation checks.

## Previous v0.1.0 verification


Verified on October 5, 2026 against the three local Common Thread stores, each containing 530 products. This records implementation/integration checks; no Luna agents were launched and no performance improvement is claimed.

## Results

| Check | WooCommerce / Storefront + Blocks cart | PrestaShop / Classic | Magento / Luma |
| --- | --- | --- | --- |
| Automatic platform detection | Pass | Pass | Pass, including after initialization removes `data-mage-init` attributes |
| Bounded native search and next-page retrieval | Pass | Pass | Pass |
| Find Noise Product 0250 beyond the first 20 noise-search results | Pass, ID 314 | Pass, ID 299 | Pass, ID 280 |
| Repeated query reuses the page cache | Pass | Pass | Pass |
| Batch-add three selections to native session basket | Pass | Pass | Pass |
| Identical mutation replay does not add again | Pass | Pass | Pass |
| Fresh native cart agrees with structured line identities/quantities | Pass on rendered Blocks cart | Pass from native cart HTML | Pass from native cart HTML |
| Change quantities, remove the added line, restore previous basket | Pass | Pass | Pass |

The repeatable [live integration script](../tests/shop-agent.live.js) searches for Harbor, Trail Pocket, and Noise Product 0250. It obtains IDs exclusively through the injected API. The filler search is a check of retrieval beyond the first page, not a realistic shopping-quality benchmark or proof that the vague three-product task is solved.

The initial manual checks started with empty baskets and added three items on each store. The repeatable checks then ran against those nonempty baskets: they incremented two existing lines, added another product, and restored the prior quantities. After verification, the initial test additions were also removed. All three test baskets were confirmed empty. Catalog records, shop source code, and the separate in-app browser's existing basket were not changed.

Additional live checks:

- The discovery message appears at the beginning of the page's accessibility tree.
- The visible JSON command form returned help and successfully added an item to Magento's actual basket; its quantity was restored afterward.
- A normal external script tag loaded the single file on PrestaShop. Two reloads produced one discovery panel each and preserved the basket. A temporary browser document-start hook simulated a shared layout containing the tag; it was removed after the check. No platform template was edited.
- A cart addition followed by reload and replay of the same request ID retained quantity two, rather than adding a third item. The test restored quantity one afterward.
- `cart.open()` navigated to the native PrestaShop cart in the same tab. After reinjection, native verification passed with the same three lines.
- A temporary localhost static server used to test the script tag was stopped after verification. The shipped implementation does not need that server.

## Automated checks

**15 tests passed** with `node --test tests/shop-agent.test.mjs`. The tests exercise the public interface against a native Store API contract stub; actual theme rendering and platform endpoints are covered by the live checks above.

Coverage includes no-network installation, namespace preservation, unsupported stores, Magento detection after initialization, paging and concurrent query deduplication, invalid method/argument rejection, replay across reload, options/stock/quantity validation before writes, stale revision rejection, uncertain responses and reconciliation, interrupted finalization, unrelated basket changes, quantity updates/removal, unavailable session storage, and explicit store rejection without retries.

JavaScript syntax checks and `git diff --check` passed. Existing unrelated CRLF normalization warnings in the catalog CSV do not concern this addition.

## Corrections found during verification

1. WooCommerce Blocks initially serves an empty-cart template even when the browser has items. The verifier now distinguishes unrendered placeholders from the actual rendered cart, and waits briefly for asynchronous native updates. A missing verification surface produces an unsupported result rather than a pass.
2. Magento Luma initially marks its add button disabled until JavaScript initializes. Fresh detail validation uses native stock state and the presence of the purchase form, rather than treating that initial disabled attribute as out-of-stock.
3. Magento consumes its initialization attributes after boot. Detection now also recognizes its registered native modules.
4. Reconciliation handles a reload between the last confirmed cart operation and writing the final journal result without repeating the operation.

## Boundaries

Automatic additions are limited to simple products. Required sizes, colours, bundles, and customizations use the native product page. Live fixtures have no variants; variant behavior has not been demonstrated. PrestaShop and Magento do not currently implement sale/stock search filters, and explicitly reject them instead of silently ignoring them. Prices/totals are native observations, not guarantees about later checkout charges. Native verification checks line identity and quantity, not every tax/price calculation or a visual screenshot.

The next evaluation must separately establish discovery by an uninformed Luna agent, task quality, timing, token usage, and handoff in isolated contexts. It must use the same prompt and ordinary browser tools in control and treatment. The existing catalog order still needs a fair buried-product fixture for that benchmark. None of the removed host-side harness scores applies to this implementation.

Local evidence is under ignored `output/shop-agent/`: three `*-live.json` reports, `command-form.json`, `script-tag.json`, `reload-replay.json`, `handoff.json`, `cleanup.json`, and a screenshot of the injected interface with the native PrestaShop basket. Those outputs contain no browser cookie/storage export. The screenshot shows test additions before their final cleanup.

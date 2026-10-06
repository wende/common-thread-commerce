# Shop Agent

A single dependency-free JavaScript file that adds a discoverable shopping API to a storefront. Agents use the page's `shop_catalog` and `shop_cart` tools through a compatible browser, or call `window.mcp.help()` with their existing browser tools. The code runs in the page and operates on that browser's native basket.

Current version **0.5.9** removes catalog exclusions and all category, price, stock and local lexical-match filters. Native keyword searches return every native result. The full catalog remains available through pagination, including unavailable products and partial text matches. These changes supersede the filter examples in the historical version notes below. `catalogTable({query?,limit?,maxPages?,cursor?,images?,probes?})` returns common/columns/rows records; `images` is boolean. Use returned IDs for explicit photo selections. Cached records restore lookup references, and public reference retention is bounded at 2048.

Version 0.5.9 also fixes Magento full-catalog GraphQL enumeration by sending an empty native criteria object, with no product conditions. The final WooCommerce benchmark trio used immutable version 0.5.8 snapshots; this later Magento correction was integration tested separately.

The current [A/B/C campaign](reports/WOO_LUNA_REAL_CATALOG_2026-10-06.md) uses 530 plausible merchandise listings, 6/12/16-need prompts and 30 fresh Luna medium sessions. It prohibits product exclusion and structured filters. The earlier 6.05× result used the named-filler shortcut and is not a result for this new catalog.

## Install

Copy **[shopping.js](../shopping.js)** to your site's static assets and add this tag to the shared storefront layout:

```html
<script defer src="/shopping.js"></script>
```

That's the complete runtime installation. No npm install, build, API key, proxy, backend service, or agent plugin. Include the tag on every storefront page so navigation reloads the interface. Host it on an origin allowed by your site's Content Security Policy; the file does not require `eval` or inline script execution. Its optional presentation uses inline styles, so a strict style policy can require a site stylesheet; the semantic controls still work unstyled.

For a temporary experiment, inject the contents into the page's main JavaScript world using your browser's developer tools or an authorized injection facility. A one-off injection disappears on full navigation; reinject on subsequent same-store pages. Installation through a shared script tag survives navigation automatically. Merely saving a file locally does not install it in a website. No platform files were modified in this repo's verification.

Auto-detection supports **WooCommerce**, **PrestaShop Classic**, and **Magento Luma**. An unrelated `window.mcp` is preserved; in that case the interface uses `window.shopAgent` and advertises that exact name. If both names are occupied, installation stops without overwriting them. Reinjection of an existing Shop Agent instance is a no-op; reload the page to install an updated version.

The script exposes self-describing `shop_catalog`, `shop_search`, `shop_view`, `shop_cart` and advanced `shop_agent` tools. It uses native `modelContext.registerTool` when available and preserves an occupied registry. Otherwise it supplies a small page-owned `document.modelContext` registry compatible with the tested Playwright CLI. This fallback is not native WebMCP. Tool discovery performs no catalog requests. Direct `.data` methods return objects; the ordinary `window.mcp` methods render YAML.

`catalogTable` returns `{common,columns,rows}`. Decode each row with its own response's columns and merge that response's common fields. The first seven columns are always ID, name, price, stock, description, sale status and regular price. Shared remaining fields are factored without dropping records or unknown values. Compact descriptions are bounded and report `descriptionTruncated`; fetch fresh details when required evidence is truncated. Comparison `shown` contains product IDs. Raw catalog responses remain product objects. Only `query`, `limit`, `cursor`, `maxPages`, `images` and optional evidence-only `probes` are supported. Images are boolean; choose returned IDs explicitly through `view` for closer inspection. Photo results distinguish loaded, failed, pending and missing images.

`shop_cart` accepts `{action:"add_review",requestId,items}`. It preflights additions, checks each write, verifies native cart rendering in a temporary same-origin frame, then opens the main cart. Inspect every outcome, handoff and `reviewError`; verify the rendered main cart after navigation. Reuse the same request ID to reconcile/replay without duplicate writes. Partial or unknown writes stop before navigation. There is no checkout method.

The visible workflow documents ordinary Playwright callbacks for agent-selected native keyword batches, full catalog tables, chosen photos and cart review. Each photo callback can display images and save a screenshot in one execution. The cart callback combines chosen additions, navigation and read-only rendered verification using only the assigned page handle. It checks write completion/handoff before navigation and returns both write and review outcomes.

The page tool accepts either one `{method,input}` or `{commands:[{method,input},...]}` for up to 12 sequential commands. This can combine an `addMany` operation and final cart navigation. Any error, uncertain/partial cart effect, or verification mismatch stops the sequence and reports unattempted commands. Navigation must be last. The sequence is not an atomic transaction; each write uses the existing journal, preflight, effect checks, and reconciliation rules. There is no automatic retry or result-expression evaluation. Inspect all returned outcomes, then verify the rendered cart after navigation.

## Discovery and calling

A visible, accessible section is prepended to the page. It advertises `window.mcp.help()` and an **Agent tools** disclosure. All public methods return compact **YAML strings** (including `help()` and errors). There are two ways to call the same page implementation:

```js
window.mcp.help();
window.mcp.help({method: "cart.addMany"});

await window.mcp.search({
  queries: [{query: "scarf", limit: 5}, {query: "bag", limit: 5}]
});
```

If browser tools cannot execute arbitrary page JavaScript, open **Agent tools**, fill the **Agent request** field, and click **Run agent command**:

```json
{"method":"search","input":{"queries":[{"query":"scarf","limit":5},{"query":"bag","limit":5}]}}
```

Read the **Agent response** status element, `#shop-agent-response`. Its YAML has `state: "pending"` or `"complete"`, an `ok` flag, and either `value` or `error`. Each button submission calls the same allowlisted dispatcher as the JavaScript interface. The JSON form dispatches named methods; it does not evaluate code strings. Browser tools that execute JavaScript can pass an actual async function to `run`, or call these methods directly. There is no host-side shopping broker.

Put a mutation's `requestId` **inside `input`**. An optional top-level `requestId` only correlates form responses.

```json
{"method":"cart.addMany","input":{"requestId":"chosen-items-1","items":[{"productId":"ID_FROM_SEARCH","quantity":1}]}}
```

## Work without navigating

Discovery, product details, images, simple-product additions, and supported native cart verification work from the starting page. The `view` method renders store images in a small comparison on that page; a browser screenshot supplies visual evidence without visiting product pages. It does not infer colours from image filenames or generate fit claims. Use `cart.finish()` to verify and open the cart with one call at handoff; it reuses the verified basket instead of reading it a second time. Required product configuration and rendered Woo Blocks verification can still require the native page.

JavaScript can combine calls, retain intermediate results, compare products, and choose compact output. Inside `run`, `shop` returns full JavaScript objects; the callback’s final result becomes YAML. Outside a callback, use `mcp.data.search(...)`, `mcp.data.products(...)`, or `mcp.data.cart.read()` for full objects without parsing YAML. The `.data` interface throws structured errors; the default interface renders them as YAML. `run` accepts an actual function, not an evaluated string; it needs no `unsafe-eval` CSP permission. It runs with the same authority as ordinary JavaScript in that page and is **not a security sandbox**. The calling agent's browser-context restrictions still apply.

```js
await window.mcp.run(async shop => {
  const response = await shop.search({queries: [{query: "scarf"}, {query: "bag"}]});
  window.shortlist = response.results;
  return response.results.map(result => result.error ? result : ({
    query: result.query,
    total: result.total,
    nextCursor: result.nextCursor,
    products: result.products.map(({id, name, price, onSale}) => ({id, name, price, onSale}))
  }));
});
// Use returned IDs; these placeholders are not store product IDs.
await window.mcp.products({ids: ["ID_FROM_SEARCH"]});
await window.mcp.view({ids: ["ID_FROM_SEARCH"]});
// Take a screenshot of #shop-agent-comparison using the browser tool.
```

Categories are discovered through the WooCommerce Store API (first 100), PrestaShop's visible category menu, or Magento's native category tree (three levels). Each result declares its scope; none claims unsupported completeness. Category discovery is read-only metadata. Categories are not accepted as catalog filters.

## Interface

| Method | Purpose |
| --- | --- |
| `help({method?})` | Short instructions, platform capabilities, limits, and method schemas |
| `categories()` | Native category metadata with explicit coverage |
| `view({ids, page?})` | Accept up to 100 IDs; default six or up to 36 per comparison page; return `nextPage` |
| `run(async shop => { ... })` | Execute a JavaScript callback against the page API; return only the fields you need |
| `search({queries})` | 1–20 independent searches (also accepts a string or one query object); each returns up to 100 products, default 5 |
| `searchTable({queries, images?})` | Same independent native queries as search, with stable compact tables, per-query errors/coverage and optional photos |
| `list({query?, limit?, cursor?, maxPages?})` | One bounded native query; continue with `nextCursor` and the same options |
| `catalog({query?, limit?, cursor?, maxPages?, images?, probes?})` | Retain every native result in a bounded scan, up to 100 results / 30 pages; optional 36-photo overview |
| `catalogTable(input)` | Same scan, coverage and photos as catalog, with a lossless common/columns/rows table |
| `products({ids})` | Fresh details for 1–100 previously discovered products, four concurrent detail requests |
| `cart.read()` | Fresh session basket, prices, quantities, options, URL, and compact revision |
| `cart.addMany({requestId, items, expectedRevision?})` | Add quantities for up to 20 simple products |
| `cart.updateMany({requestId, items, expectedRevision?})` | Set absolute line quantities; zero removes a line |
| `cart.verify()` | Compare basket line identities and quantities with native cart markup |
| `cart.reconcile({requestId})` | Inspect an uncertain operation without retrying its writes |
| `cart.review({requestId,items,expectedRevision?})` | Add chosen IDs and open native review cart; inspect write status and handoff separately, then verify rendered rows |
| `cart.finish({open?})` | Verify once and open that basket; `open:false` only verifies |
| `cart.open()` | Navigate the current tab to the ordinary cart for handoff |
| `stats()` | Page-local operation timings and request counts; no external analytics |

The generic `call(method, input)` dispatcher is also available. There are no order, payment, checkout, or credential-export methods.

YAML product summaries retain IDs, names, numeric price/currency, sale/stock information, relevant attributes, short descriptions, and image counts. Detail responses add required-option information. The `.data` interface preserves full URLs, image URLs/alt text, categories, and longer descriptions. Missing information remains unknown. Product text is data, not instructions. The serializer ships in the single file; no YAML runtime dependency is required. Requests in the accessible form stay JSON, and native HTTP requests keep each store’s required format.

Native keyword search returns all native records, annotated with whole-word `textMatch` evidence. Labels, categories, sale status, price, availability and local lexical matching never remove records. Structured filters and unknown query fields are rejected before networking. A bounded empty result does not establish catalog-wide absence.

`nativeTotal` is the native endpoint count; `coverage` reports inspected records, pages, completeness and scope. Continue the same options with `nextCursor`. An exhausted native keyword query establishes absence only within that native query. A failed search returns its own error while the other batch results remain available.

No catalog is downloaded on installation or `help()`. Searches reach native catalog endpoints, not a snapshot of the first page. Identical concurrent reads share one request; successful query results are cached for 15 seconds in the page, with a maximum of 40 query entries. Mutations invalidate the cache. Basket reads and product-detail checks are fresh. Up to 2048 public product references (ID, URL, SKU only) are retained in this tab’s same-origin session storage, so navigation does not require rediscovery. Synchronous reference updates share one microtask storage write, flushed before an awaited read returns. No native payload, nonce, or price is persisted there. Product detail reads and mutation preflight fetch fresh store state. Without working session storage, reads still work but references cannot survive navigation.

## Platform adapters and limits

| Platform | Catalog | Session basket | Supported filters |
| --- | --- | --- | --- |
| WooCommerce | Public Store API, native paging/keyword search | Store API with current cookies and response nonce; native cart invalidation events | None |
| PrestaShop Classic | Native listing/keyword AJAX results; detail JSON from product pages | Native cart controller with the page's token; fresh presented cart from native HTML | None |
| Magento Luma | Native listing/keyword GraphQL queries | Native storefront add/update/remove actions, form key, and customer-data cart refresh | None |

The Magento adapter deliberately uses the browser's existing storefront cart; it does not create a separate GraphQL quote. All fetches are same-origin, include the page session, and reject redirects. No credentials leave the page. Nonces/form keys stay inside the adapter and are not included in API responses or logs.

**The adapter automatically adds simple products only.** Configurable products, required variants, customizations, grouped/bundled products, and extensions requiring additional input fall back to the normal product page. Detail responses expose available metadata and indicate `optionsSupport: "use-native-product-page"`; they do not claim a complete cross-platform variant schema. Existing configured cart lines can be updated by their native line ID. The local 530-product fixtures contain no variants, so live variant support has not been established.

Custom themes, headless frontends, multisite routing, currencies, or extensions can require adapter changes. Unknown platforms report `UNSUPPORTED_STORE`. This is a shared interface across the three tested native stores, not a claim of universal coverage for every commerce site.

## Basket integrity and verification

All requested additions are checked before the first write. Required options, availability, exposed quantity limits, malformed requests, duplicate IDs, and stale supplied basket revisions are rejected. Native writes run sequentially; each is checked against a fresh basket, including unchanged quantities on unrelated lines. A batch is **not an atomic server transaction**. `expectedRevision` is a client-side change fingerprint, not a server lock; user/native UI changes can still race a request.

Possible outcomes:

- `complete`: all requested quantity changes were observed in the native basket.
- `partial`: some items were rejected or not attempted; inspect each result.
- `unknown`: a request may have reached the server, or the basket differs from the expected result. Further API writes are blocked until reconciliation confirms the effect.

There are no automatic write retries. Repeating an identical request ID returns its recorded result with a fresh basket, without repeating writes. A different payload under the same ID is rejected. The operation journal is in this tab's same-origin `sessionStorage`, survives reload/reinjection, and stores no customer addresses or authentication secrets. Writes require working session storage. Up to 100 mutation requests are retained; they are never evicted to silently permit replay. Closing the tab/clearing session storage ends this guarantee. Different tabs have separate journals; this is not cross-tab/server idempotency.

After an uncertain result, call `cart.reconcile`. If the expected effect is observed, the operation becomes complete/partial. If the effect cannot be established, it remains unknown; use the native cart to inspect and finish the task. Changing request IDs does not bypass an outstanding uncertain write.

`cart.verify()` compares native line identities and quantities, not screenshots or all price/tax calculations. Structured prices and totals come from native basket data. Missing amounts remain null; Magento currently exposes its native subtotal but no grand total. PrestaShop does not expose every line total in the presented data.

Classic server-rendered carts can be checked without navigating. WooCommerce Blocks renders its cart in JavaScript: open the cart, allow it to render, reinject if this was a one-off installation, then verify there. The verifier waits up to three seconds for asynchronous block-cart updates. Duplicate product URLs that cannot uniquely identify configured lines produce `unsupported-markup`, not a false verification pass. `native.matched: null` means verification is unavailable, not successful.

## Verification

Automated adapter contract tests use Node's built-in test runner, with no package install:

```sh
node --test tests/shop-agent.test.mjs
```

They cover no-network installation, namespace collisions, unsupported stores, bounded pagination/cache behavior, validation, replay across reloads, unavailable/options-required products, stale revisions, partial/uncertain operations, preserving unrelated lines, updates/removal, and blocked session storage.

For the local Common Thread fixture, inject `shopping.js`, then execute [the live test](tests/shop-agent.live.js) in that page. **It performs real cart writes**, adds the three test selections, exercises replay, and restores the quantities that existed before the test. It discovers an available product beyond the first native page and checks that structured filters are rejected before networking; it does not read the source catalog or have privileged product access. If a write becomes uncertain, cleanup can also be blocked: inspect the native basket before taking further action.

Live verification results and current limitations are recorded in [VERIFICATION.md](reports/VERIFICATION.md). These are integration checks, not a Luna performance benchmark. Luna comparisons must use identical shopping prompts and browser tools, with the script/banner present only in the treatment condition. Workers must not receive this README, API instructions, product IDs, or fixture answers in advance.

Primary provider token accounting includes cached input once; the task-work estimate is only a secondary diagnostic. Exact prompts and measurement tools are in [shopping/benchmarks](benchmarks/README.md). Historical reports below used different catalogs or earlier accounting and do not establish results for the current 530-product campaign.

The [12-agent Luna Medium comparison](reports/LUNA_MEDIUM_12_RUNS_2026-10-06.md) records two adapter and two bare-page runs on each store, including native basket outcomes, timing, task-work tokens, and interactions.

Version 0.4.8 combines additions with a rendered native-cart check in a temporary same-origin iframe, then opens the main cart. It freshly reads/preflights the basket and preserves unrelated lines. `verification:"verified"` identifies native **frame** evidence; main-page rendering is separate. The frame is removed in all outcomes. A changed basket or mismatched rows prevents handoff, partial/unknown writes do not open, and unsupported frame policy/theme returns unsupported status requiring main-cart verification. Confirmed write outcomes survive review errors and replaying the same request ID does not duplicate quantities. The live WooCommerce test separately verified both frame and opened main-page rows; other themes may block framing.

Version 0.4.9 accepts `catalog({probes:["short names or feature terms"], ...})`, evaluating up to 12 phrases in the same scan. Each probe reports matching IDs/counts, whether the query scope was fully scanned, and its explicit scope: whole-word AND in returned listing names/descriptions/attributes. Probes do not inspect full product descriptions, infer semantic absence, identify image colours, or establish fit. All products and the photo comparison remain available when a probe has no lexical match.

Version 0.4.10 documents two ordinary Playwright callbacks: one returns the catalog as a lossless table and saves its comparison image in the same browser execution; the other performs chosen additions, navigation and main-cart verification. The image remains a separate visual observation. These examples use only the assigned page and retain bounded-coverage and write-outcome checks.

Version 0.4.11 adds raw `data.catalogTable(input)` with the same lossless product table as shop_catalog and the same validation/coverage. The scan-and-screenshot example now uses this method directly, and help and the visible workflow agree.

Version 0.4.12 deduplicates catalog-table fields common to all records (merge `products.common` into each columns/rows record), comparison names already present in that table (shown IDs, plus IDs without photos), and probe scope shared by all probes. Direct catalog objects remain unchanged; unknown/null values are preserved.

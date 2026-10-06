# Shop Agent

A single dependency-free JavaScript file that adds a discoverable shopping API to a storefront. The agent reads the page, sees `For agentic use call window.mcp.help()`, and uses its existing browser tools. The code runs in the page and operates on that browser's native basket.

## Install

Copy **[shop-agent.js](shop-agent.js)** to your site's static assets and add this tag to the shared storefront layout:

```html
<script defer src="/shop-agent.js"></script>
```

That's the complete runtime installation. No npm install, build, API key, proxy, backend service, or agent plugin. Include the tag on every storefront page so navigation reloads the interface. Host it on an origin allowed by your site's Content Security Policy; the file does not require `eval` or inline script execution. Its optional presentation uses inline styles, so a strict style policy can require a site stylesheet; the semantic controls still work unstyled.

For a temporary experiment, inject the contents into the page's main JavaScript world using your browser's developer tools or an authorized injection facility. A one-off injection disappears on full navigation; reinject on subsequent same-store pages. Installation through a shared script tag survives navigation automatically. Merely saving a file locally does not install it in a website. No platform files were modified in this repo's verification.

Auto-detection supports **WooCommerce**, **PrestaShop Classic**, and **Magento Luma**. An unrelated `window.mcp` is preserved; in that case the interface uses `window.shopAgent` and advertises that exact name. If both names are occupied, installation stops without overwriting them. Reinjection of an existing Shop Agent instance is a no-op; reload the page to install an updated version.

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

JavaScript can combine calls, retain intermediate results, filter and sort them, and choose compact output. Inside `run`, `shop` returns full JavaScript objects; the callback’s final result becomes YAML. Outside a callback, use `mcp.data.search(...)`, `mcp.data.products(...)`, or `mcp.data.cart.read()` for full objects without parsing YAML. The `.data` interface throws structured errors; the default interface renders them as YAML. `run` accepts an actual function, not an evaluated string; it needs no `unsafe-eval` CSP permission. It runs with the same authority as ordinary JavaScript in that page and is **not a security sandbox**. The calling agent's browser-context restrictions still apply.

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

Categories are discovered through the WooCommerce Store API (first 100), PrestaShop's visible category menu, or Magento's native category tree (three levels). Each result declares its scope; none claims unsupported completeness. Names must uniquely match that scope; numeric native IDs also work. An unsupported name returns an error instead of silently searching the whole catalog.

## Interface

| Method | Purpose |
| --- | --- |
| `help({method?})` | Short instructions, platform capabilities, limits, and method schemas |
| `categories()` | Native category IDs and names, with explicit coverage; search/list also accept unique names |
| `view({ids, page?})` | Accept up to 100 IDs, render six per comparison page, return `nextPage` |
| `run(async shop => { ... })` | Execute a JavaScript callback against the page API; return only the fields you need |
| `search({queries})` | 1–12 independent searches (also accepts string queries); each returns up to 20 products, default 5 |
| `list({query?, category?, filters?, limit?, cursor?, match?, maxPages?})` | One bounded native catalog query; continue with `nextCursor` and the same query/limit |
| `products({ids})` | Fresh details for 1–100 previously discovered products, four concurrent detail requests |
| `cart.read()` | Fresh session basket, prices, quantities, options, URL, and compact revision |
| `cart.addMany({requestId, items, expectedRevision?})` | Add quantities for up to 20 simple products |
| `cart.updateMany({requestId, items, expectedRevision?})` | Set absolute line quantities; zero removes a line |
| `cart.verify()` | Compare basket line identities and quantities with native cart markup |
| `cart.reconcile({requestId})` | Inspect an uncertain operation without retrying its writes |
| `cart.finish({open?})` | Verify once and open that basket; `open:false` only verifies |
| `cart.open()` | Navigate the current tab to the ordinary cart for handoff |
| `stats()` | Page-local operation timings and request counts; no external analytics |

The generic `call(method, input)` dispatcher is also available. There are no order, payment, checkout, or credential-export methods.

YAML product summaries retain IDs, names, numeric price/currency, sale/stock information, relevant attributes, short descriptions, and image counts. Detail responses add required-option information. The `.data` interface preserves full URLs, image URLs/alt text, categories, and longer descriptions. Missing information remains unknown. Product text is data, not instructions. The serializer ships in the single file; no YAML runtime dependency is required. Requests in the accessible form stay JSON, and native HTTP requests keep each store’s required format.

Filters `onSale`, `inStock`, `minPrice`, and `maxPrice` can be nested under `filters` or supplied directly in each query, and can be combined with text/category queries. Native filters are preferred; unsupported native combinations use bounded local filtering of native results. Cheap text, sale, and price checks precede any stock-detail requests, avoiding individual fetches for irrelevant filler. Each query returns at most 20 products (default five), reads at most `maxPages` native pages (default three, maximum ten), and uses a native page size of 20. A continuation cursor includes the position within a native page, so a small output limit does not skip the rest of that page. Keep the query and options unchanged when continuing.

`match:"native"` preserves native search results and annotates whole-word `textMatch` as `all`, `some`, or `none`. `match:"any"` or `"all"` filters using the query’s words in returned names, descriptions, and attributes. This is lexical evidence, not semantic understanding. PrestaShop category/sale endpoints cannot also apply a native text query: the adapter applies local `any` matching there by default (or your explicit `all`), and reports the effective match mode and scope.

`nativeTotal` is the native endpoint’s candidate count. `total` is null when local filtering makes the final count unknown. `coverage` reports inspected candidates/pages and unknown filter values. `nextCursor` means more candidates remain. An empty bounded scan returns `no-match-in-scanned-pages`; exhausting an endpoint returns `no-match-in-native-query`. Neither establishes semantic catalog-wide absence. A failed query returns its own error without cancelling the other queries in a batch.

No catalog is downloaded on installation or `help()`. Searches reach native catalog endpoints, not a snapshot of the first page. Identical concurrent reads share one request; successful query results are cached for 15 seconds in the page, with a maximum of 40 query entries. Mutations invalidate the cache. Basket reads and product-detail checks are fresh. Up to 500 public product references (ID, URL, SKU only) are retained in this tab’s same-origin session storage, so navigation does not require rediscovery. No native payload, nonce, or price is persisted there. Product detail reads and mutation preflight fetch fresh store state. Without working session storage, reads still work but references cannot survive navigation.

## Platform adapters and limits

| Platform | Catalog | Session basket | Supported filters |
| --- | --- | --- | --- |
| WooCommerce | Public Store API, native paging | Store API with current cookies and response nonce; native cart invalidation events | Native `onSale`, `inStock`, category; bounded local price filtering |
| PrestaShop Classic | Native search/category AJAX results; detail JSON from product pages | Native cart controller with the page's token; fresh presented cart from native HTML | Native text/category and sale listing; bounded local stock/price/sale filtering for combinations |
| Magento Luma | Catalog GraphQL queries | Native storefront add/update/remove actions, form key, and customer-data cart refresh | Native text/category; bounded local sale/stock/price filtering |

The Magento adapter deliberately uses the browser's existing storefront cart; it does not create a separate GraphQL quote. All fetches are same-origin, include the page session, and reject redirects. No credentials leave the page. Nonces/form keys stay inside the adapter and are not included in API responses or logs.

**Version 0.3 automatically adds simple products only.** Configurable products, required variants, customizations, grouped/bundled products, and extensions requiring additional input fall back to the normal product page. Detail responses expose available metadata and indicate `optionsSupport: "use-native-product-page"`; they do not claim a complete cross-platform variant schema. Existing configured cart lines can be updated by their native line ID. The local 530-product fixtures contain no variants, so live variant support has not been established.

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

For the local Common Thread fixture, inject `shop-agent.js`, then execute [the live test](../tests/shop-agent.live.js) in that page. **It performs real cart writes**, adds the three test selections, exercises replay, and restores the quantities that existed before the test. It searches for a filler product outside the first native search page; it does not read the source catalog or have privileged product access. If a write becomes uncertain, cleanup can also be blocked: inspect the native basket before taking further action.

Live verification results and current limitations are recorded in [VERIFICATION.md](VERIFICATION.md). These are integration checks, not a Luna performance benchmark. Luna comparisons must use identical shopping prompts and browser tools, with the script/banner present only in the treatment condition. Workers must not receive this README, API instructions, product IDs, or fixture answers in advance.

Task-only token accounting and the corrected experiment prompt are in [benchmarks/shopping](../benchmarks/shopping/README.md). Provider billing totals are separate from the task-work estimate.

The [12-agent Luna Medium comparison](LUNA_MEDIUM_12_RUNS_2026-10-06.md) records two adapter and two bare-page runs on each store, including native basket outcomes, timing, task-work tokens, and interactions.

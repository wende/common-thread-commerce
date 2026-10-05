# Research on product discovery and basket tools

Archive note: linked measurement snapshots are committed below `results/`. Original screenshots, browser state, raw protocol events and other artifacts marked local-only are retained outside version control.

The recommended design is a session-bound commerce tool with a common interface and three platform adapters. Agents should receive compact product and basket objects, choose products, and submit a batch plan. The tool should resolve native IDs, execute requests in the assigned browser session, read back the basket, and prepare that same browser for handoff.

This research tested the existing local WooCommerce, PrestaShop, and Magento shops on October 5, 2026. All six concurrent session tests passed: two isolated guest contexts per shop, three distinct products, one unit per product in one context and two in the other. Adding products required no clicks or typing. A separate universal fallback test succeeded on all three after observing one normal add-to-cart click per shop.

These are transport and state-verification experiments. They did not launch new Codex workers or measure model decision time or agent tokens. The proposed tool is not yet integrated into the benchmark broker. No platform source, platform configuration, plugins, catalog records, or existing benchmark code were modified. Temporary scripts created fresh guest baskets; no orders were placed. The probes closed their browser contexts after collecting screenshots and storage state. They verified basket continuity and restoration, but did not transfer an open research context to a human.

## The two tiers

| Tier | What can be shared | What still needs knowledge of the shop |
| --- | --- | --- |
| Universal mechanisms | Session-bound HTTP transport, batching and scheduling, JSON-LD and microdata extraction, observing and replaying requests, compact data projection, auditing, persistence, handoff | Mapping a captured request to a new product or variant; extracting private basket state; refreshing theme caches |
| Platform adapters | The same agent-facing product, listing, basket, and verification contract | Native catalog queries, cart identity, CSRF tokens, variant identifiers, write endpoints, error interpretation, UI refresh |

A common agent interface is feasible. A completely automatic, platform-independent API for every storefront operation is not established by this experiment. The universal mechanisms reduce UI work, while adapters make the meaning of requests and responses reliable.

## Tier 1 universal solutions

### Keep the API attached to the browser

Bind a tool handle to exactly one owner, browser context, page, origin, and basket identity. The browser can stay open while most work occurs through HTTP requests.

Two transports worked:

- `page.evaluate(() => fetch(..., { credentials: 'same-origin' }))` uses the page's browser session. This was the transport used in the six concurrent tests.
- `context.request` shares the browser context's cookie jar. Separate read probes confirmed that it saw the same three-item basket on all three shops. This sharing is documented by [Playwright](https://playwright.dev/docs/api/class-apirequestcontext).

Prefer `context.request` where cookie sharing is sufficient. Use a bounded page-side request helper when browser execution matters, such as page-managed credentials, service workers, or browser-specific frontend behavior. Cookie sharing alone does not establish cart identity: the Magento experiment below demonstrates that distinction.

Retain the original context for handoff. Cookie and local-storage restoration also passed on these shops, but preserving a live context is stronger: generic restoration may omit session storage, in-memory state, browser-bound authentication, and expiring credentials.

### Extract structured product data

Use a shared extractor for JSON-LD, schema.org microdata, and structured page data. Parse these into product objects inside the helper; return fields to the agent rather than HTML or script text.

| Canyon product detail page | Product JSON-LD records | Product microdata scopes |
| --- | ---: | ---: |
| WooCommerce | 1 | 0 |
| PrestaShop | 1 | 0 |
| Magento | 0 | 1 |

Combining JSON-LD and microdata covered the product detail pages in this experiment. It does not establish complete listing coverage, all variant choices, or basket state. In particular, the home pages did not expose an entire catalog through product JSON-LD.

The extractor should normalize SKU, name, description, URL, images, price, currency, availability, and available options, preserving where each field came from. Missing fields should remain unknown. SEO data can be stale; recheck purchasability and selected variants before writing to the basket.

### Learn a request once and replay it

For an unfamiliar storefront, a helper can observe a normal authorized action, capture its own-origin request, and replay its method, URL, encoding, payload, and required headers using the same session. The agent does not need to click repeatedly.

The generic fallback used the same form inspection and request capture logic for all three shops:

| Shop | Plain serialized form added the item | One observed UI click followed by request replay | Final quantity |
| --- | --- | --- | ---: |
| WooCommerce | Yes, quantity 1 | Both added another unit | 3 |
| PrestaShop | No, quantity 0 despite HTTP 200 | Both added one unit | 2 |
| Magento | Yes, quantity 1 | Both added another unit | 3 |

PrestaShop's JavaScript supplied `add` and `action` fields absent from the HTML form. Form serialization by itself was insufficient. WooCommerce and Magento also used multipart request bodies for the observed actions, so a replay mechanism must preserve encoding and boundaries, rather than assume all forms are URL encoded.

This test established replay for the same simple product. Adapting a recorded request to different products, variants, personalization, or file inputs still requires understanding its parameters. Replaying an old CSRF token indefinitely is not a reliable strategy. A normal page refresh or fresh session descriptor should renew it when needed.

### Batch inside the tool

Separate three quantities: model tool calls, helper executions, and HTTP requests. One tool call can execute many reads and writes even when the platform lacks a native batch endpoint.

Run independent catalog reads with bounded concurrency. Serialize mutations within a basket, including the first request that establishes its session. Different isolated baskets can operate concurrently. Native batch operations should be used where supported; a client-side scheduler remains useful everywhere.

Return one compact result containing per-operation outcomes and the final observed basket. Avoid returning the entire basket after each intermediate mutation to the model, even if the server does so internally.

### Use WebMCP when the page already supplies it

WebMCP can expose named page tools to browser agents; it requires site participation. [Chrome's documentation](https://developer.chrome.com/docs/ai/webmcp) describes that model. The in-app browser reported no WebMCP tools on any of these three home pages. It is therefore a future integration option, rather than an available universal solution for these unchanged shops.

An external session tool or MCP server is sufficient for this experiment. It can wrap existing endpoints without installing a module in a shop.

## Tier 2 platform adapters

| Capability | WooCommerce | PrestaShop Classic | Magento Luma |
| --- | --- | --- | --- |
| Catalog discovery | Public Store API JSON | Storefront listing/search AJAX JSON | Public GraphQL product queries |
| Multiple searches | Parallel HTTP reads in one helper call | Parallel AJAX reads in one helper call | Multiple aliased queries in one GraphQL request |
| Basket read | Store API cart JSON | Storefront cart AJAX JSON and page bootstrap data | GraphQL cart plus browser cart section |
| Three-product write from a fresh browser session | One native batch HTTP request | Three serialized AJAX HTTP requests | One frontend seed POST, then one GraphQL mutation for the other two |
| Native multi-item write | Yes | Not found in the inspected storefront controller | Yes, after obtaining the browser basket's ID |
| Session mechanism | Cookies plus nonce or cart token | Cookies plus storefront token | Cookies and form key for frontend writes; masked cart ID for guest GraphQL |
| Fields and response size | Store API fields plus WordPress field projection | Large AJAX payload; project inside helper | GraphQL field selection |
| Primary adapter caveat | Batch item statuses and block-cart hydration | Undocumented frontend contract, HTML fragments, application errors | Correct cart identity and refreshed private content |

The API families are documented in the [WooCommerce Store API](https://developer.woocommerce.com/docs/apis/store-api/resources-endpoints/products/), [PrestaShop storefront listing implementation](https://github.com/PrestaShop/PrestaShop/blob/9.2.0/classes/controller/ProductListingFrontController.php), and [Magento products query](https://developer.adobe.com/commerce/webapi/graphql/schema/products/queries/products). The request counts and session behavior in the table were measured locally.

### WooCommerce

Use `/wp-json/wc/store/v1/products` for catalog discovery and `/wp-json/wc/store/v1/cart` for basket state. Native product filters cover search, category, price, sale status, and stock. Preserve prices' currency minor-unit metadata rather than treating their string amounts as dollars.

Read the cart in the assigned session to acquire a nonce. Send product or variation IDs and quantities to `/wp-json/wc/store/v1/batch`, with cart mutation subrequests. The tested three-item batch returned outer HTTP 207 and three successful item statuses of 201. The API supports cart updates, removal, and other cart operations, with nonce or cart-token authentication. See the [cart reference](https://developer.woocommerce.com/docs/apis/store-api/resources-endpoints/cart/) and [cart-token reference](https://developer.woocommerce.com/docs/apis/store-api/cart-tokens/).

Live `OPTIONS` discovery reported a 25-operation batch limit and `normal` / `require-all-validate` validation modes. This installation rejected GET subrequests with HTTP 400: its batch methods are POST, PUT, PATCH, and DELETE. Batch searches in the helper, or fetch a bounded catalog once and filter it locally.

The batch is not transactional. A valid item plus an out-of-stock item returned statuses 201 and 400, leaving the valid item in the basket. Parameter prevalidation should not be presented as rollback of business-rule failures.

Field projection reduced the tested 30-product response from 107,425 bytes to 29,756 bytes. Additional helper normalization reduced it further. For handoff, await the hydrated cart rows: `networkidle` alone initially left loading placeholders visible, even though the API basket and header were correct.

### PrestaShop

Use the current page's `prestashop.urls.pages` and storefront token. In the installed Classic theme, a listing URL with `ajax=1` returned products, descriptions, SKU references, prices, images, pagination, sorting, and add-to-cart URLs. It also included rendered HTML fragments, which the helper should discard.

The tested listing was `/2-home?ajax=1`; the search route was `/search?s=...&ajax=1`. These URLs are examples from this shop. Discover listing and search URLs from the page instead of hardcoding category IDs on every deployment.

Adding an item used a POST to the discovered cart route with `add=1`, product ID, attribute/customization IDs when applicable, quantity, token, `ajax=1`, and `action=update`. A cart AJAX request with `action=update` and no mutation fields returned structured basket state. The [installed cart controller](https://github.com/PrestaShop/PrestaShop/blob/9.2.0/controllers/front/CartController.php) provides the implementation basis for these routes; they should be treated as versioned frontend contracts.

No native multi-product add route was found in the inspected controller. One agent call can still perform three serialized requests and return one result. Validate `success`, `hasError`, and `errors`: the out-of-stock probe returned HTTP 200 with `hasError: true`, and the basket stayed empty.

The legacy `/api/` webservice returned HTTP 401 without a key. It is a merchant integration API, with separately provisioned access, rather than the current shopper session. PrestaShop 9 also has an OAuth-protected Admin API. No merchant credentials were provisioned and no configuration was changed for either API in this experiment. See the [webservice documentation](https://devdocs.prestashop-project.org/9/webservice/getting-started/) and [Admin API documentation](https://devdocs.prestashop-project.org/9/admin-api/how-to-use/).

The listing's absence of an add-to-cart URL matched the two out-of-stock simple products here. In a general adapter it can also mean options are required or purchasing is disabled, so it is not sufficient to declare a product out of stock.

### Magento

Use `/graphql` with selected fields for product discovery. GraphQL aliases can combine independent searches into one HTTP request; the tested red, mug, and hoodie queries returned 0, 0, and 6 results respectively.

`addProductsToCart` accepts multiple SKU and quantity entries and returns basket data and `user_errors`. That native operation is documented in the [mutation reference](https://developer.adobe.com/commerce/webapi/graphql/schema/cart/mutations/add-products/).

The critical prerequisite is the identity of the existing browser basket. Calling `createEmptyCart` in the same cookie session created a separate API basket: GraphQL showed the added product, while Luma's cart remained empty. Keeping browser cookies was not enough to attach that new quote.

The working fresh-session sequence was:

1. Discover products through GraphQL and inspect the frontend add-to-cart form.
2. POST the first selected product through that form with its form key, creating the browser session's basket.
3. Read `/customer/section/load/?sections=cart&force_new_section_timestamp=true`.
4. Obtain the browser basket's masked ID and use it for a GraphQL mutation adding the remaining products.
5. Read GraphQL basket state and render the native cart in the same context.

This installation exposes `masked_quote_id` in its cart section through the installed Payment Services PayPal module. Do not assume that field exists on every Magento deployment. A separate read probe confirmed that the core checkout page's `window.checkoutConfig.quoteData.entity_id` contained the same guest masked ID. The relevant core mapping is in [DefaultConfigProvider](https://github.com/magento/magento2/blob/2.4.8-p5/app/code/Magento/Checkout/Model/DefaultConfigProvider.php). The fallback should discover this field and check its relationship to the browser basket, without exposing the full customer configuration to the agent.

If a usable guest cart ID cannot be established, retain frontend form/AJAX writes, or use a headless frontend that already owns its API cart. Neither requires inventing a browser-session bridge. An existing browser basket with an accessible ID can use one native mutation for all three additions.

Private frontend content can remain cached after API mutations. A production adapter should invoke the theme's customer-data refresh mechanism or reload and verify the native cart. Adobe documents the [private-content lifecycle](https://developer.adobe.com/commerce/php/development/cache/page/private-content).

Magento also produced a partial batch: a valid SKU was added, while the unavailable SKU yielded `PRODUCT_NOT_FOUND` in `user_errors`. Treat that error as an application outcome, not proof that no items were added.

## Proposed agent-facing tool

The following interface is a design proposal. The experiments validated the underlying requests and state transitions, not these tool names or schemas.

| Operation | Agent input | Compact result |
| --- | --- | --- |
| `shop.inspect` | Assigned handle; desired listing scope and fields | Capabilities, current listing and filters, projected products, pagination/coverage, current basket |
| `shop.searchMany` | Array of queries and shared filters | Result sets with native search semantics, evidence and coverage |
| `shop.products` | Product handles; requested detail/option/image fields | Details and valid selectable options |
| `shop.basket.sync` | Desired quantities for specified products/variants; expected basket revision; operation ID | Per-item outcomes, applied changes, fresh basket, revision, unresolved selections |
| `shop.basket.verify` | Expected lines, quantities, price tolerances | API and optional rendered-basket checks, price and shipping context |
| `shop.handoff` | Assigned handle | Native cart URL, verified state, screenshot, ownership release |
| `shop.api.describe` | Capability or operation family | Supported native operations and parameter schemas, discovered lazily |
| `shop.api.callMany` | Named operations and dependencies | Structured results through the same assigned session |

The first five operations cover routine shopping. The native-operation layer provides broader access when necessary without making every agent reconstruct URLs, nonces, or basket IDs. Expose shopper operations available to the assigned session; administrative API access is a separate integration.

For broader API discovery, the adapter can use WordPress REST route descriptors and `OPTIONS`, Magento’s GraphQL schema where available, and PrestaShop’s page bootstrap plus observed frontend requests. Return a versioned capability description and load detailed parameter schemas on demand. Only WooCommerce’s batch `OPTIONS` discovery was tested here; complete automatic enumeration of each shop’s API was not.

“Expose the entire page API” should mean exposing the available named shopper operations through the assigned session. There is no common way to enumerate every JavaScript function and infer its meaning across all three platforms. A recorded request describes an observed action, while a native schema describes supported parameters; both still need mapping to products, variants, basket ownership, and frontend state.

An illustrative two-call shopping flow is:

```javascript
const view = await shop.inspect({
  handle,
  catalog: { limit: 100, fields: [
    'id', 'sku', 'name', 'description', 'price', 'regularPrice',
    'availability', 'categories', 'options', 'image'
  ] },
  basket: true
});

// The agent chooses from the structured view; no page clicking is needed.
await shop.basket.sync({
  handle,
  mode: 'merge',
  ifRevision: view.basket.revision,
  operationId: 'selection-1',
  items: [
    { product: teeHandle, quantity: 1 },
    { product: warmLayerHandle, quantity: 1 },
    { product: alternativeHandle, quantity: 1 }
  ],
  verify: { api: true, browser: 'handoff' }
});
```

This is an intended reduction in model round trips, not a measured two-call agent benchmark. Larger catalogs should use bounded queries, cursors, facets, and on-demand detail requests instead of returning every product.

Use merge semantics by default: requested quantities are synchronized for the specified lines, and unrelated user items remain present. Removals must be explicit. Product and variant handles should resolve internally to the correct native IDs and basket owner.

The batch executor should follow dependencies, parallelize independent reads, serialize basket writes, and stop dependent operations after a failed prerequisite. Return `partialApplied` and per-item errors rather than one misleading success flag. After an ambiguous timeout, read state before retrying an additive mutation. An operation ledger can prevent the helper from applying the same plan twice; it cannot provide server-side transactionality where none exists.

A basket revision can detect changes before a plan is applied. It is an optimistic comparison, not an atomic lock against simultaneous human edits. Re-read after execution and report conflicts.

## Preserve isolation in the API layer

Keep the existing isolation pre-prompt unchanged:

```text
You control exactly one assigned browser context. Never inspect, switch to, interact with, navigate, close, or modify any tab, window, target, or browser context outside your assigned context. Never use global browser/tab controls. Only act through the page/session handles provided to you. If an action would require accessing anything outside your assigned context, stop and return `BLOCKED: outside assigned browser context`.
```

Enforce the same constraint in the tool. Resolve the caller's assigned context before every operation. Use its request client, bind cart tokens and masked IDs to that assignment, reject arbitrary other basket IDs, and revoke API access when browser ownership is handed over.

An origin check is necessary but insufficient: two agents on the same shop can have different baskets. Account for redirects, storefront origin aliases, and any needed API origin explicitly. A broker implementation should reject unapproved redirects or route them only through registered origins. The temporary probes checked initial request origins; they are not a hardened redirect-isolation implementation.

The existing [broker](broker.mjs) already binds opaque handles to threads, serializes calls, records timing, verifies handoff, and revokes access. A future commerce operation can extend that structure with adapters while retaining the browser fallback. It was only inspected in this research.

## Information quality and basket totals

Reducing HTML does not solve missing product metadata. The seed catalog has colors, but the inspected storefront APIs did not expose Canyon's color as a selectable product attribute. The stores use simple products without selectable size variants. Fit for an unspecified shopper remains unknown. Image inspection or separately verified image annotations can help with color when necessary; metadata must not be invented from product names.

PrestaShop's native search returned all six tees for `red` and Tide V-Neck Tee for `mug`. Those retrieval results do not establish either a red attribute or the existence of a mug. The proposed tool should expose query behavior and evidence, then validate product descriptions/categories/options. A complete catalog view helps distinguish a fuzzy match from an absent product type.

Prices need a context. Return merchandise subtotal, discounts, tax, shipping amount or estimate, currency, observation time, and whether an address and shipping method are known. Do not collapse all of them into one supposedly final total.

The primary Magento API snapshot had subtotal and grand total of $96 before the cart page estimated shipping. The rendered basket showed $101. A later API read confirmed grand total $101; observed native `totals-information` responses reported subtotal $96 and shipping $5. Read totals after any frontend recalculation used for handoff. WooCommerce and PrestaShop's one-unit baskets showed $101 and $103 respectively, with the same $96 merchandise subtotal.

## Measured results

The tested products were Canyon V-Neck Tee (`CT-003`, $20.80), Trail Pocket Hoodie (`CT-011`, $57.60), and Ridge Ribbed Beanie (`CT-019`, $17.60). Their merchandise subtotal was $96 for one of each and $192 for two of each. The test used known SKUs to isolate transport and state correctness; it did not evaluate recommendations for the vague shopping prompt.

| Session | Quantity per product | Subtotal (USD) | Duration (s) | Add stage (s) | Explicit API requests | Write requests | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| woocommerce-1 | 1 | $96.00 | 7.806 | 0.059 | 6 | 1 | Pass |
| woocommerce-2 | 2 | $192.00 | 6.998 | 0.066 | 6 | 1 | Pass |
| prestashop-1 | 1 | $96.00 | 4.767 | 0.504 | 8 | 3 | Pass |
| prestashop-2 | 2 | $192.00 | 5.924 | 0.556 | 8 | 3 | Pass |
| magento-1 | 1 | $96.00 | 6.801 | 0.289 | 11 | 2 | Pass |
| magento-2 | 2 | $192.00 | 8.071 | 0.365 | 11 | 2 | Pass |

The add stage included three HTTP requests on Magento: the frontend seed write, a cart-identity read, and the GraphQL write. WooCommerce used one request; PrestaShop used three writes. The table counts HTTP requests, with GraphQL POST queries classified as reads.

Mean stage durations across the two sessions on each platform:

| Stage | WooCommerce (s) | PrestaShop (s) | Magento (s) |
| --- | ---: | ---: | ---: |
| Initialize browser/session | 2.066 | 1.781 | 1.834 |
| Discover catalog | 0.111 | 0.163 | 0.181 |
| Read initial basket | 0.036 | 0.031 | 0.058 |
| Add three products | 0.062 | 0.530 | 0.327 |
| Verify through API | 0.056 | 0.072 | 0.212 |
| Render and verify basket | 2.765 | 0.688 | 1.262 |
| Reload and verify | 0.726 | 0.748 | 1.405 |
| Restore storage in new context and verify | 1.461 | 1.239 | 2.051 |

Most elapsed time was spent initializing and rendering, reloading, or restoring browser contexts. The mutation stage ranged from 0.059 to 0.556 seconds across these six local tests. These observations include test verification overhead and do not measure an agent’s reasoning time.

Every primary session passed API line and quantity checks, rendered-cart checks, page reload, restoration into a new context from saved storage, and a final read after its peers had completed. The final read confirmed that the one-unit and two-unit sessions stayed separate.

The six session tests completed concurrently in 8.072 seconds. The entire run, including the final sequential isolation reads, took 13.530 seconds. Summed session durations were 40.367 seconds; they are not the elapsed wall time.

There were 50 explicit API requests in the primary session measurements, including 12 write requests. The final isolation check added 8 reads. Page loads, JavaScript assets, and automatic storefront traffic are excluded from these API counts.

The primary helpers also made 66 `page.evaluate` calls and 24 navigations/reloads, including verification and restored contexts. There were zero clicks or fills. These are different measurement units: programmatic browser scripts still count as browser work, and these experiments do not establish zero Playwright interactions or zero agent tool calls.

| Platform (30 products) | Raw catalog response (bytes) | Normalized JSON (bytes) | Reduction |
| --- | ---: | ---: | ---: |
| WooCommerce | 107,425 | 10,302 | 90.41% |
| PrestaShop | 167,318 | 11,400 | 93.19% |
| Magento | 20,220 | 11,877 | 41.26% |

These are UTF-8 response/JSON byte counts, not token estimates. The normalized objects retained names, SKUs, descriptions, prices, categories, stock/purchasability indicators, URLs, and images. They were not identical field sets across platforms. WooCommerce's additional server-projection probe produced 29,756 bytes; PrestaShop's normalization discarded substantial rendered HTML and image-size repetition.

Probe development uncovered two WooCommerce test-harness issues: successful add operations returned HTTP 201, and browser cart hydration required waiting beyond `networkidle`. These were corrected in temporary scripts. The generic fallback also required scoping its bootstrap button to the product form to exclude related-product add buttons.

## Proposed next experiment

Implement the common tool outside the platform code and connect its adapters to the benchmark broker. Then rerun the same vague prompt with Luna xhigh, two agents per shop, using matched catalog and session conditions.

Compare recommendation quality and completed handoffs alongside uncached input, cached input, output/reasoning tokens, model round trips, API requests, native suboperations, browser fallback calls, and wall time. Keep discovery, selection, cart execution, and reporting durations separate. The previous six-agent run is useful context, but these deterministic script timings are not a measured speedup over it.

Additional correctness cases should cover existing user basket items, variants/options, a mixed valid/invalid plan, uncertain write timeouts, login/cart merging, token expiry, multiple listing pages, frontend cache refresh, and mutations attempted after handoff. These cases were not all tested here.

## Reproduction and evidence

The local environment uses WooCommerce 11.1.2 with Storefront, PrestaShop 9.2.0 with Classic, and Magento Open Source 2.4.8-p5 with Luma, as described in the [workspace README](../../README.md). The adapters must discover capabilities rather than assume all installations have the same themes and modules.

- Six-session measurements and assertions (local-only artifact: `../../output/playwright/page-api-research/2026-10-05T14-14-37.909Z/report.json`)
- Six-session probe (local-only artifact: `../../output/playwright/page-api-research/2026-10-05T14-14-37.909Z/probe.mjs`)
- Universal fallback, partial batches, and detached Magento basket (local-only artifact: `../../output/playwright/page-api-research/fallback-2026-10-05T14-19-55.126Z/report.json`)
- Fallback and error probe (local-only artifact: `../../output/playwright/page-api-research/fallback-2026-10-05T14-19-55.126Z/probe.mjs`)
- Shared-cookie transport, search, field projection, and totals probes (local-only artifact: `../../output/playwright/page-api-research/additional-reads/report.json`)
- Additional read probe (local-only artifact: `../../output/playwright/page-api-research/additional-reads/probe.mjs`)
- [Earlier Luna session report](SESSION_REPORT_2026-10-05.md)

The scripts use the workspace's existing Playwright dependency and contain assertions. They can create new guest baskets when rerun. Storage-state files are retained locally alongside the primary results for reproduction; actual guest cart credentials are omitted from this note.

Run a saved probe with `node /absolute/path/to/probe.mjs` while the three local shops are running. The archived probes reference this workspace’s Playwright installation and, for the additional reads, the saved primary storage states. Their archival self-copy paths were made independent of `/tmp` after measurement; the requests and assertions are unchanged. Additional reads now write to a dated directory when rerun, preserving the original results.

**WooCommerce: one unit of each product in the native basket.**

WooCommerce native basket with three selected products (local-only artifact: `../../output/playwright/page-api-research/2026-10-05T14-14-37.909Z/woocommerce-1.png`)

**PrestaShop: one unit of each product in the native basket.**

PrestaShop native basket with three selected products (local-only artifact: `../../output/playwright/page-api-research/2026-10-05T14-14-37.909Z/prestashop-1.png`)

**Magento: one unit of each product in the native basket.**

Magento native basket with three selected products (local-only artifact: `../../output/playwright/page-api-research/2026-10-05T14-14-37.909Z/magento-1.png`)

The separate two-unit baskets are saved as WooCommerce (local-only artifact: `../../output/playwright/page-api-research/2026-10-05T14-14-37.909Z/woocommerce-2.png`), PrestaShop (local-only artifact: `../../output/playwright/page-api-research/2026-10-05T14-14-37.909Z/prestashop-2.png`), and Magento (local-only artifact: `../../output/playwright/page-api-research/2026-10-05T14-14-37.909Z/magento-2.png`).

# Glovo JavaScript adapter

Version **0.4.2** runs inside the signed-in Glovo page and calls its existing JavaScript. The panel is included in `glovo.js`; one injection installs both the API and the panel. No npm dependencies are needed.

The changes address the delays measured in [the agent transcript audit](benchmarks/v0.3/transcript-audit.md): separate product searches, repeated add/remove calls, reading the panel source to hide it, gathering native basket evidence, and manually constructing reports. [AGENT.md](AGENT.md) is the short operating guide.

## Batch search and matching

On [McDonald's Kraków](https://glovoapp.com/en/pl/krakow/stores/mcdonald-s-kra):

```js
const search = glovoBridge.searchMany({
  queries: ['mcdouble', 'mcchicken', 'chocolate shake', 'ciastko jablkowe'],
  includeOptions: 'selected'
})
```

Search scans the current store's loaded menu once per batch, deduplicates IDs, and returns up to three compact candidates per query by default. Each result has `status`, `selectedProductId`, `total`, and `hasMore`; candidates include price, match type/score, product/meal kind, and whether choices are required. Large option groups are omitted unless `includeOptions` is `selected` or `all`.

Exact names rank first after case, punctuation, trademark, and Polish diacritic normalization. Built-in English aliases cover chocolate/vanilla/strawberry shakes, apple pie, and small/large fries. Fuzzy matching tolerates small spelling mistakes. For example, `mcchiken` returns both McChicken and its meal as **ambiguous**, with no selected ID. Search never adds a candidate automatically. Use `fuzzy:false` or `aliases:false` for strict matching.

`searchProducts('McDouble')` remains compatible and returns full product metadata. It also accepts `{query, limit, compact, fuzzy, aliases}`; limits are 1–200. An empty single query lists products. `getProduct(id)` returns full metadata for a candidate. Search does not fetch unseen categories or other stores remotely.

## Add, verify, and clean a batch

Check every search status and explicitly resolve ambiguous candidates. Then use the returned IDs:

```js
if (search.results.some(result => result.status !== 'matched')) throw Error('Resolve product matches first')
const added = await glovoBridge.addMany({
  items: search.results.map(result => ({
    productId: result.selectedProductId,
    quantity: 1,
    choices: result.query === 'chocolate shake' ? ['small', 'SUP cup'] : []
  }))
})

// Confirm completion before treating every item as added.
if (added.status !== 'complete') throw Error('Read and reconcile the basket')
await glovoBridge.removeMany({ receiptIds: added.results.map(item => item.receiptId) })
```

`addMany` and `removeMany` accept 1–20 items. All products, quantities, and required choices are validated before the first write. Native writes run sequentially within one browser call and return per-item statuses and **one final basket summary**. Product quantities are 1–20 integers. Choices accept unique names, `{name, group?, quantity?}`, or `{groupId, attributeId, quantity?}`. IDs and names must agree when combined. Required choices are never inferred; name ambiguity requires a group or IDs.

Each confirmed addition creates a receipt with the store, exact configured basket line, quantity, option names, and operation ID. Cleanup coalesces receipts for the same line and decrements only their remaining quantities. It preserves quantities present when the session first observed the basket and rejects cleanup that would consume them after an external decrease. Receipts survive reinjection within the document; a full reload loses them. `getReceipts()` returns active receipts; `{activeOnly:false}` includes consumed receipts.

For explicit line removal, use `removeMany({items:[{basketProductId,quantity}]})`. Duplicate line requests are coalesced and all aggregate quantities are checked before any write. Existing `addToBasket` and `removeFromBasket` methods remain available.

Batch outcomes:

- `complete`: every requested write was confirmed.
- `unknown`: a write failed, timed out, or returned an unconfirmed quantity/options. Remaining writes are `not_attempted`; `basketIsLastConfirmed:true` identifies the last confirmed basket.
- `partial`: the 45-second batch budget was exhausted before another write started. Its remaining items are `not_attempted`.

No writes are retried automatically. Each native step waits at most 15 seconds, shortened by the remaining batch budget. An unresolved native write keeps the mutation lock until its promise settles. Read `getStoreCart({refresh:true})` and inspect `mutationPending` before deciding what to do next. Reinjection and uninstall are blocked while a mutation is pending.

## Panel and evidence

Injection shows the panel at the **left**, clear of the native basket. Public controls replace source inspection and Shadow DOM access:

```js
glovoBridge.panel.show({dock:'left', collapsed:false})
glovoBridge.panel.collapse() // Header only
glovoBridge.panel.hide()
glovoBridge.panel.state()
```

The panel retains product search, option forms, add, read basket, and remove controls. Its buttons hide or collapse it without uninstalling the API. `tools/panel.js` is now only a compatibility snippet that calls `panel.show()`.

`getBasketEvidence()` returns a fresh SDK basket plus native basket text, rows, quantities, options, rectangle, and `nativeMatchesStructured`. It compares only the native basket container, excluding menu product names. `prepareBasketScreenshot()` also hides the panel and scrolls the native basket into view. These methods report a mismatch rather than claiming verification when the UI differs. A direct successful preparation leaves the panel hidden; the CLI evidence command restores its previous state after capture, including on failures.

## CLI

The connected Kimi WebBridge daemon and extension must be running. Commands use the existing **glovo-webmcp** Chrome session and Node 22+. Open the store page and let it mount before injecting.

```sh
node glovo/tools/bridge.mjs help
node glovo/tools/bridge.mjs inject --panel hidden
node glovo/tools/bridge.mjs schema
node glovo/tools/bridge.mjs call searchMany '{"queries":["mcdouble","mcchicken","chocolate shake","ciastko jablkowe"],"includeOptions":"selected"}' --save search.json
# Write items.json using freshly returned IDs and explicit choices:
node glovo/tools/bridge.mjs call addMany --input-file items.json --save additions.json
node glovo/tools/bridge.mjs evidence basket.png
node glovo/tools/bridge.mjs cleanup additions.json --save cleanup.json
node glovo/tools/bridge.mjs report report.json
```

`--input-file` avoids inline JSON quoting; `--save` stores exact results for later cleanup. `cleanup` requires a completed addition result and sends its receipt IDs. CLI exit codes are 0 for success, 1 for an error, and 2 for an unknown/partial batch. An interrupted CLI is not proof a write failed; inspect the basket before retrying.

`evidence` saves the full viewport screenshot and a structured `.png.json` sidecar, or the path selected with `--save`. It hides/restores the panel automatically and records the screenshot as an artifact. Check `nativeMatchesStructured` and `nativeUi.visibleInViewport`; visually inspect the screenshot when the basket is too tall for the viewport.

Every command appends its wall time, transport timings, status, and relevant public results to `reports/transport.jsonl`. The adapter records up to 200 operation events, receipts, and initial baskets. `report` exports these with a fresh final basket, screenshot paths, and current-session transport records. `--input-file notes.json` adds a string array of human difficulty notes; mechanical results need no hand-written report JSON. These timings measure operations, not agent tokens or end-to-end agent benchmark performance.

The CLI uses WebBridge's `Runtime.evaluate` CDP interface for Promise results and exceptions. It temporarily enables focus emulation while evaluating so Glovo responds in its background tab; it does not switch the user's active tab. `snapshot`, `screenshot`, and `eval script.js` remain available. `eval` is an advanced escape hatch; routine tasks use the public methods.

## Implementation and lifecycle

Search reads React menu props and mounted product components. Mutations use the mounted cart SDK and native customization payloads. Authentication remains in Glovo's closures. `suggest(query)` calls the loaded autocomplete service, `search(query)` invokes the mounted search-selection callback, and `getCart()` reads all native baskets. Global search is unavailable on pages that do not mount its callback.

SDK basket reads use its cache by default; `{refresh:true}` fetches from the server. Totals come from Glovo and may exclude charges calculated later. Checkout and order placement are outside this adapter.

These are private React/webpack interfaces and can change. Missing components are reported rather than replaced with guessed endpoints. A document reload removes the adapter and in-memory history. Reinject after navigation to another store to refresh the panel. `uninstall()` removes the adapter and panel and restores any prior unrelated `window.glovoBridge`.

## HTTP-only basket creation and browser reconstruction

`http-basket.mjs` is a separate Node script using only built-in modules and `fetch`. It discovers the store and menu over HTTP, creates a fresh anonymous guest basket, sends native basket updates, and verifies the result with a fresh GET. It does not launch or connect to a browser and does not accept browser cookies or account authorization tokens.

### Standalone CLI with Chrome handoff

The packaged [glovo-basket.mjs](../glovo-basket.mjs) needs Node 24+ and an installed
Google Chrome, with no npm dependencies. Run:

```sh
node glovo-basket.mjs
```

The CLI first asks for your shopping list: one item per line, with a blank line to finish.
Each item defaults to quantity 1; 1–20 items are supported. Empty lists stop before any
browser, model or basket operation. Explicit item arguments are also supported.

It opens Chrome in `~/.common-thread-commerce/chrome`. On the first run, select a delivery
address on Glovo; sign in there if desired. The profile remembers that selection. Enter your
OpenRouter key at the hidden terminal prompt, or supply `OPENROUTER_API_KEY` privately.
When `OPENROUTER_API_KEY` is set, the key prompt is skipped; blank values fall back to the
hidden prompt. For example, after setting that variable in your shell, run the same
`node glovo-basket.mjs` command. The shopping-list prompt remains interactive.
Node reads only allowlisted public client/location headers from this browser's native requests;
account cookies and authorization stay in Chrome. Jev calls run in Node. The key is not passed
into Chrome, persisted in reports, or inherited by the Chrome process.

Catalog GETs execute inside the selected Chrome tab, using the exact store and delivery branch
mounted in that page. The CLI does not independently resolve the store slug through Node HTTP.
Only public menu data returns to Node for Jev selection; raw JSON is parsed there to preserve
64-bit product IDs. The mounted branch is checked before each fetch; changing it stops the run.

The constructor plans the basket without creating another HTTP guest basket. After validating
the chosen IDs against the hydrated catalog, the CLI calls **Glovo's own cart SDK running in
the page** to add them to that browser session. This is the website's code, not a Chrome API.
Existing products and quantities are preserved. Every update and the final fresh server read
must match; a further read after page reload confirms persistence. Chrome remains open when
the script exits, for manual review and checkout. No checkout operation is exposed.

`--items-file shopping.json` supports quantities, features and required choices using the
constructor's input format. `--import-plan result.json` rehydrates and imports an existing
constructor result without another Jev request. `--open-only` opens Chrome without shopping.
`--help` lists custom store URL, executable, browser profile, wait time and report options.
Reports default to private files under `~/.common-thread-commerce/runs`.

Unknown writes stop without retries. A private `basket-inflight.json` in the browser profile
blocks later operations until the basket is inspected and reconciled. Saved operation records
also prevent importing the same plan twice through this profile. Do not clear these records
and blindly resend an operation. This uses Glovo's private cart integration; website updates
may require maintenance.

Rebuild the standalone file with `npm --prefix tooling run pack:glovo-basket`. Run offline
unit tests with `npm --prefix tooling test`; `npm --prefix tooling run test:chrome-basket`
checks real Chrome launch, native-cart fixture calls, reload and disconnect using a fully
intercepted page, with no real Glovo or Jev network requests. The CLI does not require a
browser automation extension, Puppeteer, Playwright or a running local web server.

Provide a private JSON profile with public Glovo client headers and delivery coordinates for the intended location. The live experiment obtained these settings from the selected guest location; subsequent creation runs use only the file. The API requires a delivery location even for a basket-only operation. The public client version headers may need updating when Glovo changes its web client. Profile header names are explicitly allowlisted in the script; account/session headers are rejected. Keep coordinates out of source control.

```sh
node glovo/tools/http-basket.mjs create \
  --profile location-profile.json --store mcdonald-s-kra \
  --item McChicken --item Chikker --output basket.json
node glovo/tools/http-basket.mjs verify --session basket.json.session.json
```

Each `--item` requests one unit by exact normalized menu name. For products with options, use `--items-file items.json` instead; the JSON file is an array of `{name or productId, quantity, choices}`. Choices accept an exact option name or `{group, name}` or `{groupId, attributeId, quantity?}`. All required groups, option IDs, quantities, duplicates and group limits are validated before writing. Product quantities are 1–20; required choices are never inferred. The exported `createBasket` function accepts the same array. The script uses a fresh guest identity whose numeric ID survives the API's JSON representation exactly.

For example, the white coffee and apple pastry basket uses native menu names and explicit small size/standard cup choices:

```json
[
  {"name":"Kawa z Mlekiem Mała","quantity":1,"choices":[
    {"group":"Wybierz rozmiar","name":"Mały."},
    {"group":"Wybór opakowania","name":"Kubek (opłata SUP)"}
  ]},
  {"name":"Ciastko Jabłkowe","quantity":1,"choices":[]}
]
```

```sh
node glovo/tools/http-basket.mjs create \
  --profile location-profile.json --store mcdonald-s-kra \
  --items-file items.json --output coffee-apple-basket.json
```

The October 6 live HTTP test created these two configured products and confirmed them in a separate read-only process. Glovo returned a basket total of 22.40 PLN. No browser or authenticated account was used for this run; checkout was not submitted.

`basket.json` is a portable `glovo-basket/v1` manifest containing the store/branch, products, quantities and choices. It has no guest basket ID, account credentials or location coordinates. `basket.json.session.json` is private state containing the guest identity, location, last confirmed response and request trace; both outputs are created with mode 0600. Use the private state only for read-only verification. Updates have no automatic retry. A timeout or an unconfirmed result stops further writes and checkpoints an `unknown` outcome. Output files must be new to prevent accidental overwrites or replay.

In a signed-in browser, open the same store and delivery branch, inject `glovo.js`, then pass the manifest as an object:

```js
const imported = await glovoBridge.importBasket({ basket: manifest })
if (imported.status !== 'complete' || !imported.verification.matches) throw Error('Reconcile the basket')
await glovoBridge.verifyBasketImport({ id: manifest.id })
await glovoBridge.getBasketEvidence()
```

This reconstructs the manifest's product quantities through the browser's authenticated native cart SDK. It preserves existing items and quantities; it does not change ownership of the guest basket or remove its contents. `exportBasket()` can produce the same manifest from another browser session. Import IDs prevent duplicate additions within the same document, including reinjection; a full reload loses that import journal, so reconcile the fresh basket before reimporting. The new transfer methods are directly available on `window.glovoBridge` and its native DOM transport; the older WebBridge CLI method allowlist does not expose them.

Live verification on October 6, 2026: six standalone HTTP requests created McChicken ×1 and Chikker ×1 (32.10 PLN), without cookies or account tokens. A separate Node process confirmed persistence. Reconstruction in the authenticated browser preserved McDouble ×1 and Cheeseburger ×1, resulting in four products (59.30 PLN). After a full reload, the fresh server response and native cart still agreed. No checkout or order was submitted. These are observed private Glovo endpoints, not a guaranteed public API contract.

```sh
node --test glovo/tests/http-basket.test.mjs glovo/tests/adapter.test.mjs glovo/tests/bridge-client.test.mjs
```

## Three-request basket constructor

[`tools/basket-constructor.mjs`](tools/basket-constructor.mjs) turns a shopping list into a
native guest basket, or a portable basket manifest. To reconstruct it in the signed-in
browser, first load the selected products into that page's native menu, then use
`glovoBridge.importBasket({basket: result.manifest})`.
It uses the OpenRouter Decisions API with `typesafe/jev-1.13`, and built-in Node modules.
Use a current Node runtime supporting the JSON reviver's source context; this preserves
Glovo's large numeric product IDs without rounding them.

A successful run makes exactly three Jev requests, with one question per input item in each:

1. Read the store and its main category index; batch category selection for the complete list.
   The recorded Biedronka index has 100 navigation targets, including 99 category tiles and Promotions.
2. Fetch the selected unique categories; batch selection among their loaded sections and lazy subcategories.
   Retain the winning category and at most one other category with a positive reported probability
   from the first response. This lets an ambiguous ingredient such as basil use the spices aisle
   when absent from vegetables, without another Jev request. Zero or missing probabilities do
   not trigger fallback reads; this is a bounded search rather than an exhaustive catalog scan.
   Each section includes its parent category and all already-loaded product names and descriptions,
   so a broad label such as “Warzywa” retains its “Warzywa i zioła” context. Unfetched inventories
   are marked unknown; exact product matching and availability are checked in the final batch.
3. Fetch the selected unique lazy sections; batch selection of specific in-stock products, then validate
   all native IDs, quantities and required choices before writing any basket lines.

Every item remains in each batch. Shared category/section fetches are deduplicated. All available
products in the selected section remain candidates; unrelated categories are not downloaded.
Each question includes a `no_match` option. A missing match, malformed answer, deeper hierarchy,
missing required option, HTTP error or exceeded quantity stops the run. The fixed three-request
budget supports the recorded category/section/product hierarchy; additional nesting stops with
`CATEGORY_DEPTH_BUDGET`, rather than silently issuing a fourth request or selecting from a partial catalog.

The default library operation is a read-only plan:

```js
import { constructBasket, createGlovoCatalog, createJevClient } from './glovo/tools/basket-constructor.mjs';

const result = await constructBasket({
  items: ['Spaghetti', 'Passata', 'Bazylia', 'Tuna', 'Cream', 'Parsley'],
  catalog: createGlovoCatalog({ profile: privateDeliveryProfile }),
  jev: createJevClient({ apiKey: privateOpenRouterKey }),
  commit: false,
});
// Explicitly use commit:true to create and freshly verify a new guest basket.
```

An input may also be `{query, quantity: 1, features: ['wholegrain'], choices: []}`.
Quantity means whole native purchase increments; it is not interpreted as grams or milliliters.
Required customizations must be supplied explicitly. Duplicate selections of the same configured SKU
combine their quantities while retaining each input row in `matches`.

The CLI requires `--live` for either network operation. Provide `OPENROUTER_API_KEY` privately in
the process environment, and use the same private location profile described above:

```sh
# No network, no Jev key, and no real basket mutation:
node --test glovo/tests/basket-constructor.test.mjs

# Live read-only product plan; does not write a basket:
node glovo/tools/basket-constructor.mjs plan --live \
  --profile location-profile.json --items-file glovo/examples/pasta-basket.json --output plan.json

# Explicit live guest-basket creation, followed by a fresh verification:
node glovo/tools/basket-constructor.mjs create --live \
  --profile location-profile.json --items-file glovo/examples/pasta-basket.json --output basket-plan.json
```

`plan.json` / `basket-plan.json` contain the manifest, matches, three decision records, provider usage,
and fetched content paths. Creation also checkpoints private guest/location state in
`basket-plan.json.session.json`, compatible with `http-basket.mjs verify --session ...`.
Outputs must be new and are mode 0600. Full usage is retained; cached tokens are not subtracted,
and a missing provider cache breakdown remains unknown. No API key or delivery coordinates are
sent as Jev state. Native requests are serialized and paced at least 300 ms apart by default;
neither Jev requests nor native basket writes are retried automatically. No checkout is exposed.

Offline validation uses the recorded navigation and section layouts, synthetic product responses,
mocked Jev decisions and an in-memory basket. It verifies orchestration and payload behavior;
it does not establish Jev's live product-selection quality or today's Glovo availability.

## Verification

October 5, 2026, version 0.4.0:

- 28 local tests cover payloads, batch validation, matching, customized line identity, receipt ownership, external decreases, reinjection, timeout locking, transport deadlines, evidence agreement, and panel restoration.
- Fifteen live read/validation checks passed against 137 loaded McDonald's products.
- The original four queries resolved in one batch; a small chocolate shake with the SUP cup and the three other products were added in one call. Native UI evidence matched all five basket lines, including the existing Big Mac.
- Receipt cleanup removed the four additions. A fresh server read confirmed the original Big Mac ×1 remained.

```sh
node --test glovo/tests/adapter.test.mjs glovo/tests/bridge-client.test.mjs
node glovo/tools/bridge.mjs eval glovo/tools/verify-store.js
```

`verify-store.js` is read/validation only. Live artifacts are under [reports](reports/): `search-v0.4.json`, `additions-v0.4.json`, `basket-evidence-v0.4.json`, `basket-v0.4.png`, `cleanup-v0.4.json`, and `report-v0.4.json`. Earlier 0.3.0 verification and the original four-agent benchmark remain in their existing files.

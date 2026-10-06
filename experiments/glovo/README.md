# Glovo JavaScript adapter

Version **0.4.0** runs inside the signed-in Glovo page and calls its existing JavaScript. The panel is included in `adapter.js`; one injection installs both the API and the panel. No npm dependencies are needed.

The changes address the delays measured in [the agent transcript audit](benchmark/transcript-audit.md): separate product searches, repeated add/remove calls, reading the panel source to hide it, gathering native basket evidence, and manually constructing reports. [AGENT.md](AGENT.md) is the short operating guide.

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

The panel retains product search, option forms, add, read basket, and remove controls. Its buttons hide or collapse it without uninstalling the API. `panel.js` is now only a compatibility snippet that calls `panel.show()`.

`getBasketEvidence()` returns a fresh SDK basket plus native basket text, rows, quantities, options, rectangle, and `nativeMatchesStructured`. It compares only the native basket container, excluding menu product names. `prepareBasketScreenshot()` also hides the panel and scrolls the native basket into view. These methods report a mismatch rather than claiming verification when the UI differs. A direct successful preparation leaves the panel hidden; the CLI evidence command restores its previous state after capture, including on failures.

## CLI

The connected Kimi WebBridge daemon and extension must be running. Commands use the existing **glovo-webmcp** Chrome session and Node 22+. Open the store page and let it mount before injecting.

```sh
node experiments/glovo/bridge.mjs help
node experiments/glovo/bridge.mjs inject --panel hidden
node experiments/glovo/bridge.mjs schema
node experiments/glovo/bridge.mjs call searchMany '{"queries":["mcdouble","mcchicken","chocolate shake","ciastko jablkowe"],"includeOptions":"selected"}' --save search.json
# Write items.json using freshly returned IDs and explicit choices:
node experiments/glovo/bridge.mjs call addMany --input-file items.json --save additions.json
node experiments/glovo/bridge.mjs evidence basket.png
node experiments/glovo/bridge.mjs cleanup additions.json --save cleanup.json
node experiments/glovo/bridge.mjs report report.json
```

`--input-file` avoids inline JSON quoting; `--save` stores exact results for later cleanup. `cleanup` requires a completed addition result and sends its receipt IDs. CLI exit codes are 0 for success, 1 for an error, and 2 for an unknown/partial batch. An interrupted CLI is not proof a write failed; inspect the basket before retrying.

`evidence` saves the full viewport screenshot and a structured `.png.json` sidecar, or the path selected with `--save`. It hides/restores the panel automatically and records the screenshot as an artifact. Check `nativeMatchesStructured` and `nativeUi.visibleInViewport`; visually inspect the screenshot when the basket is too tall for the viewport.

Every command appends its wall time, transport timings, status, and relevant public results to `reports/transport.jsonl`. The adapter records up to 200 operation events, receipts, and initial baskets. `report` exports these with a fresh final basket, screenshot paths, and current-session transport records. `--input-file notes.json` adds a string array of human difficulty notes; mechanical results need no hand-written report JSON. These timings measure operations, not agent tokens or end-to-end agent benchmark performance.

The CLI uses WebBridge's `Runtime.evaluate` CDP interface for Promise results and exceptions. It temporarily enables focus emulation while evaluating so Glovo responds in its background tab; it does not switch the user's active tab. `snapshot`, `screenshot`, and `eval script.js` remain available. `eval` is an advanced escape hatch; routine tasks use the public methods.

## Implementation and lifecycle

Search reads React menu props and mounted product components. Mutations use the mounted cart SDK and native customization payloads. Authentication remains in Glovo's closures. `suggest(query)` calls the loaded autocomplete service, `search(query)` invokes the mounted search-selection callback, and `getCart()` reads all native baskets. Global search is unavailable on pages that do not mount its callback.

SDK basket reads use its cache by default; `{refresh:true}` fetches from the server. Totals come from Glovo and may exclude charges calculated later. Checkout and order placement are outside this adapter.

These are private React/webpack interfaces and can change. Missing components are reported rather than replaced with guessed endpoints. A document reload removes the adapter and in-memory history. Reinject after navigation to another store to refresh the panel. `uninstall()` removes the adapter and panel and restores any prior unrelated `window.glovoBridge`.

## Verification

October 5, 2026, version 0.4.0:

- 28 local tests cover payloads, batch validation, matching, customized line identity, receipt ownership, external decreases, reinjection, timeout locking, transport deadlines, evidence agreement, and panel restoration.
- Fifteen live read/validation checks passed against 137 loaded McDonald's products.
- The original four queries resolved in one batch; a small chocolate shake with the SUP cup and the three other products were added in one call. Native UI evidence matched all five basket lines, including the existing Big Mac.
- Receipt cleanup removed the four additions. A fresh server read confirmed the original Big Mac ×1 remained.

```sh
node --test experiments/glovo/adapter.test.mjs experiments/glovo/bridge-client.test.mjs
node experiments/glovo/bridge.mjs eval experiments/glovo/verify-store.js
```

`verify-store.js` is read/validation only. Live artifacts are under [reports](reports/): `search-v0.4.json`, `additions-v0.4.json`, `basket-evidence-v0.4.json`, `basket-v0.4.png`, `cleanup-v0.4.json`, and `report-v0.4.json`. Earlier 0.3.0 verification and the original four-agent benchmark remain in their existing files.

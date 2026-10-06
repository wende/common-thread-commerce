# Operating the Glovo adapter

Shopping agents must not create files. Pass arguments inline, keep results and receipt IDs in conversation or page memory, and report difficulties in chat. Do not create product plans, JSON results, notes, reports, scripts, or screenshot artifacts on disk. Do not use `bridge.mjs` for shopping runs: it writes a transport journal even without `--save`. Benchmark timing and token collection belong to the coordinator using existing runner telemetry.

Use the existing signed-in Chrome session `glovo-webmcp`; do not create another browser group. Open the requested store and wait for its menu to mount. Follow the applicable browser skill. This guide provides the shopping workflow; do not additionally read CLI help or implementation source unless a specific unresolved problem requires it. The adapter has no checkout method.

Call the public page API through the browser, or use the existing `bridge-client.mjs` module without the file-writing CLI. For example, from `/Users/wende/projects/shopping-assistant`:

```sh
node --input-type=module -e 'import { createClient } from "./experiments/glovo/bridge-client.mjs"; console.log(JSON.stringify(await createClient().call("searchMany", {queries:["mcdouble","mcchicken","chocolate shake","ciastko jablkowe"],includeOptions:"selected"})));'
```

If injection is needed, the module's `inject({panel:"hidden"})` reads the existing adapter source and installs it in page memory; it does not write files. Preserve the full `exec_command` result, including `exit_code` and `session_id`. If a session is returned, resume it with `write_stdin` until completion. Blank stdout does not establish failure and must not trigger a repeated mutation.

After the page is loaded, call `searchMany` for the requested products and `getStoreCart({refresh:true})` for the initial basket. Resolve `ambiguous`/`no_match` results before adding; inspect an unresolved candidate with `getProduct`. Use product IDs and available options returned by this live analysis. Pass the resolved `items` array directly to `addMany` as inline JSON. Each item has `productId`, optional `quantity`, and explicit `choices` for required options. Use the user's preferences; required choices must not be guessed. No saved plan is needed.

Check `addMany.status === "complete"`. On `unknown` or `partial`, read `getStoreCart({refresh:true})` and `inspect` to reconcile the outcome; do not repeat the write. Keep the returned receipt IDs for cleanup. Receipt cleanup preserves pre-existing quantities and rejects stale ownership after external basket changes.

For this benchmark, take exactly one confirming screenshot of the populated native basket and inspect it. Use an image-returning browser capture without saving a file; CDP `Page.captureScreenshot` can return image data in memory. `prepareBasketScreenshot` returns fresh structured/native evidence and hides the panel. Check `nativeMatchesStructured` and `nativeUi.visibleInViewport`; restore the previous panel state afterward if necessary. Do not use the client's `evidence` helper or request a screenshot output path, as those paths save files. The panel is already bundled; no separate panel script is needed.

Clean up with `removeMany({receiptIds:[...]})`, passing the IDs inline. Check the returned basket against the initial basket and use a fresh `getStoreCart({refresh:true})` if needed. An additional empty-basket screenshot is unnecessary unless the user requests it or the structured result leaves a concrete uncertainty. Report completion and difficulties in chat. If operation details are needed, `getReport({refresh:true,notes:[...]})` returns them in memory without an export file.

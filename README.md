# Common Thread Commerce

Dependency-free JavaScript that lets an AI agent shop inside a storefront it can already open in a browser.

| File | What it is | How it works |
| --- | --- | --- |
| [`shopping.js`](shopping.js) | Adapter for **WooCommerce, PrestaShop Classic and Magento Luma** | Add `<script defer src="/shopping.js"></script>` to the storefront. It detects the platform and exposes `shop_catalog` / `shop_cart` tools on `window.mcp` (or `window.shopAgent`). Call `window.mcp.help()`. |
| [`glovo.js`](glovo.js) | Adapter for **Glovo** | Inject it into a loaded Glovo store page. It wraps the page's own menu and cart SDK as `window.glovoBridge`. Call `glovoBridge.describe()`. |
| [`glovo-basket.mjs`](glovo-basket.mjs) | **Jev** basket builder for Glovo | Run `node glovo-basket.mjs` (Node 24+, Chrome). Chrome fetches the store menu, Jev picks products for your shopping list, and Glovo's own cart adds them. No checkout. |

Both adapters search the storefront's native catalog and change only that browser's basket. No order is ever placed.

## Layout

- `shopping/`: the three e-commerce adapters' guide, tests, benchmarks, reports, and `demo/` (Docker fixture with all three stores).
- `glovo/`: the Glovo adapter's guide, bridge tools, tests, benchmarks, reports, and the Jev basket-builder source.
- `tooling/`: test runner, bundler and the page build/preview scripts shared by both.
- `glovo.html`, `shop-agent.html`: the two published experiment pages.
- `presentation.html` (+ `presentation-assets/`): the "Agents Go Shopping" slide deck. Open it in a browser; arrows or click to navigate, `N` shows speaker notes, `F` goes fullscreen.

Results: [Glovo](glovo/reports/EXPERIMENT_REPORT_2026-10-05.md) · [Shopping](shopping/reports/WOO_LUNA_REAL_CATALOG_2026-10-06.md). Tests: `npm --prefix tooling test` (Node 22+).

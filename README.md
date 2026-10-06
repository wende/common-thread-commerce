# Glovo and Shopping page adapters

Two dependency-free JavaScript scripts expose shopping tools inside an existing storefront page. They search the native catalog and operate on that browser's basket.

| Script | Storefronts | Guide |
| --- | --- | --- |
| [glovo.js](glovo.js) | Glovo's loaded store menu and native cart SDK | [Glovo](glovo/README.md) · [Agent workflow](glovo/AGENT.md) |
| [shopping.js](shopping.js) | WooCommerce, PrestaShop Classic and Magento Luma | [Shopping](shopping/README.md) |

For Glovo, inject `glovo.js` into the loaded store page's main JavaScript world, then call `window.glovoBridge.describe()`. For Shopping, add `<script defer src="/shopping.js"></script>` to the shared storefront layout and call `window.mcp.help()` (or `window.shopAgent.help()` if the page already owns `window.mcp`). Temporary injection also works; reinject after full navigation. Use IDs and required options discovered from the current storefront.

## Experiment results

| Experiment | Observed improvement over bare browsing | Evidence |
| --- | --- | --- |
| Glovo, adapter 0.4.2 | **3.59× faster**, **77.9% fewer total tokens**, **73.2% fewer browser calls**; all baskets completed and cleaned up | [Report](glovo/reports/EXPERIMENT_REPORT_2026-10-05.md) · [Infographic](glovo/reports/EXPERIMENT_INFOGRAPHIC_2026-10-05.html) |
| Shopping, final benchmark revision 0.5.8 | **2.02× faster**, **3.92× fewer total tokens** across the final six/twelve/sixteen-need trio; **3/3 quality passes** | [Full 30-session campaign](shopping/reports/WOO_LUNA_REAL_CATALOG_2026-10-06.md) |

Total token counts include cached input once. Glovo used two runs per condition with Luna xhigh. Shopping used one bare reference per prompt with Luna medium and adaptive adapter revisions; all 27 adapter sessions averaged 2.08× faster and 4.33× fewer tokens, with 24/27 quality passes. These describe the recorded runs. Shipped Shopping version 0.5.9 includes a later Magento integration correction, tested separately from the benchmark.

## Repository layout

- `glovo/`: operating guide, CLI/client helpers, tests, historical benchmarks and evidence.
- `shopping/`: API guide, tests, offline measurement tools, fixed prompts and experiment reports.
- `demo/`: Docker storefront fixtures, shared catalog, setup/import scripts and verification screenshots. [Setup guide](demo/README.md).
- `tooling/`: test and fixture commands. [Development guide](tooling/README.md).
- `.runtime/` and `output/`: ignored local dependencies and private run artifacts.

Open the rendered experiment pages: [Shopping](https://wende.github.io/common-thread-experiment-pages/shop-agent.html) and [Glovo](https://wende.github.io/common-thread-experiment-pages/glovo.html). Both HTML files sit beside the two page scripts and can be opened directly in a browser.

## Check the scripts

Requires Node.js 22 or newer; no npm install is needed.

```sh
npm --prefix tooling test
```

The suite covers both page adapters, Glovo's browser transport and HTTP guest-basket helper. Shopping's offline accounting tests require the Python dependencies listed in [its measurement guide](shopping/benchmarks/README.md).

The local three-platform storefront fixture is optional. Run its Compose commands from `demo/`, or use `npm --prefix tooling run setup`. The Compose project name remains `common-thread-commerce`; local credentials are in the ignored `demo/.env`. No orders are placed by the experiment workflows.

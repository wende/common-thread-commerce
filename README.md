# Common Thread — three native e-commerce examples

The same invented catalog of **30 products in 5 categories**, running in three independent, real e-commerce engines:

| Store | Framework / native theme | Local URL |
| --- | --- | --- |
| WooCommerce | WordPress + WooCommerce / Storefront | http://localhost:8091/ |
| PrestaShop | PrestaShop / Classic | http://localhost:8092/ |
| Magento | Magento Open Source / Luma | http://localhost:8093/ |

All three use native product listings, category pages, product details, search, carts, and checkout. This is a local testing environment. Payment methods are offline demonstration methods; no money is collected.

## Why these three

The request was clarified to use **real local platforms: WooCommerce, PrestaShop, Magento**, since hosted platforms such as Shopify and Wix cannot be pulled and run locally as full platforms. These are established downloadable platforms, not a claim that they are the three biggest platforms by total store count. Broad popularity surveys include hosted products, and rankings vary by traffic, country, and detection method.

Sources checked on October 5, 2026:

- [BuiltWith e-commerce usage](https://trends.builtwith.com/shop)
- [WooCommerce developer documentation](https://developer.woocommerce.com/docs/getting-started/development-environment/)
- [PrestaShop Docker installation](https://devdocs.prestashop-project.org/9/basics/installation/environments/docker/)
- [Magento Open Source release notes](https://experienceleague.adobe.com/en/docs/commerce-operations/release/notes/magento-open-source/2-4-8)

## Run

Requires Git and a local Docker daemon with Docker Compose **2.24 or newer**, running Linux containers. Works with `amd64` and `arm64` images on macOS, Linux, and Windows through Docker Desktop + a WSL2 terminal. Budget at least 8 GB of Docker memory and 20 GB of free disk space. Initial setup needs internet access and can take several minutes, especially while building Magento's PHP extensions.

```sh
git clone https://github.com/wende/common-thread-commerce.git
cd common-thread-commerce
docker compose --profile tools run --build --rm -T bootstrap setup
```

This one command generates local credentials, starts MariaDB and OpenSearch, installs all three platforms, imports the catalog, and verifies it. No local Node, Python, PHP, Composer, or Adobe Marketplace credentials are required. Product images are included in the repository. `bash scripts/setup.sh` and `npm run setup` are optional wrappers for the same command.

Later:

```sh
docker compose up -d     # start existing stores
docker compose ps       # inspect status
docker compose down     # stop and retain saved store data
```

Docker named volumes preserve all three stores and the database across stops. `docker compose down -v` discards the demo's local data, allowing the next setup to create fresh stores. Keep the same `.env` while retaining the database volume.

The services bind to `127.0.0.1` and databases/search are only accessible within the Docker network. `.env` contains randomly generated local database and admin passwords and is ignored by Git.

The temporary `bootstrap` service uses the Docker socket to manage this Compose project and exits after setup. Its workspace mount lets it write `.env` and verification reports. The storefront containers do not mount that socket.

### Custom ports or a second copy

Generate credentials before changing ports:

```sh
docker compose --profile tools run --build --rm -T bootstrap init
```

Then add `WOO_PORT`, `PRESTA_PORT`, and `MAGENTO_PORT` to `.env` (see `.env.example`) before the first installation. Store URLs are saved in the applications' databases, so changing ports on an installed store also requires updating its native URL settings. Use a distinct Compose project for a second copy, for example `docker compose -p common-thread-test ...`, on **every** command for that copy. The setup helper inherits this project name and keeps its volumes separate.

### Troubleshooting

- Run `docker compose logs --tail=100` if setup fails. Fix the reported problem and rerun the same setup command; existing demo products are updated by SKU.
- If a port is occupied, choose different ports before installing as described above.
- On Linux, OpenSearch may require `vm.max_map_count` of at least `262144`; inspect its logs and, when needed, run `sudo sysctl -w vm.max_map_count=262144`. Docker Desktop manages the Linux VM separately.
- If Docker cannot read this directory, enable Docker Desktop file sharing for the clone's parent directory.
- On Windows, run these commands in WSL2 with Docker Desktop integration enabled, and keep the clone in the WSL Linux filesystem for better performance.

## Catalog

`catalog/products.json` is the single source of truth. `catalog/products.csv` contains the same records for inspection. Products have matching names, SKUs, descriptions, categories, USD prices, sale prices, stock quantities, and illustrative images across all stores.

- SKUs: `CT-001` through `CT-030`.
- Categories: Tees, Hoodies, Shirts, Headwear, Accessories (6 products each).
- Sale items: `CT-003`, `CT-011`, `CT-019`, `CT-028` (20% off).
- Out of stock: `CT-018`, `CT-030`.
- Prices are displayed without tax; shipping is separate.
- The invented product metadata is original demo content. Images are reused from WooCommerce's official sample catalog; attribution is in `catalog/assets/SOURCES.txt`. Some similar products intentionally share an illustrative photo.

The imports use each platform's native PHP product APIs. Rerunning setup updates the demo products by SKU. On the first PrestaShop import, its bundled sample merchandise is replaced by this catalog.

## Admin

| Platform | Admin URL | Username |
| --- | --- | --- |
| WooCommerce | http://localhost:8091/wp-admin/ | `admin` |
| PrestaShop | http://localhost:8092/admin-dev/ | `admin@example.test` |
| Magento | http://localhost:8093/admin_demo/ | `admin` |

Read `ADMIN_PASSWORD` in the local `.env` file. Magento retains its native admin authentication requirements, including two-factor authentication.

## Versions and sources

- WordPress `7.1.2` with PHP `8.3` (official WordPress Docker image).
- WooCommerce `11.1.2` and Storefront `4.6.2` (official WordPress plugin/theme downloads).
- PrestaShop `9.2.0` with Classic `3.1.2` (official PrestaShop Docker image).
- Magento Open Source `2.4.8-p5`, PHP `8.4`, MariaDB `11.4`, OpenSearch `2.19.3`.
- Magento packages come from the [Mage-OS public mirror](https://mirror.mage-os.org/), which distributes Magento Open Source packages without requiring Adobe Marketplace credentials. This installation is Magento Open Source, not a Mage-OS platform substitution.

All Docker base images are pinned by multi-architecture digest. Magento's exact dependency graph is committed in `docker/magento/composer.lock`; setup uses `composer install`, rather than resolving new dependency versions. WooCommerce and Storefront downloads use fixed release versions. OS package repositories and application download servers still need to be reachable for a fresh build.

Source and setup files are in `compose.yaml`, `docker/`, and `scripts/`. Installed applications and their dependencies live in Docker named volumes. Credentials, installed application files, customer data, and unrelated workspace experiments are excluded from this repository.

## Verify

```sh
docker compose --profile tools run --rm -T bootstrap verify
```

This compares each engine's saved native product records with the shared catalog, including counts, categories, prices, discounts, stock and product images. Setup runs this verification automatically and fails if any engine differs.

The original browser checks covered the rendered desktop and mobile storefronts, adding and removing a discounted item in each native cart, and opening checkout forms. No orders were placed. Screenshots and verification reports are saved in `screenshots/`. The `verify` command checks saved catalog records; it does not repeat interactive browser checks.

An independent installation with new credentials and empty Docker volumes was tested on macOS / Apple Silicon with Docker `29.5.3` and Compose `2.40.3`. All three engines passed catalog comparisons and rendered all 30 products without broken images. The report is `screenshots/reproduction-verification.json`. The pinned image manifests also provide `amd64`; other host operating systems and CPUs were not physically tested in this session.

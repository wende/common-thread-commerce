"""Append deterministic image-free filler products and import the shared catalog."""
import argparse
import csv
import json
import subprocess
import sys

from runtime import compose_command, project_root


def generate(root, count):
    path = root / "catalog/products.json"
    catalog = json.loads(path.read_text())
    products = catalog["products"]
    by_sku = {p["sku"]: p for p in products}
    if len(by_sku) != len(products):
        raise RuntimeError("The existing catalog contains duplicate SKUs.")
    categories = list(dict.fromkeys(p["category"] for p in products
                                   if not p["sku"].startswith("CT-NOISE-")))
    if not categories:
        raise RuntimeError("Populate the original catalog first.")
    next_id = max(p["id"] for p in products) + 1
    added = 0
    for index in range(1, count + 1):
        sku = f"CT-NOISE-{index:04d}"
        old = by_sku.get(sku)
        product = dict(
            id=old["id"] if old else next_id,
            sku=sku, slug=f"noise-product-{index:04d}",
            name=f"Noise Product {index:04d}",
            category=categories[(index - 1) % len(categories)],
            description=f"Generic catalog filler item {index:04d} for scale experiments.",
            short_description=f"Generic filler item {index:04d}.",
            color=None, price=(index - 1) % 50 + 1, sale_price=None,
            stock=100, weight_kg=0.25, image=None,
        )
        if old:
            if old != product:
                raise RuntimeError(f"Existing {sku} differs from the generated filler record.")
            continue
        products.append(product)
        added += 1
        next_id += 1
    path.write_text(json.dumps(catalog, indent=2) + "\n")
    with (root / "catalog/products.csv").open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(products[0]))
        writer.writeheader()
        writer.writerows(products)
    print(f"Added {added} image-free filler records; catalog now has {len(products)} products.",
          flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=500,
                        help="Total number of numbered filler products to ensure (default: 500).")
    parser.add_argument("--generate-only", action="store_true")
    args = parser.parse_args()
    if args.count < 1:
        parser.error("--count must be positive")
    root = project_root()
    generate(root, args.count)
    if args.generate_only:
        return
    compose = compose_command(root)
    commands = [
        ("WooCommerce", ["run", "--rm", "-T", "wpcli", "wp", "eval-file",
                         "/demo-scripts/seed-woocommerce.php"]),
        ("PrestaShop", ["exec", "-T", "--user", "www-data", "prestashop", "php",
                       "/demo-scripts/seed-prestashop.php"]),
        ("Magento", ["exec", "-T", "--user", "www-data", "magento", "php",
                     "/demo-scripts/seed-magento.php"]),
        ("Magento indexes", ["exec", "-T", "--user", "www-data", "magento", "php",
                             "bin/magento", "indexer:reindex"]),
        ("Magento caches", ["exec", "-T", "--user", "www-data", "magento", "php",
                            "bin/magento", "cache:flush"]),
    ]
    for label, command in commands:
        print(f"Importing/refreshing {label}…", flush=True)
        subprocess.run(compose + command, cwd=root, check=True)
    subprocess.run([sys.executable, str(root / "scripts/verify.py")], cwd=root, check=True)


if __name__ == "__main__":
    main()

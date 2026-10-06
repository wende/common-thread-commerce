"""Docker-only setup and verification; also runnable with Python 3 on the host."""
import argparse
import os
import secrets
import subprocess
import sys
import time

from runtime import compose_command, project_root

ROOT = project_root()
COMPOSE = compose_command(ROOT)


def run(*args, capture=False, check=True):
    result = subprocess.run(COMPOSE + list(args), cwd=ROOT, text=True,
                            capture_output=capture)
    if check and result.returncode:
        # Native installer arguments contain passwords; do not include them in errors.
        raise RuntimeError(f"Docker Compose {args[0]} failed (exit {result.returncode}). "
                           "Inspect docker compose logs, then rerun setup.")
    return result


def init():
    env = ROOT / ".env"
    if not env.exists():
        content = (f"DB_ROOT_PASSWORD={secrets.token_hex(18)}\n"
                   f"DB_PASSWORD={secrets.token_hex(18)}\n"
                   f"ADMIN_PASSWORD=Demo-{secrets.token_hex(10)}!\n")
        fd = os.open(env, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as file:
            file.write(content)
        if os.environ.get("COMMON_THREAD_BOOTSTRAP") == "1":
            owner = ROOT.stat()
            os.chown(env, owner.st_uid, owner.st_gid)
        print("Generated local passwords in .env (excluded from Git).", flush=True)


def settings():
    values = {}
    for line in (ROOT / ".env").read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.partition("=")
        if sep:
            values[key.strip()] = value.strip().strip("\"'")
    for key in ("DB_ROOT_PASSWORD", "DB_PASSWORD", "ADMIN_PASSWORD"):
        value = os.environ.get(key, values.get(key, ""))
        if not value or value.startswith("replace-with-"):
            raise RuntimeError(f"Set {key} in .env, or remove the unused template .env "
                               "and let setup generate local passwords.")
        values[key] = value
    for key, default in (("WOO_PORT", "8091"), ("PRESTA_PORT", "8092"), ("MAGENTO_PORT", "8093")):
        values[key] = os.environ.get(key, values.get(key, default))
        if not values[key].isdigit() or not 1 <= int(values[key]) <= 65535:
            raise RuntimeError(f"{key} must be a TCP port between 1 and 65535.")
    return values


def wait_for(label, args, timeout):
    print(f"Waiting for {label}…", flush=True)
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if run(*args, capture=True, check=False).returncode == 0:
            return
        time.sleep(3)
    raise RuntimeError(f"Timed out waiting for {label}. Inspect docker compose logs.")


def wp(*args, **kwargs):
    return run("run", "--rm", "-T", "wpcli", "wp", *args, **kwargs)


def setup_woocommerce(values):
    wait_for("WordPress files", ("exec", "-T", "woocommerce", "test", "-f",
                                "/var/www/html/wp-config.php"), 240)
    if wp("core", "is-installed", capture=True, check=False).returncode:
        wp("core", "install", f"--url=http://localhost:{values['WOO_PORT']}",
           "--title=Common Thread", "--admin_user=admin", "--admin_email=admin@example.test",
           f"--admin_password={values['ADMIN_PASSWORD']}", "--skip-email")
    if wp("core", "version", capture=True).stdout.strip() != "7.1.2":
        wp("core", "update", "--version=7.1.2")
        wp("core", "update-db")
    wp("plugin", "install", "woocommerce", "--version=11.1.2", "--activate")
    wp("theme", "install", "storefront", "--version=4.6.2", "--activate")
    run("exec", "-T", "woocommerce", "mkdir", "-p", "/var/www/html/wp-content/mu-plugins")
    run("exec", "-T", "woocommerce", "cp", "/demo-scripts/common-thread-woocommerce.php",
        "/var/www/html/wp-content/mu-plugins/common-thread.php")
    wp("eval-file", "/demo-scripts/seed-woocommerce.php")


def setup_prestashop(values):
    wait_for("PrestaShop installation", (
        "exec", "-T", "prestashop", "sh", "-c",
        'test -f /var/www/html/app/config/parameters.php && '
        'curl -fsS --connect-timeout 5 --max-time 30 --header "$1" http://127.0.0.1/ >/dev/null',
        "wait-presta", f"Host: localhost:{values['PRESTA_PORT']}",
    ), 900)
    run("exec", "-T", "--user", "www-data", "prestashop", "php", "/demo-scripts/seed-prestashop.php")


def setup_magento(values):
    if run("exec", "-T", "magento", "test", "-f", "/var/www/html/bin/magento",
           capture=True, check=False).returncode:
        if run("exec", "-T", "magento", "test", "-f", "/tmp/magento-download/composer.json",
               capture=True, check=False).returncode:
            run("exec", "-T", "magento", "composer", "create-project",
                "--repository-url=https://mirror.mage-os.org/",
                "magento/project-community-edition=2.4.8-p5", "/tmp/magento-download",
                "--no-dev", "--no-install", "--no-interaction")
        run("exec", "-T", "magento", "sh", "-c",
            "cp /opt/magento-project/composer.json /opt/magento-project/composer.lock /tmp/magento-download/")
        run("exec", "-T", "--workdir", "/tmp/magento-download", "magento", "composer",
            "install", "--no-dev", "--no-interaction")
        run("exec", "-T", "magento", "sh", "-c",
            "cp -a /tmp/magento-download/. /var/www/html/ && "
            "rm -rf /tmp/magento-download && chown -R www-data:www-data /var/www/html")
    if run("exec", "-T", "magento", "test", "-f", "/var/www/html/app/etc/env.php",
           capture=True, check=False).returncode:
        run("exec", "-T", "--user", "www-data", "magento", "php", "bin/magento", "setup:install",
            f"--base-url=http://localhost:{values['MAGENTO_PORT']}/", "--db-host=db",
            "--db-name=magento", "--db-user=demo", f"--db-password={values['DB_PASSWORD']}",
            "--admin-firstname=Demo", "--admin-lastname=Admin", "--admin-email=admin@example.test",
            "--admin-user=admin", f"--admin-password={values['ADMIN_PASSWORD']}",
            "--backend-frontname=admin_demo", "--language=en_US", "--currency=USD",
            "--timezone=Europe/Warsaw", "--use-rewrites=1", "--search-engine=opensearch",
            "--opensearch-host=opensearch", "--opensearch-port=9200", "--opensearch-enable-auth=0")
    for args in (("bin/magento", "deploy:mode:set", "developer"),
                 ("/demo-scripts/seed-magento.php",),
                 ("bin/magento", "cache:clean", "config"),
                 ("bin/magento", "indexer:reindex"),
                 ("bin/magento", "setup:static-content:deploy", "-f", "en_US", "--area", "frontend",
                  "--theme", "Magento/luma"), ("bin/magento", "cache:flush")):
        run("exec", "-T", "--user", "www-data", "magento", "php", *args)


def verify():
    result = subprocess.run([sys.executable, str(ROOT / "scripts/verify.py")], cwd=ROOT)
    if result.returncode:
        raise RuntimeError("Catalog verification failed. See screenshots/verification.json.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("init", "setup", "setup-magento", "verify", "catalog"),
                        nargs="?", default="setup")
    args = parser.parse_args()
    if args.command == "init":
        init()
    elif args.command == "verify":
        verify()
    elif args.command == "catalog":
        subprocess.run([sys.executable, str(ROOT / "scripts/make-catalog.py")], cwd=ROOT, check=True)
    else:
        init()
        values = settings()
        if args.command == "setup":
            run("up", "-d", "--build", "--wait", "--wait-timeout", "300",
                "db", "opensearch", "woocommerce", "prestashop", "magento")
            setup_woocommerce(values)
            setup_prestashop(values)
        setup_magento(values)
        verify()
        for platform, key in (("WooCommerce", "WOO_PORT"), ("PrestaShop", "PRESTA_PORT"), ("Magento", "MAGENTO_PORT")):
            print(f"{platform}: http://localhost:{values[key]}/", flush=True)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError) as error:
        print(f"ERROR: {error if isinstance(error, RuntimeError) else 'Docker/runtime command failed.'}", file=sys.stderr)
        sys.exit(1)

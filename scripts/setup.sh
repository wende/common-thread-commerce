#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec docker compose --profile tools run --build --rm -T bootstrap setup

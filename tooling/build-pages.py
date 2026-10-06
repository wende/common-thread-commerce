#!/usr/bin/env python3
"""Build the public site from an explicit list of approved files."""
from pathlib import Path
import argparse
import shutil

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_FILES = (
    'shop-agent.html',
    'glovo.html',
    'shopping.js',
    'glovo.js',
    'shopping/reports/WOO_LUNA_REAL_CATALOG_2026-10-06.md',
    'glovo/reports/EXPERIMENT_REPORT_2026-10-05.md',
)

def build(destination):
    destination = destination.resolve()
    if destination == ROOT or destination in ROOT.parents:
        raise ValueError('Choose a separate output directory.')
    if destination.exists() and any(destination.iterdir()):
        raise ValueError('Output directory must be empty.')
    for relative in PUBLIC_FILES:
        source = ROOT / relative
        if not source.is_file() or source.is_symlink():
            raise ValueError(f'Expected a regular source file: {relative}')
    destination.mkdir(parents=True, exist_ok=True)
    for relative in PUBLIC_FILES:
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / relative, target)
    shutil.copyfile(ROOT / 'shop-agent.html', destination / 'index.html')
    (destination / '.nojekyll').touch()
    print(f'Built {len(PUBLIC_FILES)} approved files, a homepage alias and .nojekyll in {destination}')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path)
    build(parser.parse_args().destination)

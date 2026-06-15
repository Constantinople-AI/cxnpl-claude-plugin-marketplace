#!/usr/bin/env python3
"""Unpack a Claude Code plugin marketplace into a flat list of plugins.

Claude Code understands a *marketplace* repo (a repo with
`.claude-plugin/marketplace.json` that points at nested plugins). Claude Cowork
does not understand marketplaces -- it wants each plugin to be its own directory
sitting flat in the plugins folder.

This script discovers every plugin inside this marketplace repo and copies each
one out as a sibling of the repo (i.e. into the directory one level above the
repo root). Typical usage:

    # plugins/
    #   cxnpl-claude-plugin-marketplace/   <- you cloned the repo here
    cd cxnpl-claude-plugin-marketplace
    python3 unpack_marketplace.py

    # result -- plugins are now flat siblings of the repo:
    # plugins/
    #   cxnpl-claude-plugin-marketplace/
    #   quality-review-plugin/
    #   test-plugin-marketplace/
    #   test2-plugin2-marketplace1/
    #   test-plugin-root/

A plugin is any directory containing `.claude-plugin/plugin.json`. This catches
plugins under `plugins/`, plugins referenced by `marketplace.json`, and plugins
that live at the root of the marketplace.

The script is idempotent: every run replaces the unpacked plugin directories, so
re-running after a `git pull` always leaves the parent folder holding the latest
version of every plugin.

Cross-platform: relies only on the Python standard library (pathlib / shutil).
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

# Directories we never descend into while searching for plugins.
SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv"}


def find_plugins(marketplace_root: Path) -> list[Path]:
    """Return the root directory of every plugin found inside the marketplace.

    A plugin root is a directory that contains `.claude-plugin/plugin.json`.
    The marketplace repo itself (which has `.claude-plugin/marketplace.json`,
    not `plugin.json`) is not treated as a plugin.
    """
    found: list[Path] = []

    for plugin_json in marketplace_root.rglob(".claude-plugin/plugin.json"):
        # Skip anything inside a directory we don't care about.
        if any(part in SKIP_DIRS for part in plugin_json.parts):
            continue
        # plugin_json == <plugin_root>/.claude-plugin/plugin.json
        plugin_root = plugin_json.parent.parent
        if plugin_root == marketplace_root:
            # The marketplace root itself acting as a plugin -- skip; copying the
            # whole repo onto itself is never what we want here.
            continue
        found.append(plugin_root)

    # If one plugin is nested inside another, keep only the outermost.
    found = [
        p
        for p in found
        if not any(other != p and other in p.parents for other in found)
    ]

    # Stable, predictable order.
    return sorted(set(found), key=lambda p: p.as_posix())


def plugin_name(plugin_root: Path) -> str:
    """The destination directory name for a plugin.

    Prefer the `name` field from plugin.json; fall back to the directory name.
    """
    plugin_json = plugin_root / ".claude-plugin" / "plugin.json"
    try:
        data = json.loads(plugin_json.read_text(encoding="utf-8"))
        name = data.get("name")
        if isinstance(name, str) and name.strip():
            return name.strip()
    except (OSError, json.JSONDecodeError):
        pass
    return plugin_root.name


def _ignore_git(_dir: str, names: list[str]) -> set[str]:
    """Ignore VCS metadata when copying a plugin tree."""
    return {n for n in names if n in SKIP_DIRS}


def copy_plugin(plugin_root: Path, dest: Path, *, dry_run: bool) -> bool:
    """Copy one plugin to `dest`, replacing whatever is already there.

    Always overwrites so re-running the script is idempotent and the parent
    folder always ends up with the latest version of every plugin.
    """
    existed = dest.exists()
    if existed and not dry_run:
        shutil.rmtree(dest)

    action = "WOULD UPDATE" if dry_run else "UPDATE"
    if not existed:
        action = "WOULD COPY" if dry_run else "COPY"
    print(f"  {action}  {plugin_root.name}  ->  {dest}")
    if not dry_run:
        shutil.copytree(plugin_root, dest, ignore=_ignore_git)
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Flatten a Claude Code plugin marketplace into sibling plugin "
        "directories for Claude Cowork.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--dest",
        type=Path,
        default=None,
        help="Directory to copy plugins into (default: the parent of the "
        "marketplace repo).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would happen without copying anything.",
    )
    args = parser.parse_args(argv)

    # The marketplace root is the directory this script lives in.
    marketplace_root = Path(__file__).resolve().parent
    dest_dir = (args.dest.resolve() if args.dest else marketplace_root.parent)

    print(f"Marketplace: {marketplace_root}")
    print(f"Destination: {dest_dir}")

    if not dest_dir.exists():
        if args.dry_run:
            print(f"  WOULD CREATE  {dest_dir}")
        else:
            dest_dir.mkdir(parents=True, exist_ok=True)

    plugins = find_plugins(marketplace_root)
    if not plugins:
        print("No plugins found (looked for .claude-plugin/plugin.json).")
        return 1

    print(f"Found {len(plugins)} plugin(s):")
    copied = 0
    for plugin_root in plugins:
        dest = dest_dir / plugin_name(plugin_root)

        # Guard against copying onto the marketplace repo itself.
        if dest.resolve() == marketplace_root:
            print(f"  SKIP  {dest.name}  (would overwrite the marketplace repo)")
            continue

        if copy_plugin(plugin_root, dest, dry_run=args.dry_run):
            copied += 1

    verb = "would be updated" if args.dry_run else "updated"
    print(f"\nDone. {copied}/{len(plugins)} plugin(s) {verb}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

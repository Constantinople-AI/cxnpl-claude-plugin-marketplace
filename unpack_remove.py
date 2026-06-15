#!/usr/bin/env python3
"""Remove plugins that were unpacked by `unpack_marketplace.py`.

This is the inverse of `unpack_marketplace.py`. It discovers every plugin inside
this marketplace repo and deletes the matching plugin directory from the parent
folder (one level above the repo root). The marketplace repo itself is never
touched.

    cd cxnpl-claude-plugin-marketplace
    python3 unpack_remove.py

    # before:                          # after:
    # plugins/                         # plugins/
    #   cxnpl-claude-plugin-marketplace/ #   cxnpl-claude-plugin-marketplace/
    #   quality-review-plugin/
    #   test-plugin-marketplace/
    #   test2-plugin2-marketplace1/
    #   test-plugin-root/

A directory is only removed if it looks like a plugin we unpacked, i.e. it
contains `.claude-plugin/plugin.json`. This guards against deleting an unrelated
sibling directory that happens to share a name.

Cross-platform: relies only on the Python standard library (pathlib / shutil).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Reuse the same plugin-discovery logic as the unpack script.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from unpack_marketplace import find_plugins, plugin_name  # noqa: E402


def is_plugin_dir(path: Path) -> bool:
    """True if `path` looks like an unpacked plugin (has plugin.json)."""
    return (path / ".claude-plugin" / "plugin.json").is_file()


def remove_plugin(dest: Path, *, dry_run: bool) -> bool:
    """Remove one unpacked plugin directory. Returns True if removed/would be."""
    import shutil

    if not dest.exists():
        print(f"  MISSING  {dest.name}  (nothing to remove)")
        return False
    if not is_plugin_dir(dest):
        print(f"  SKIP  {dest.name}  (not a plugin directory; left untouched)")
        return False

    action = "WOULD REMOVE" if dry_run else "REMOVE"
    print(f"  {action}  {dest}")
    if not dry_run:
        shutil.rmtree(dest)
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Remove plugins previously unpacked by unpack_marketplace.py "
        "from the parent folder.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--dest",
        type=Path,
        default=None,
        help="Directory the plugins were unpacked into (default: the parent of "
        "the marketplace repo).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be removed without deleting anything.",
    )
    args = parser.parse_args(argv)

    marketplace_root = Path(__file__).resolve().parent
    dest_dir = args.dest.resolve() if args.dest else marketplace_root.parent

    print(f"Marketplace: {marketplace_root}")
    print(f"Destination: {dest_dir}")

    plugins = find_plugins(marketplace_root)
    if not plugins:
        print("No plugins found (looked for .claude-plugin/plugin.json).")
        return 1

    print(f"Found {len(plugins)} plugin(s) to remove:")
    removed = 0
    for plugin_root in plugins:
        dest = dest_dir / plugin_name(plugin_root)

        # Never delete the marketplace repo itself.
        if dest.resolve() == marketplace_root:
            print(f"  SKIP  {dest.name}  (this is the marketplace repo)")
            continue

        if remove_plugin(dest, dry_run=args.dry_run):
            removed += 1

    verb = "would be removed" if args.dry_run else "removed"
    print(f"\nDone. {removed}/{len(plugins)} plugin(s) {verb}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

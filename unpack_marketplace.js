#!/usr/bin/env node
/**
 * Unpack a Claude Code plugin marketplace into a flat list of plugins.
 *
 * Claude Code understands a *marketplace* repo (a repo with
 * `.claude-plugin/marketplace.json` that points at nested plugins). Claude
 * Cowork does not understand marketplaces -- it wants each plugin to be its own
 * directory sitting flat in the plugins folder.
 *
 * This script discovers every plugin inside this marketplace repo and copies
 * each one out as a sibling of the repo (i.e. into the directory one level above
 * the repo root). Typical usage:
 *
 *     // plugins/
 *     //   cxnpl-claude-plugin-marketplace/   <- you cloned the repo here
 *     cd cxnpl-claude-plugin-marketplace
 *     node unpack_marketplace.js
 *
 *     // result -- plugins are now flat siblings of the repo:
 *     // plugins/
 *     //   cxnpl-claude-plugin-marketplace/
 *     //   quality-review-plugin/
 *     //   test-plugin-marketplace/
 *     //   test2-plugin2-marketplace1/
 *     //   test-plugin-root/
 *
 * A plugin is any directory containing `.claude-plugin/plugin.json`. This
 * catches plugins under `plugins/`, plugins referenced by `marketplace.json`,
 * and plugins that live at the root of the marketplace.
 *
 * The script is idempotent: every run replaces the unpacked plugin directories,
 * so re-running after a `git pull` always leaves the parent folder holding the
 * latest version of every plugin.
 *
 * Cross-platform: relies only on the Node.js standard library (fs / path).
 * Requires Node 16.7+ (for fs.cpSync).
 */

"use strict";

const fs = require("fs");
const path = require("path");

// Directories we never descend into while searching for / copying plugins.
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "__pycache__",
  ".venv",
  "venv",
]);

/**
 * Recursively find the root directory of every plugin inside the marketplace.
 * A plugin root is a directory that contains `.claude-plugin/plugin.json`.
 */
function findPlugins(marketplaceRoot) {
  const found = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    // Is this directory itself a plugin root?
    const pluginJson = path.join(dir, ".claude-plugin", "plugin.json");
    if (dir !== marketplaceRoot && fs.existsSync(pluginJson)) {
      found.push(dir);
      // Don't descend into a plugin looking for nested plugins.
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
        walk(path.join(dir, entry.name));
      }
    }
  }

  walk(marketplaceRoot);

  // Stable, predictable order.
  found.sort();
  return found;
}

/**
 * The destination directory name for a plugin: prefer the `name` field from
 * plugin.json, fall back to the directory name.
 */
function pluginName(pluginRoot) {
  const pluginJson = path.join(pluginRoot, ".claude-plugin", "plugin.json");
  try {
    const data = JSON.parse(fs.readFileSync(pluginJson, "utf8"));
    if (typeof data.name === "string" && data.name.trim()) {
      return data.name.trim();
    }
  } catch {
    /* fall through to directory name */
  }
  return path.basename(pluginRoot);
}

/** Copy one plugin to `dest`, replacing whatever is already there. */
function copyPlugin(pluginRoot, dest, { dryRun }) {
  const existed = fs.existsSync(dest);
  if (existed && !dryRun) {
    fs.rmSync(dest, { recursive: true, force: true });
  }

  let action;
  if (existed) action = dryRun ? "WOULD UPDATE" : "UPDATE";
  else action = dryRun ? "WOULD COPY" : "COPY";
  console.log(`  ${action}  ${path.basename(pluginRoot)}  ->  ${dest}`);

  if (!dryRun) {
    fs.cpSync(pluginRoot, dest, {
      recursive: true,
      filter: (src) => !SKIP_DIRS.has(path.basename(src)),
    });
  }
  return true;
}

function parseArgs(argv) {
  const opts = { dest: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--dest") opts.dest = argv[++i];
    else if (arg.startsWith("--dest=")) opts.dest = arg.slice("--dest=".length);
    else if (arg === "-h" || arg === "--help") {
      console.log(
        "Usage: node unpack_marketplace.js [--dest DIR] [--dry-run]\n\n" +
          "Flatten this Claude Code plugin marketplace into sibling plugin\n" +
          "directories for Claude Cowork.\n\n" +
          "  --dest DIR   Directory to copy plugins into (default: parent of repo)\n" +
          "  --dry-run    Show what would happen without copying anything"
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  // The marketplace root is the directory this script lives in.
  const marketplaceRoot = __dirname;
  const destDir = opts.dest
    ? path.resolve(opts.dest)
    : path.dirname(marketplaceRoot);

  console.log(`Marketplace: ${marketplaceRoot}`);
  console.log(`Destination: ${destDir}`);

  if (!fs.existsSync(destDir)) {
    if (opts.dryRun) console.log(`  WOULD CREATE  ${destDir}`);
    else fs.mkdirSync(destDir, { recursive: true });
  }

  const plugins = findPlugins(marketplaceRoot);
  if (plugins.length === 0) {
    console.log("No plugins found (looked for .claude-plugin/plugin.json).");
    process.exit(1);
  }

  console.log(`Found ${plugins.length} plugin(s):`);
  let copied = 0;
  for (const pluginRoot of plugins) {
    const dest = path.join(destDir, pluginName(pluginRoot));

    // Guard against copying onto the marketplace repo itself.
    if (path.resolve(dest) === path.resolve(marketplaceRoot)) {
      console.log(
        `  SKIP  ${path.basename(dest)}  (would overwrite the marketplace repo)`
      );
      continue;
    }

    if (copyPlugin(pluginRoot, dest, opts)) copied++;
  }

  const verb = opts.dryRun ? "would be updated" : "updated";
  console.log(`\nDone. ${copied}/${plugins.length} plugin(s) ${verb}.`);
}

main();

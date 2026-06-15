#!/usr/bin/env node
/**
 * Remove plugins that were unpacked by `unpack_marketplace.js`.
 *
 * This is the inverse of `unpack_marketplace.js`. It discovers every plugin
 * inside this marketplace repo and deletes the matching plugin directory from
 * the parent folder (one level above the repo root). The marketplace repo
 * itself is never touched.
 *
 *     cd cxnpl-claude-plugin-marketplace
 *     node unpack_remove.js
 *
 * A directory is only removed if it looks like a plugin we unpacked, i.e. it
 * contains `.claude-plugin/plugin.json`. This guards against deleting an
 * unrelated sibling directory that happens to share a name.
 *
 * Cross-platform: relies only on the Node.js standard library (fs / path).
 */

"use strict";

const fs = require("fs");
const path = require("path");

// Directories we never descend into while searching for plugins.
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

    const pluginJson = path.join(dir, ".claude-plugin", "plugin.json");
    if (dir !== marketplaceRoot && fs.existsSync(pluginJson)) {
      found.push(dir);
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
        walk(path.join(dir, entry.name));
      }
    }
  }

  walk(marketplaceRoot);
  found.sort();
  return found;
}

/** Prefer the `name` field from plugin.json, fall back to the directory name. */
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

/** True if `dir` looks like an unpacked plugin (has plugin.json). */
function isPluginDir(dir) {
  return fs.existsSync(path.join(dir, ".claude-plugin", "plugin.json"));
}

/** Remove one unpacked plugin directory. */
function removePlugin(dest, { dryRun }) {
  if (!fs.existsSync(dest)) {
    console.log(`  MISSING  ${path.basename(dest)}  (nothing to remove)`);
    return false;
  }
  if (!isPluginDir(dest)) {
    console.log(
      `  SKIP  ${path.basename(dest)}  (not a plugin directory; left untouched)`
    );
    return false;
  }

  const action = dryRun ? "WOULD REMOVE" : "REMOVE";
  console.log(`  ${action}  ${dest}`);
  if (!dryRun) fs.rmSync(dest, { recursive: true, force: true });
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
        "Usage: node unpack_remove.js [--dest DIR] [--dry-run]\n\n" +
          "Remove plugins previously unpacked by unpack_marketplace.js from the\n" +
          "parent folder.\n\n" +
          "  --dest DIR   Directory the plugins were unpacked into (default: parent of repo)\n" +
          "  --dry-run    Show what would be removed without deleting anything"
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

  const marketplaceRoot = __dirname;
  const destDir = opts.dest
    ? path.resolve(opts.dest)
    : path.dirname(marketplaceRoot);

  console.log(`Marketplace: ${marketplaceRoot}`);
  console.log(`Destination: ${destDir}`);

  const plugins = findPlugins(marketplaceRoot);
  if (plugins.length === 0) {
    console.log("No plugins found (looked for .claude-plugin/plugin.json).");
    process.exit(1);
  }

  console.log(`Found ${plugins.length} plugin(s) to remove:`);
  let removed = 0;
  for (const pluginRoot of plugins) {
    const dest = path.join(destDir, pluginName(pluginRoot));

    // Never delete the marketplace repo itself.
    if (path.resolve(dest) === path.resolve(marketplaceRoot)) {
      console.log(`  SKIP  ${path.basename(dest)}  (this is the marketplace repo)`);
      continue;
    }

    if (removePlugin(dest, opts)) removed++;
  }

  const verb = opts.dryRun ? "would be removed" : "removed";
  console.log(`\nDone. ${removed}/${plugins.length} plugin(s) ${verb}.`);
}

main();

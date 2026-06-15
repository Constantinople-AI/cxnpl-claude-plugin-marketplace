# Constantinople AI — Claude Plugin Marketplace

This repo is a **Claude Code plugin marketplace**: a Git repository with a
`.claude-plugin/marketplace.json` file that lists a set of plugins Claude Code
can discover and install.

📖 See the official docs: <https://code.claude.com/docs/en/plugin-marketplaces>

## What's in here

```
.claude-plugin/marketplace.json   # the marketplace manifest (lists the plugins)
plugins/                          # plugins referenced by the manifest
  quality-review-plugin/
  test-plugin-marketplace/
  test2-plugin2-marketplace1/
test-plugin-root/                 # a plugin that lives at the repo root
unpack_marketplace.py             # Cowork helper — flatten plugins (see below)
unpack_remove.py                  # Cowork helper — undo the flatten (see below)
```

Each plugin is a directory containing its own `.claude-plugin/plugin.json`.

---

## Setup for Claude Code

Claude Code understands marketplaces out of the box — just add this repo by URL,
then install plugins from it:

```
/plugin marketplace add Constantinople-AI/cxnpl-claude-plugin-marketplace
/plugin install quality-review-plugin@constantinople-ai-plugins
```

(`constantinople-ai-plugins` is the marketplace `name` from `marketplace.json`.)
You can also browse and install interactively with `/plugin`.

That's it — Claude Code resolves the nested plugins from the manifest for you.

---

## Setup for Claude Cowork

**Claude Cowork does not support marketplaces.** It expects each plugin to be its
own directory sitting *flat* in its plugins folder — it won't follow a
`marketplace.json` or look inside a nested `plugins/` directory.

To use these plugins in Cowork, clone this repo into Cowork's plugins folder and
then **unpack** the marketplace so every plugin becomes a flat sibling:

```bash
# 1. Clone this repo INTO your Cowork plugins folder
cd <cowork-plugins-folder>
git clone git@github.com:Constantinople-AI/cxnpl-claude-plugin-marketplace.git

# 2. Unpack — copies every plugin out as a sibling of the repo
cd cxnpl-claude-plugin-marketplace
python3 unpack_marketplace.py
```

Result:

```
<cowork-plugins-folder>/
  cxnpl-claude-plugin-marketplace/   # the cloned repo (left in place)
  quality-review-plugin/             # ← unpacked, flat, visible to Cowork
  test-plugin-marketplace/
  test2-plugin2-marketplace1/
  test-plugin-root/
```

Cowork can now see each plugin directly.

### Updating

The unpack script is **idempotent** — every run replaces the flattened plugins
with the latest version. To update after the marketplace changes:

```bash
cd cxnpl-claude-plugin-marketplace
git pull
python3 unpack_marketplace.py
```

### Removing

To remove the flattened plugins from the parent folder (the cloned repo is left
untouched):

```bash
cd cxnpl-claude-plugin-marketplace
python3 unpack_remove.py
```

### Helper script options

Both scripts are cross-platform (standard-library Python only, no dependencies)
and support:

- `--dry-run` — show what would happen without changing anything
- `--dest DIR` — target a different directory instead of the repo's parent

`unpack_remove.py` only deletes a directory if it actually looks like a plugin
(contains `.claude-plugin/plugin.json`), so it won't touch unrelated folders.

---

## Adding a plugin to the marketplace

1. Create the plugin directory (typically under `plugins/`) with a
   `.claude-plugin/plugin.json`.
2. Add an entry for it to the `plugins` array in
   `.claude-plugin/marketplace.json`.

See <https://code.claude.com/docs/en/plugin-marketplaces> for the manifest
schema and plugin structure.

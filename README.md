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
marketplace-unpack/               # tooling to flatten plugins for Claude Cowork
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

The `marketplace-unpack/` directory contains tooling that flattens these plugins
into sibling directories Cowork can see, plus an optional scheduled sync to keep
them up to date.

👉 **See [`marketplace-unpack/README.md`](marketplace-unpack/README.md) for the
full Cowork setup.** In short:

```bash
# clone INTO your Cowork plugins folder, then unpack
cd <cowork-plugins-folder>
git clone git@github.com:Constantinople-AI/cxnpl-claude-plugin-marketplace.git
node cxnpl-claude-plugin-marketplace/marketplace-unpack/unpack_marketplace.js
```

---

## Adding a plugin to the marketplace

1. Create the plugin directory (typically under `plugins/`) with a
   `.claude-plugin/plugin.json`.
2. Add an entry for it to the `plugins` array in
   `.claude-plugin/marketplace.json`.

See <https://code.claude.com/docs/en/plugin-marketplaces> for the manifest
schema and plugin structure.

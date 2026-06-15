# marketplace-unpack

Tooling to use this Claude Code marketplace's plugins in **Claude Cowork**, which
does not support marketplaces and instead needs each plugin as its own flat
directory.

| File                    | Purpose                                                        |
| ----------------------- | ------------------------------------------------------------- |
| `unpack_marketplace.js` | Copy every plugin out as a flat sibling of the repo           |
| `unpack_remove.js`      | Remove the flattened plugins (inverse of unpack)              |
| `sync.js`               | `git pull` the repo, then unpack — for scheduled (cron) runs  |

All three are plain Node scripts (standard library only, no dependencies; require
Node 16.7+) and run on Windows, macOS, and Linux. Each figures out its own
location, so it doesn't matter what directory you run it from.

> Paths below assume you run from the **repo root**
> (`.../cxnpl-claude-plugin-marketplace/`), hence the `marketplace-unpack/`
> prefix on each command.

---

## Unpacking for Claude Cowork

Clone this repo into Cowork's plugins folder and unpack so every plugin becomes a
flat sibling of the repo:

```bash
# 1. Clone this repo INTO your Cowork plugins folder
cd <cowork-plugins-folder>
git clone git@github.com:Constantinople-AI/cxnpl-claude-plugin-marketplace.git

# 2. Unpack — copies every plugin out as a sibling of the repo
cd cxnpl-claude-plugin-marketplace
node marketplace-unpack/unpack_marketplace.js
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
node marketplace-unpack/unpack_marketplace.js
```

### Removing

To remove the flattened plugins from the parent folder (the cloned repo is left
untouched):

```bash
cd cxnpl-claude-plugin-marketplace
node marketplace-unpack/unpack_remove.js
```

### Options

Both `unpack_marketplace.js` and `unpack_remove.js` support:

- `--dry-run` — show what would happen without changing anything
- `--dest DIR` — target a different directory instead of the repo's parent

`unpack_remove.js` only deletes a directory if it actually looks like a plugin
(contains `.claude-plugin/plugin.json`), so it won't touch unrelated folders.

---

## Keeping plugins fresh automatically (scheduled sync)

On a server you usually want the flattened plugins to stay up to date with the
marketplace without anyone running commands by hand. `sync.js` does both steps in
one go:

1. `git pull` the repo from GitLab over HTTPS (authenticating with a GitLab
   project access token)
2. run `unpack_marketplace.js` to refresh the flat plugin directories

It's a Node script (no shell required), so the **same script runs on Windows,
macOS, and Linux** — scheduled by cron on macOS/Linux or Task Scheduler on
Windows. It runs the unpack step with the same `node` that's executing it, so
there's no `PATH`/`node`-location configuration to worry about.

### The access token

The token is returned by the `getGlpat()` function near the top of `sync.js`.
Right now it's a placeholder magic string — **edit that function and paste in a
real GitLab project access token** (scope: `read_repository`). All token
retrieval lives in that one function, so when the source changes later (env var,
AWS Secrets Manager, Vault, …) only `getGlpat()` needs to change.

The script pulls from whatever remote is already configured in `.git/config`; it
just attaches the token as a one-off HTTP Basic auth header
(`git -c http.extraHeader=...`). The token is never written to `.git/config` and
is scrubbed from anything written to the logs.

> `git pull` uses the current branch's configured upstream, so the clone's
> tracking remote must be the **HTTPS** GitLab URL — the auth header only applies
> to HTTPS (an SSH remote would ignore it and fall back to SSH keys).

### Where logs go

By default the script logs to:

```
<your-home>/.cxnpl-marketplace-sync/logs/sync.log
```

Every run appends a timestamped block. Override the location with the
`SYNC_LOG_DIR` environment variable. The file grows over time — on Linux a
logrotate rule (`/etc/logrotate.d/cxnpl-marketplace-sync`) keeps it bounded:

```
/home/ubuntu/.cxnpl-marketplace-sync/logs/sync.log {
    weekly
    rotate 4
    compress
    missingok
    notifempty
}
```

### Test it first

Run it on demand. To exercise the unpack without pulling (e.g. before the token
is set), skip the pull:

```bash
MARKETPLACE_SYNC_SKIP_PULL=1 node marketplace-unpack/sync.js
```

Environment variables `sync.js` understands: `SYNC_LOG_DIR`,
`MARKETPLACE_SYNC_SKIP_PULL`.

### Schedule it every hour — macOS / Linux (cron)

Open the current user's crontab:

```bash
crontab -e
```

Add this (adjust both paths — to `node` and to where you cloned the repo):

```cron
# Refresh Claude Cowork plugins from the marketplace, hourly at minute 0
0 * * * * /usr/local/bin/node /home/ubuntu/cowork-plugins/cxnpl-claude-plugin-marketplace/marketplace-unpack/sync.js >> /home/ubuntu/.cxnpl-marketplace-sync/logs/cron.log 2>&1
```

- Use an **absolute path to `node`** — cron has a minimal `PATH` and won't find a
  node installed via nvm. Find yours with `command -v node`.
- The script already logs to `sync.log`; the extra `>> cron.log 2>&1` only
  captures catastrophic failures (e.g. node can't start at all).

Verify and watch:

```bash
crontab -l                                   # confirm the entry
tail -f ~/.cxnpl-marketplace-sync/logs/sync.log
```

### Schedule it every hour — Windows (Task Scheduler)

Create an hourly task that runs `node sync.js`. From an Administrator PowerShell
(adjust the two paths):

```powershell
$node = "C:\Program Files\nodejs\node.exe"
$script = "C:\cowork-plugins\cxnpl-claude-plugin-marketplace\marketplace-unpack\sync.js"

$action  = New-ScheduledTaskAction -Execute $node -Argument "`"$script`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
             -RepetitionInterval (New-TimeSpan -Hours 1)

Register-ScheduledTask -TaskName "CxnplMarketplaceSync" `
  -Action $action -Trigger $trigger -Description "Hourly Claude Cowork plugin sync"
```

Logs still go to `%USERPROFILE%\.cxnpl-marketplace-sync\logs\sync.log`. Check the
task with `Get-ScheduledTask -TaskName CxnplMarketplaceSync`, or run it now with
`Start-ScheduledTask -TaskName CxnplMarketplaceSync`.

#!/usr/bin/env node
/**
 * sync.js — pull the marketplace repo and re-unpack the plugins.
 *
 * Cross-platform (Windows / macOS / Linux): runs anywhere Node + git are
 * installed. Intended to be scheduled (hourly) via cron on macOS/Linux or Task
 * Scheduler on Windows.
 *
 * It:
 *   1. pulls the latest commit of THIS repo from GitLab over HTTPS, authenticating
 *      with a GitLab project access token returned by getGlpat()
 *   2. runs unpack_marketplace.js to refresh the flat plugin directories in the
 *      parent folder (idempotent — always ends up with the latest plugins)
 *
 * All output is timestamped and written both to the console and to a log file
 * (see logDir below).
 *
 * Relies only on the Node.js standard library; requires Node 16.7+.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

// ---------------------------------------------------------------------------
// Configuration (override via environment variables)
// ---------------------------------------------------------------------------

// Where logs go. Defaults to a dir under the user's home so it works without
// elevated privileges. Override with SYNC_LOG_DIR.
const LOG_DIR =
  process.env.SYNC_LOG_DIR ||
  path.join(os.homedir(), ".cxnpl-marketplace-sync", "logs");

// Set MARKETPLACE_SYNC_SKIP_PULL=1 to skip the git pull and only re-unpack
// (useful for testing, or if you sync the repo some other way e.g. SSH/deploy key).
const SKIP_PULL = process.env.MARKETPLACE_SYNC_SKIP_PULL === "1";

// ---------------------------------------------------------------------------
// getGlpat — return the GitLab project access token.
//
// NOTE: for now this is a hardcoded placeholder. The way the token is retrieved
// is expected to change (env var, AWS Secrets Manager, Vault, ...). Keep ALL
// retrieval logic inside this function so callers never change.
//
// Future example (env var):
//   return process.env.MARKETPLACE_GLPAT;
// ---------------------------------------------------------------------------
function getGlpat() {
  return "glpat-REPLACE_ME";
}

// This script lives in <marketplace-repo>/marketplace-unpack.
const SCRIPT_DIR = __dirname;
// The git repo to pull is one level up.
const REPO_DIR = path.dirname(SCRIPT_DIR);

let logStream = null;

function log(msg) {
  const stamp = new Date().toISOString();
  const line = `[${stamp}] ${msg}`;
  console.log(line);
  if (logStream) logStream.write(line + "\n");
}

function pull() {
  const token = getGlpat();
  // Authenticate by injecting an HTTP Basic auth header for this one command
  // ("oauth2:<token>" base64-encoded). The remote URL stays whatever is already
  // configured in .git/config — git pull uses it as normal.
  const auth = Buffer.from(`oauth2:${token}`).toString("base64");
  const scrub = (s) =>
    String(s).split(token).join("<redacted>").split(auth).join("<redacted>");

  log("pulling latest from the configured remote ...");
  try {
    const out = execFileSync(
      "git",
      ["-C", REPO_DIR, "-c", `http.extraHeader=Authorization: Basic ${auth}`, "pull"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    log(`git: ${scrub(out).trim()}`);
  } catch (err) {
    // Scrub the token/auth from anything git printed before re-raising.
    const detail = scrub(
      [err.stdout, err.stderr].filter(Boolean).join("\n").trim() || err.message
    );
    log(`git: ${detail}`);
    throw new Error(`git pull failed (exit ${err.status ?? "?"})`);
  }
}

function unpack() {
  log("unpacking plugins ...");
  // Use the same node binary that's running this script — no PATH lookup needed,
  // so it works under cron / Task Scheduler without extra configuration.
  const out = execFileSync(
    process.execPath,
    [path.join(SCRIPT_DIR, "unpack_marketplace.js")],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  out.split(/\r?\n/).forEach((l) => {
    if (l.length) log(`unpack: ${l}`);
  });
}

function main() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  logStream = fs.createWriteStream(path.join(LOG_DIR, "sync.log"), {
    flags: "a",
  });

  log(`=== marketplace sync started (repo: ${REPO_DIR}) ===`);
  try {
    if (SKIP_PULL) {
      log("skipping git pull (MARKETPLACE_SYNC_SKIP_PULL=1)");
    } else {
      pull();
    }
    unpack();
    log("=== marketplace sync finished OK ===");
  } catch (err) {
    log(`ERROR: ${err.message}`);
    process.exitCode = 1;
  } finally {
    if (logStream) logStream.end();
  }
}

main();

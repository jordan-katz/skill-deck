// Pulls live inventory out of the config repos into data/*.json.
// Run this when a config changes. build.mjs never reads outside this repo.
//
// Each entry in data/sources.json names an adapter in scripts/adapters/.
// Adding an agent means adding an entry, not editing this file. Entries with
// borrowFrom are built after the id they borrow from.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { exists } from "./adapters/_shared.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Same override as build.mjs: deck.local.json or SKILL_DECK_DATA_DIR points at
// inventory outside this checkout, so sync writes where the deck reads.
const local = await readFile(resolve(root, "deck.local.json"), "utf8").then(JSON.parse).catch(() => ({}));
const dataDir = resolve(root, process.env.SKILL_DECK_DATA_DIR || local.dataDir || "data");
const sources = JSON.parse(await readFile(resolve(dataDir, "sources.json"), "utf8"));
const today = new Date().toISOString().slice(0, 10);
if (dataDir !== resolve(root, "data")) console.log(`data: ${dataDir}`);

// A path may be relative to this repo, absolute, or start with ~ for the home
// directory, which is how most people will name a config they point at.
// SKILL_DECK_SOURCE_ROOT relocates the relative ones so the sync can run from a
// checkout that is not sitting next to them; it keeps the last path segment as
// the folder name and leaves absolute and ~ paths alone.
const sourceRoot = process.env.SKILL_DECK_SOURCE_ROOT;
function sourcePath(entry) {
  const raw = String(entry.path || "");
  if (raw.startsWith("~/") || raw === "~") return resolve(homedir(), raw.slice(2));
  if (isAbsolute(raw)) return resolve(raw);
  if (!sourceRoot) return resolve(root, raw);
  return resolve(sourceRoot, raw.split("/").filter(Boolean).pop());
}

// Identity is a fact about the user's setup, not about the repo layout, so it
// lives in sources.json and an adapter never has to know it.
const IDENTITY = ["name", "binary", "subtitle", "configPath", "version", "repo", "commandPrefix", "mcpCheck", "note"];
function identity(id, entry) {
  const out = { id };
  for (const k of IDENTITY) {
    if (k === "repo" || k === "commandPrefix" || k === "mcpCheck") continue;
    if (entry[k] !== undefined) out[k] = entry[k];
  }
  if (entry.repo !== undefined) out.repo = entry.repo;
  out.syncedAt = today;
  for (const k of ["commandPrefix", "mcpCheck"]) if (entry[k] !== undefined) out[k] = entry[k];
  return out;
}

const entries = Object.entries(sources).filter(([id]) => !id.startsWith("_"));

// borrowFrom is a build-order dependency, so sort the borrowers last.
const ordered = entries.filter(([, e]) => !e.borrowFrom).concat(entries.filter(([, e]) => e.borrowFrom));

// A fresh clone has no entries on purpose. Shipping a live one pointed at
// ~/.claude meant that running sync before editing this file overwrote the
// starter tab with whatever happened to be there.
if (!ordered.length) {
  console.error("No agents configured yet.");
  console.error("Open data/sources.json, copy the _example block to a real key such as \"my-claude\",");
  console.error("point its path at your config, then run this again.");
  process.exit(1);
}

const built = new Map();
let wrote = 0;
let skipped = 0;

for (const [id, entry] of ordered) {
  const repoRoot = sourcePath(entry);
  if (!(await exists(repoRoot))) {
    console.warn(`! skipped ${id}: no config at ${repoRoot}`);
    skipped++;
    continue;
  }
  if (!entry.adapter) {
    console.warn(`! skipped ${id}: no adapter named in sources.json`);
    skipped++;
    continue;
  }
  let mod;
  try {
    mod = await import(`./adapters/${entry.adapter}.mjs`);
  } catch (e) {
    console.warn(`! skipped ${id}: adapter "${entry.adapter}" did not load (${e.message})`);
    skipped++;
    continue;
  }

  if (entry.borrowFrom && !built.has(entry.borrowFrom)) {
    console.warn(`! ${id}: borrowFrom "${entry.borrowFrom}" was not built, continuing without it`);
  }

  let inventory;
  try {
    inventory = await mod.build({ id, repoRoot, entry, borrowed: built.get(entry.borrowFrom), today });
  } catch (e) {
    console.error(`! failed ${id}: ${e.message}`);
    skipped++;
    continue;
  }

  const payload = { ...identity(id, entry), ...inventory };
  built.set(id, payload);
  await writeFile(resolve(dataDir, `${id}.json`), JSON.stringify(payload, null, 2) + "\n", "utf8");
  wrote++;
  const n = (payload.groups || []).reduce((a, g) => a + g.skills.length, 0);
  console.log(`wrote data/${id}.json  ${n} skills, ${(payload.agents || []).length} agents, ${(payload.mcps || []).length} mcps`);
}

// Exiting 0 after writing nothing is how a stale sources.json hides for weeks.
if (wrote === 0) {
  console.error(`Nothing synced. ${skipped} of ${ordered.length} entries were skipped; check the paths in data/sources.json.`);
  process.exit(1);
}
if (skipped) console.warn(`${skipped} of ${ordered.length} entries skipped.`);

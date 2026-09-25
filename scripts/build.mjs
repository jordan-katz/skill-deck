// Renders index.html from data/. Reads nothing outside this repo, so it runs
// anywhere the repo is checked out. Run sync.mjs first to refresh data/.
import { readFile, writeFile, readdir } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFile(p, "utf8");
const readJson = async (p) => JSON.parse(await read(p));

// deck.local.json is gitignored and points this checkout at inventory that
// lives somewhere else, so a public repo can ship a starter deck in data/
// while your own deck builds from your own files and writes beside them.
// Env vars win over the file. Both paths resolve against the repo root.
const local = await readJson(join(root, "deck.local.json")).catch(() => ({}));
const dataDir = resolve(root, process.env.SKILL_DECK_DATA_DIR || local.dataDir || "data");
const outPath = resolve(root, process.env.SKILL_DECK_OUT || local.out || "index.html");
if (dataDir !== resolve(root, "data")) console.log(`data: ${dataDir}`);

// deck.json carries everything that is not inventory: brand, tab order and the
// effect taxonomy. Missing or partial is fine, the defaults below fill in.
const DEFAULTS = {
  brand: { name: "skill", suffix: "deck", docTitle: "Skill Deck", description: "Commands, skills, agents and MCP servers.", repo: "" },
  order: [],
  effects: {
    inspect: "Reads and reports. Nothing changes.",
    draft: "Produces text, a plan, or a doc. No code changes.",
    build: "Edits code and files in the repo.",
    external: "Changes something outside the repo."
  },
  defaultMcpCheck: "check your agent's MCP list command"
};
const deckCfg = await readJson(join(dataDir, "deck.json")).catch(() => ({}));
const BRAND = { ...DEFAULTS.brand, ...(deckCfg.brand || {}) };
const EFFECTS = deckCfg.effects || DEFAULTS.effects;
const DEFAULT_MCP_CHECK = deckCfg.defaultMcpCheck || DEFAULTS.defaultMcpCheck;

// A tab is any data/*.json that is not one of these. Adding an agent means
// dropping a file in data/, not editing this script. deck.json's order lists
// the ones you care about; anything else lands after them, alphabetically.
const RESERVED = new Set(["deck.json", "sources.json", "commands.json"]);
const tabFiles = (await readdir(dataDir))
  .filter((f) => f.endsWith(".json") && !RESERVED.has(f))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();
const wanted = (deckCfg.order || DEFAULTS.order).filter((id) => tabFiles.includes(id));
const AGENT_ORDER = wanted.concat(tabFiles.filter((id) => !wanted.includes(id)));
for (const id of (deckCfg.order || []).filter((id) => !tabFiles.includes(id))) {
  console.warn(`! deck.json lists "${id}" but data/${id}.json is missing, skipping that tab`);
}

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const search = (...parts) => esc(parts.filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, " "));

// Stable per-row ids. deck.js uses them to remember which uses trees are open
// and to scroll to a row from a deep link, so they have to survive a rebuild.
// Slugging can collide (a:b and a-b both slug to a-b), so keep a registry.
const takenIds = new Set();
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
function rowId(...parts) {
  const base = "row-" + slug(parts.join("-"));
  let id = base;
  for (let n = 2; takenIds.has(id); n++) id = `${base}-${n}`;
  takenIds.add(id);
  return id;
}

const agents = {};
for (const id of AGENT_ORDER) {
  try { agents[id] = await readJson(join(dataDir, `${id}.json`)); }
  catch { console.warn(`! data/${id}.json missing, skipping that tab`); }
}
const commands = await readJson(join(dataDir, "commands.json"));

// ---- validation ---------------------------------------------------------
const problems = [];
const secretPatterns = [
  /github_pat_[A-Za-z0-9_]{20,}/, /gh[pousr]_[A-Za-z0-9]{20,}/,
  /sk-[A-Za-z0-9_-]{20,}/, /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/
];
for (const [id, payload] of Object.entries(agents)) {
  const raw = JSON.stringify(payload);
  for (const p of secretPatterns) if (p.test(raw)) problems.push(`${id}.json contains secret-like material matching ${p}`);
  const seen = new Set();
  for (const g of payload.groups || []) {
    if (!g.title) problems.push(`${id}: a group has no title`);
    for (const s of g.skills || []) {
      if (!s.name) problems.push(`${id}: a skill in ${g.title} has no name`);
      const key = `${g.id}/${s.name}`;
      if (seen.has(key)) problems.push(`${id}: duplicate skill ${key}`);
      seen.add(key);
      if (s.effect && !EFFECTS[s.effect]) problems.push(`${id}/${s.name}: unknown effect "${s.effect}"`);
    }
  }
  for (const c of payload.cards || []) {
    if (!c.id) problems.push(`${id}: a card has no id`);
    for (const b of c.body || []) {
      if (!["p", "code", "table", "keys", "note", "links"].includes(b.type)) {
        problems.push(`${id}/${c.id}: unknown block type "${b.type}"`);
      }
    }
  }
}
const cmdRaw = JSON.stringify(commands);
for (const p of secretPatterns) if (p.test(cmdRaw)) problems.push(`commands.json contains secret-like material matching ${p}`);
if (problems.length) {
  console.error("Build refused:\n  " + problems.join("\n  "));
  process.exit(1);
}

// ---- renderers ----------------------------------------------------------
// The toggle sits in the uses cell; the tree is a sibling of the cells so that
// its `grid-column: 1 / -1` resolves against the row. Nested inside the cell it
// would lay out in the 52px last track and wrap to a sliver.
function renderUsesToggle(skill) {
  const uses = skill.uses || [];
  if (!uses.length) return `<span class="uses-none" title="Delegates to nothing">0</span>`;
  return `<button class="uses-toggle" type="button" aria-expanded="false">${uses.length}</button>`;
}

function renderUsesTree(skill) {
  const uses = skill.uses || [];
  if (!uses.length) return "";
  const leaves = uses.map((u) => `<li class="leaf"><span class="leaf-kind leaf-${esc(u.kind)}">${esc(u.kind)}</span>` +
    `<code class="chip chip-static">${esc(u.name)}</code>` +
    `<span class="leaf-blurb">${esc(u.blurb)}</span></li>`).join("");
  return `<div class="tree">${skill.usesNote ? `<p class="tree-note">${esc(skill.usesNote)}</p>` : ""}<ul class="leaves">${leaves}</ul></div>`;
}

function renderSkillRow(skill, prefix, groupTitle, agentId, groupId) {
  const cmd = prefix + skill.name;
  const id = rowId(agentId, groupId, skill.name);
  const eff = skill.effect || "build";
  const mode = skill.mode === "invoke"
    ? { kind: "invoke", text: "slash only" }
    : { kind: "auto", text: "auto" };
  const kidText = (skill.uses || []).map((u) => u.name + " " + u.blurb).join(" ");
  return `<li class="row skill-row eff-${esc(eff)}" id="${id}" data-effect="${esc(eff)}" data-search="${search(cmd, skill.blurb, skill.arg, mode.text, eff, skill.effectNote, kidText, groupTitle, skill.useWhen, skill.avoidWhen)}">
  <div class="cell cell-cmd"><code class="chip chip-copy" role="button" tabindex="0" data-copy="${esc(cmd)}" title="Copy ${esc(cmd)}">${esc(cmd)}<span class="copy-hint" aria-hidden="true"></span></code></div>
  <div class="cell cell-blurb">${esc(skill.blurb)}${skill.effectNote ? `<span class="eff-note">${esc(skill.effectNote)}</span>` : ""}</div>
  <div class="cell cell-effect"><span class="eff eff-${esc(eff)}">${esc(eff)}</span></div>
  <div class="cell cell-mode"><span class="badge badge-${mode.kind}">${esc(mode.text)}</span></div>
  <div class="cell cell-arg">${skill.arg ? `<code class="arg">${esc(skill.arg)}</code>` : '<span class="dash">none</span>'}</div>
  <div class="cell cell-uses">${renderUsesToggle(skill)}</div>
  ${renderUsesTree(skill)}
</li>`;
}

function renderSkillsPanel(payload) {
  const prefix = payload.commandPrefix || "/";
  const dirs = payload.groups.map((g) => {
    const rows = g.skills.map((s) => renderSkillRow(s, prefix, g.title, payload.id, g.id)).join("\n");
    return `<details class="dir" id="dir-${esc(payload.id)}-${esc(g.id)}" data-dir="${esc(payload.id)}-${esc(g.id)}">
  <summary class="dir-head">
    <span class="caret" aria-hidden="true"></span>
    <span class="dir-title">${esc(g.title)}</span>
    <span class="dir-lead">${esc(g.lead)}</span>
    <span class="count" data-count data-total="${g.skills.length}">${g.skills.length}</span>
  </summary>
  <ul class="rows">
<li class="row row-head" aria-hidden="true"><div class="cell cell-cmd">command</div><div class="cell cell-blurb">what it does</div><div class="cell cell-effect">effect</div><div class="cell cell-mode">runs</div><div class="cell cell-arg">argument</div><div class="cell cell-uses">uses</div></li>
${rows}
  </ul>
</details>`;
  }).join("\n");

  return dirs;
}

function renderCommandsPanel(spec, agentId) {
  const dirs = spec.groups.map((g) => {
    const rows = g.commands.map((c) => `<li class="row cmd-row" data-search="${search(c.name, c.blurb, c.arg, g.title)}">
  <div class="cell cell-cmd"><code class="chip chip-copy" role="button" tabindex="0" data-copy="${esc(c.name)}" title="Copy ${esc(c.name)}">${esc(c.name)}<span class="copy-hint" aria-hidden="true"></span></code></div>
  <div class="cell cell-blurb">${esc(c.blurb)}</div>
  <div class="cell cell-arg">${c.arg ? `<code class="arg">${esc(c.arg)}</code>` : '<span class="dash">none</span>'}</div>
</li>`).join("\n");
    return `<details class="dir" id="dir-${esc(agentId)}-cmd-${esc(g.title.toLowerCase().replace(/\W+/g, "-"))}" data-dir="${esc(agentId)}-cmd-${esc(g.title.toLowerCase().replace(/\W+/g, "-"))}" open>
  <summary class="dir-head">
    <span class="caret" aria-hidden="true"></span>
    <span class="dir-title">${esc(g.title)}</span>
    <span class="dir-lead">${esc(g.lead)}</span>
    <span class="count" data-count data-total="${g.commands.length}">${g.commands.length}</span>
  </summary>
  <ul class="rows">
<li class="row cmd-head" aria-hidden="true"><div class="cell cell-cmd">command</div><div class="cell cell-blurb">what it does</div><div class="cell cell-arg">argument</div></li>
${rows}
  </ul>
</details>`;
  }).join("\n");

  const flags = (spec.flags || []).length ? `<details class="dir" id="dir-${esc(agentId)}-flags" data-dir="${esc(agentId)}-flags">
  <summary class="dir-head">
    <span class="caret" aria-hidden="true"></span>
    <span class="dir-title">Flags</span>
    <span class="dir-lead">Command-line, not in-session.</span>
    <span class="count" data-count data-total="${spec.flags.length}">${spec.flags.length}</span>
  </summary>
  <ul class="rows">
${spec.flags.map((f) => `<li class="row cmd-row" data-search="${search(f.name, f.blurb, "flag")}">
  <div class="cell cell-cmd"><code class="chip chip-copy" role="button" tabindex="0" data-copy="${esc(f.name)}" title="Copy ${esc(f.name)}">${esc(f.name)}<span class="copy-hint" aria-hidden="true"></span></code></div>
  <div class="cell cell-blurb">${esc(f.blurb)}</div>
  <div class="cell cell-arg"><span class="dash">flag</span></div>
</li>`).join("\n")}
  </ul>
</details>` : "";

  return `<p class="panel-lead">Built into the CLI, not from your config. ${spec.note ? esc(spec.note) + " " : ""}Verified against <a href="${esc(spec.docs)}">the vendor docs</a> on ${esc(commands._verified)}. Curated, not exhaustive.</p>
${dirs}
${flags}`;
}

function renderAgentsPanel(list) {
  if (!list.length) return `<p class="panel-lead">No subagents defined in this config.</p>`;
  const rows = list.map((a) => {
    const tags = [];
    if (a.spawnedBy) tags.push(`<span class="badge badge-spawn">spawned by ${esc(a.spawnedBy.replace(/^\/?/, "/"))}</span>`);
    if (a.model) tags.push(`<span class="badge badge-model">${esc(a.model)}</span>`);
    if (a.readOnly) tags.push(`<span class="badge badge-ro">read-only</span>`);
    return `<li class="row flat-row" data-search="${search(a.name, a.blurb, a.whenToUse, a.spawnedBy, a.model, a.readOnly ? "read-only" : "")}">
  <div class="cell cell-cmd"><code class="chip chip-static">${esc(a.name)}</code></div>
  <div class="cell cell-blurb">${esc(a.blurb)}</div>
  <div class="cell cell-tags">${tags.join("")}</div>
</li>`;
  }).join("\n");
  return `<p class="panel-lead">Subagents a skill spawns for you. They are not commands, so there is nothing to copy.</p>
<ul class="rows">
${rows}
</ul>`;
}

function renderMcpsPanel(list, payload) {
  if (!list.length) return `<p class="panel-lead">No MCP servers registered in this config.</p>`;
  const rows = list.map((m) => `<li class="row flat-row" data-search="${search(m.name, m.blurb, m.scope, m.auth, m.verifiedAt)}">
  <div class="cell cell-cmd"><code class="chip chip-static">${esc(m.name)}</code></div>
  <div class="cell cell-blurb">${esc(m.blurb)}</div>
  <div class="cell cell-tags">${m.scope ? `<span class="badge badge-scope">${esc(m.scope)}</span>` : ""}${m.auth ? `<span class="badge badge-auth">${esc(m.auth)}</span>` : ""}${m.verifiedAt ? `<span class="badge badge-model">seen ${esc(m.verifiedAt)}</span>` : ""}</div>
</li>`).join("\n");
  const check = payload.mcpCheck || DEFAULT_MCP_CHECK;
  return `<p class="panel-lead">Registered in this config. This is an inventory, not a live health check. Confirm with <code class="arg">${esc(check)}</code>.</p>
<ul class="rows">
${rows}
</ul>`;
}

function renderPluginsPanel(list) {
  const rows = list.map((p) => `<li class="row flat-row" data-search="${search(p.prefix || p.name, p.blurb, "plugin")}">
  <div class="cell cell-cmd"><code class="chip chip-copy" role="button" tabindex="0" data-copy="${esc(p.prefix || p.name)}" title="Copy ${esc(p.prefix || p.name)}">${esc(p.prefix || p.name)}<span class="copy-hint" aria-hidden="true"></span></code></div>
  <div class="cell cell-blurb">${esc(p.blurb)}</div>
  <div class="cell cell-tags"><span class="badge badge-plugin">plugin</span></div>
</li>`).join("\n");
  return `<p class="panel-lead">Type the prefix in a session to see the commands a plugin adds.</p>
<ul class="rows">
${rows}
</ul>`;
}

function renderBlock(b) {
  if (b.type === "p") return `<p>${esc(b.text)}</p>`;
  if (b.type === "note") return `<div class="note"><b>correction</b>${esc(b.text)}</div>`;
  if (b.type === "code") return `<div class="pre-wrap"><button class="pre-copy" type="button">copy</button><pre><code>${esc(b.text)}</code></pre></div>`;
  if (b.type === "keys" || b.type === "table") {
    const cls = b.type === "keys" ? " class=\"keys\"" : "";
    const head = b.head ? `<thead><tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>` : "";
    const rows = (b.rows || []).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("");
    return `<table${cls}>${head}<tbody>${rows}</tbody></table>`;
  }
  if (b.type === "links") {
    return `<table class="links"><tbody>${(b.rows || []).map(([label, href]) =>
      `<tr><td><a href="${esc(href)}" rel="noreferrer">${esc(label)}</a></td><td>${esc(href)}</td></tr>`).join("")}</tbody></table>`;
  }
  return "";
}

function blockText(b) {
  if (b.type === "p" || b.type === "note") return b.text;
  if (b.type === "code") return b.text;
  return [(b.head || []).join(" "), (b.rows || []).map((r) => r.join(" ")).join(" ")].join(" ");
}

function renderCardsPanel(cards, lead) {
  return (lead ? `<p class="panel-lead">${esc(lead)}</p>` : "") + cards.map((c) =>
    `<section class="card" id="card-${esc(c.id)}" data-search="${search(c.title, c.lead, ...(c.body || []).map(blockText))}">
  <h3>${esc(c.title)}</h3>
  ${c.lead ? `<p class="card-lead">${esc(c.lead)}</p>` : ""}
  ${(c.body || []).map(renderBlock).join("\n  ")}
</section>`).join("\n");
}

// ---- assemble -----------------------------------------------------------
const tabHtml = [];
const bodyHtml = [];

for (const id of AGENT_ORDER) {
  const payload = agents[id];
  if (!payload) continue;
  const cmdSpec = commands[id];
  const subs = [];

  if (cmdSpec) {
    const n = cmdSpec.groups.reduce((a, g) => a + g.commands.length, 0) + (cmdSpec.flags || []).length;
    subs.push({ id: "commands", label: "commands", n, html: renderCommandsPanel(cmdSpec, id) });
  }
  const skillCount = (payload.groups || []).reduce((a, g) => a + g.skills.length, 0);
  if (skillCount) subs.push({ id: "skills", label: "skills", n: skillCount, html: renderSkillsPanel(payload) });
  if ((payload.agents || []).length) subs.push({ id: "agents", label: "agents", n: payload.agents.length, html: renderAgentsPanel(payload.agents) });
  if ((payload.mcps || []).length) subs.push({ id: "mcps", label: "mcps", n: payload.mcps.length, html: renderMcpsPanel(payload.mcps, payload) });
  if ((payload.plugins || []).length) subs.push({ id: "plugins", label: "plugins", n: payload.plugins.length, html: renderPluginsPanel(payload.plugins) });
  if ((payload.cards || []).length) subs.push({ id: "reference", label: "reference", n: payload.cards.length, html: renderCardsPanel(payload.cards, payload.note) });

  if (!subs.length) continue;

  const headline = (payload.groups || []).length ? skillCount : (payload.cards || []).length;
  tabHtml.push(`<button class="tab" role="tab" id="tab-${esc(id)}" data-agent="${esc(id)}" aria-selected="false" aria-controls="agent-${esc(id)}">${esc(payload.name)}<span class="n">${headline}</span></button>`);

  const meta = [];
  if (payload.binary) meta.push(`<span><b>${esc(payload.binary)}</b></span>`);
  if (payload.subtitle) meta.push(`<span>${esc(payload.subtitle)}</span>`);
  if (payload.configPath) meta.push(`<span>${esc(payload.configPath)}</span>`);
  if (payload.version) meta.push(`<span>${esc(payload.version)}</span>`);
  if (payload.repo) meta.push(`<span>${esc(payload.repo)}</span>`);
  if (payload.syncedAt) meta.push(`<span>synced ${esc(payload.syncedAt)}</span>`);

  bodyHtml.push(`<section class="agent-panel" id="agent-${esc(id)}" data-agent="${esc(id)}" role="tabpanel" aria-labelledby="tab-${esc(id)}" hidden>
  <div class="agent-meta swipe">${meta.join("")}</div>
  <div class="subtabs swipe" role="tablist" aria-label="${esc(payload.name)} sections">${subs.map((s) =>
    `<button class="subtab" role="tab" data-sub="${esc(s.id)}" aria-selected="false" aria-controls="panel-${esc(id)}-${esc(s.id)}">${esc(s.label)}<span class="n">${s.n}</span></button>`).join("")}</div>
${subs.map((s) => `  <div class="panel sub-panel" id="panel-${esc(id)}-${esc(s.id)}" data-sub="${esc(s.id)}" role="tabpanel" hidden>
${s.html}
  </div>`).join("\n")}
</section>`);
}

const built = new Date().toISOString().slice(0, 10);
const totals = AGENT_ORDER.filter((id) => agents[id]).map((id) => {
  const p = agents[id];
  const n = (p.groups || []).reduce((a, g) => a + g.skills.length, 0) || (p.cards || []).length;
  return `${id} ${n}`;
}).join(" · ");
const foot = `Built ${built} from data/${BRAND.repo ? ` in ${esc(BRAND.repo)}` : ""}. ${esc(totals)}. Refresh from the config repos with ` +
  `<code class="chip chip-copy" role="button" tabindex="0" data-copy="node scripts/sync.mjs &amp;&amp; node scripts/build.mjs" title="Copy the rebuild command">node scripts/sync.mjs &amp;&amp; node scripts/build.mjs<span class="copy-hint" aria-hidden="true"></span></code>`;

const template = (await read(join(root, "template.html"))).replaceAll("\r\n", "\n");
const script = (await read(join(root, "scripts", "deck.js"))).replaceAll("\r\n", "\n");

// The chips filter; the sentences that used to live inside them are the
// legend's job. One global control row rather than one per skills panel.
const effectChips = Object.entries(EFFECTS).map(([lvl, desc]) =>
  `<button class="effect-chip eff-${esc(lvl)}" type="button" data-level="${esc(lvl)}" aria-pressed="false" title="${esc(desc)}"><span class="eff eff-${esc(lvl)}">${esc(lvl)}</span><span class="n"></span></button>`).join("");
const effectLegend = Object.entries(EFFECTS).map(([lvl, desc]) =>
  `\n    <span><span class="eff eff-${esc(lvl)}">${esc(lvl)}</span> ${esc(desc)}</span>`).join("");

const fills = {
  __DECK_EFFECTS__: effectChips,
  __DECK_LEGEND__: effectLegend,
  __DECK_TITLE__: esc(BRAND.docTitle),
  __DECK_DESCRIPTION__: esc(BRAND.description),
  __DECK_NAME__: esc(BRAND.name),
  __DECK_SUFFIX__: esc(BRAND.suffix),
  __DECK_TABS__: tabHtml.join(""),
  __DECK_BODY__: bodyHtml.join("\n"),
  __DECK_BUILT__: built,
  __DECK_FOOT__: foot,
  __DECK_SCRIPT__: script
};
// A function replacement, because string replacement treats $& and $` in the
// value as substitution patterns. deck.js has no $ today; the first template
// literal anyone adds would otherwise corrupt the output silently.
let html = template;
for (const [ph, value] of Object.entries(fills)) html = html.replace(ph, () => value);

for (const ph of Object.keys(fills)) {
  if (html.includes(ph)) { console.error(`Template placeholder ${ph} was not replaced`); process.exit(1); }
}

const out = outPath;
if (process.argv.includes("--check")) {
  const existing = await read(out).catch(() => "");
  if (existing.replaceAll("\r\n", "\n") !== html) {
    console.error("index.html is stale. Run node scripts/build.mjs");
    process.exit(1);
  }
  console.log(`index.html is current (${totals})`);
} else {
  await writeFile(out, html, "utf8");
  console.log(`Built index.html  ${totals}`);
}

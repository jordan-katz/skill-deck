// Helpers every adapter needs.
//
// An adapter is a module exporting build(ctx) -> { groups, agents, mcps,
// plugins, ...extras }. It describes inventory only. sync.mjs supplies the
// identity fields (name, binary, configPath, commandPrefix, mcpCheck) from
// sources.json, so adding an agent never means editing adapter code.
//
// ctx is { id, repoRoot, entry, borrowed, today }.
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export const exists = (p) => stat(p).then(() => true, () => false);
export const readJson = (p) => readFile(p, "utf8").then(JSON.parse);
export const unquote = (s) => String(s || "").replace(/^["']|["']$/g, "");
export const slugId = (s) => String(s).toLowerCase().replace(/\W+/g, "-");

export function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return {};
  const fm = {};
  let key = null;
  for (const raw of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(raw);
    if (kv) { key = kv[1]; fm[key] = kv[2].trim(); continue; }
    const item = /^\s*-\s+(.*)$/.exec(raw);
    if (item && key) { if (!Array.isArray(fm[key])) fm[key] = []; fm[key].push(item[1].trim()); }
  }
  return fm;
}

export async function dirsIn(p) {
  if (!(await exists(p))) return [];
  const out = [];
  for (const e of await readdir(p, { withFileTypes: true })) if (e.isDirectory()) out.push(e.name);
  return out.sort();
}

export async function filesIn(p, ext) {
  if (!(await exists(p))) return [];
  return (await readdir(p)).filter((f) => f.endsWith(ext)).sort();
}

// Reads SKILL.md frontmatter for every skill dir under <repoRoot>/skills.
export async function readSkills(repoRoot) {
  const out = new Map();
  for (const name of await dirsIn(join(repoRoot, "skills"))) {
    const file = join(repoRoot, "skills", name, "SKILL.md");
    if (!(await exists(file))) continue;
    const fm = frontmatter(await readFile(file, "utf8"));
    out.set(name, {
      name,
      arg: unquote(fm["argument-hint"]),
      mode: fm["disable-model-invocation"] === "true" ? "invoke" : "auto",
      description: unquote(fm.description),
      path: `skills/${name}/SKILL.md`
    });
  }
  return out;
}

export async function readAgents(repoRoot, spawnMap = {}) {
  const out = [];
  for (const f of await filesIn(join(repoRoot, "agents"), ".md")) {
    const fm = frontmatter(await readFile(join(repoRoot, "agents", f), "utf8"));
    const name = fm.name || f.replace(/\.md$/, "");
    const tools = Array.isArray(fm.tools) ? fm.tools : [];
    out.push({
      name,
      blurb: unquote(fm.description),
      whenToUse: unquote(fm.whenToUse),
      spawnedBy: spawnMap[name] || "",
      model: unquote(fm.model),
      readOnly: tools.length > 0 && !tools.some((t) => /Write|Edit|Bash|NotebookEdit/i.test(t))
    });
  }
  return out;
}

// The mcp.json shape Claude Code and its relatives use.
export async function readMcpJson(repoRoot) {
  const file = join(repoRoot, "mcp.json");
  if (!(await exists(file))) return [];
  const m = await readJson(file);
  return Object.entries(m.mcpServers || {}).map(([name, v]) => ({
    name, blurb: v.description || "", scope: "user",
    auth: v.env && Object.keys(v.env).length ? "env" : "none"
  }));
}

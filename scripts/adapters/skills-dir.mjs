// The zero-config adapter. Any config shaped like Claude Code's works here:
// skills/<name>/SKILL.md for the inventory, agents/*.md for subagents,
// mcp.json for servers. Nothing else is required, so most people can point
// sources.json at their config directory and get a deck without writing code.
//
// SKILL.md descriptions are written to trigger a model, not to read well in a
// table, so a config that has no curated blurbs looks thin. sources.json can
// set borrowFrom: "<another id>" to lift the blurb, effect, delegation tree
// and group placement from an already-built deck wherever skill names match.
// Ungrouped skills land under "Other".
import { readSkills, readAgents, readMcpJson, slugId } from "./_shared.mjs";
import { deriveExtras, folderFor } from "./_commands.mjs";

function indexPayload(payload) {
  const by = new Map();
  for (const g of (payload && payload.groups) || []) {
    for (const s of g.skills || []) by.set(s.name, { skill: s, title: g.title, lead: g.lead });
  }
  return by;
}

export async function build({ repoRoot, borrowed, entry = {} }) {
  const fmBy = await readSkills(repoRoot);
  const extras = deriveExtras(fmBy);
  const borrow = indexPayload(borrowed);
  const rules = Array.isArray(entry.folders) ? entry.folders : [];
  const groups = new Map();
  const blurbOf = (n) => (borrow.get(n) ? borrow.get(n).skill.blurb : (fmBy.get(n) || {}).description || "");

  for (const [name, fm] of fmBy) {
    const b = borrow.get(name);
    const x = extras.get(name);
    const rule = rules.find((r) => r.folder === folderFor(name, fm.description, rules));
    const title = b ? b.title : rule ? rule.folder : "Other";
    if (!groups.has(title)) groups.set(title, { id: slugId(title), title, lead: b ? b.lead : rule ? rule.lead || "" : "", skills: [] });
    // Curated uses win where there are any, kept only where this config has the
    // skill on disk; otherwise the skills its own SKILL.md names.
    const curated = b ? (b.skill.uses || []).filter((u) => fmBy.has(u.name)) : [];
    const found = x.uses.map((n) => ({ kind: "skill", name: n, blurb: blurbOf(n) }));
    groups.get(title).skills.push({
      name,
      blurb: b ? b.skill.blurb : fm.description,
      effect: b ? b.skill.effect || "build" : "build",
      effectNote: b ? b.skill.effectNote || "" : "",
      mode: fm.mode,
      arg: fm.arg,
      onDisk: true,
      commands: x.commands,
      uses: curated.length ? curated : found,
      usesNote: b ? b.skill.usesNote || "" : ""
    });
  }

  // Groups follow the order of the folder rules, then the rest alphabetically, with Other last.
  const order = rules.map((r) => r.folder);
  const rank = (t) => (t === "Other" ? 2 : order.includes(t) ? 0 : 1);
  return {
    groups: [...groups.values()].sort((a, b) =>
      rank(a.title) - rank(b.title) || (order.indexOf(a.title) - order.indexOf(b.title)) || a.title.localeCompare(b.title)),
    agents: await readAgents(repoRoot),
    mcps: await readMcpJson(repoRoot),
    plugins: []
  };
}

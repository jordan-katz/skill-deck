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

function indexPayload(payload) {
  const by = new Map();
  for (const g of (payload && payload.groups) || []) {
    for (const s of g.skills || []) by.set(s.name, { skill: s, title: g.title, lead: g.lead });
  }
  return by;
}

export async function build({ repoRoot, borrowed }) {
  const fmBy = await readSkills(repoRoot);
  const borrow = indexPayload(borrowed);
  const groups = new Map();

  for (const [name, fm] of fmBy) {
    const b = borrow.get(name);
    const title = b ? b.title : "Other";
    if (!groups.has(title)) groups.set(title, { id: slugId(title), title, lead: b ? b.lead : "", skills: [] });
    groups.get(title).skills.push({
      name,
      blurb: b ? b.skill.blurb : fm.description,
      effect: b ? b.skill.effect || "build" : "build",
      effectNote: b ? b.skill.effectNote || "" : "",
      mode: fm.mode,
      arg: fm.arg,
      onDisk: true,
      // Only keep delegations to skills this config actually has on disk.
      uses: b ? (b.skill.uses || []).filter((u) => fmBy.has(u.name)) : [],
      usesNote: b ? b.skill.usesNote || "" : ""
    });
  }

  return {
    groups: [...groups.values()].sort((a, b) => a.title.localeCompare(b.title)),
    agents: await readAgents(repoRoot),
    mcps: await readMcpJson(repoRoot),
    plugins: []
  };
}

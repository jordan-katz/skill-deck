// Repos that keep a curated docs/skills.json alongside skills/ and agents/.
// The JSON supplies the grouping, the effect levels and the delegation graph;
// the SKILL.md frontmatter supplies the argument hint and invocation mode.
import { join } from "node:path";
import { readJson, readSkills, readAgents } from "./_shared.mjs";

export async function build({ repoRoot }) {
  const deck = await readJson(join(repoRoot, "docs", "skills.json"));
  const fmBy = await readSkills(repoRoot);

  const groups = deck.groups.map((g) => ({
    id: g.id,
    title: g.title,
    lead: g.lead,
    skills: Object.entries(g.skills).map(([name, blurb]) => {
      const fm = fmBy.get(name) || {};
      const eff = deck.effects[name] || {};
      const uses = (deck.uses[name] || []).map((id) => {
        if (deck.agents[id]) return { kind: "agent", name: id, blurb: deck.agents[id].blurb };
        if (deck.mcps[id]) return { kind: "mcp", name: id, blurb: deck.mcps[id].blurb };
        const g2 = deck.groups.find((x) => x.skills[id]);
        return { kind: "skill", name: id, blurb: g2 ? g2.skills[id] : "" };
      });
      return {
        name, blurb,
        effect: eff.level || "build",
        effectNote: eff.note || "",
        mode: fm.mode || "auto",
        arg: fm.arg || "",
        onDisk: fmBy.has(name),
        uses,
        usesNote: deck.useNotes[name] || ""
      };
    })
  }));

  const spawnMap = Object.fromEntries(Object.entries(deck.agents).map(([k, v]) => [k, v.spawnedBy]));
  const agents = (await readAgents(repoRoot, spawnMap)).map((a) => ({
    ...a,
    blurb: deck.agents[a.name] ? deck.agents[a.name].blurb : a.blurb,
    spawnedBy: deck.agents[a.name] ? deck.agents[a.name].spawnedBy : a.spawnedBy,
    model: a.model || (deck.agents[a.name] || {}).model || "sonnet",
    readOnly: a.readOnly || Boolean((deck.agents[a.name] || {}).readOnly)
  }));

  return {
    groups,
    agents,
    mcps: Object.entries(deck.mcps).map(([name, v]) => ({ name, ...v })),
    plugins: Object.entries(deck.plugins).map(([name, v]) => ({ name, ...v })),
    effectLevels: deck.effectLevels
  };
}

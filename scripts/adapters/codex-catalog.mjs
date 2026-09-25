// Repos that keep a skill-deck/catalog.json describing capabilities,
// connections and workflows. Groups come from each capability's category.
import { join } from "node:path";
import { readJson, readSkills, readAgents, slugId } from "./_shared.mjs";

export async function build({ repoRoot }) {
  const cat = await readJson(join(repoRoot, "skill-deck", "catalog.json"));
  const fmBy = await readSkills(repoRoot);
  const byId = new Map(cat.capabilities.map((c) => [c.id, c]));

  const byCategory = new Map();
  for (const c of cat.capabilities) {
    if (!byCategory.has(c.category)) byCategory.set(c.category, []);
    const fm = fmBy.get(c.id) || {};
    byCategory.get(c.category).push({
      name: c.id,
      label: c.name,
      blurb: c.summary,
      useWhen: c.useWhen,
      avoidWhen: c.avoidWhen,
      effect: c.effect,
      effectNote: "",
      kind: c.kind,
      source: c.source,
      invoke: c.invoke,
      mode: fm.mode || "auto",
      arg: fm.arg || "",
      onDisk: fmBy.has(c.id),
      uses: (c.delegates || []).map((id) => ({
        kind: byId.has(id) ? (byId.get(id).kind === "skill" ? "skill" : "specialist") : "connection",
        name: id,
        blurb: byId.has(id) ? byId.get(id).summary : ""
      })),
      usesNote: (c.relationshipEvidence || []).map((e) => e.reason).join(" ")
    });
  }

  return {
    groups: [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([title, skills]) => ({ id: slugId(title), title, lead: "", skills })),
    agents: await readAgents(repoRoot),
    mcps: cat.connections.map((c) => ({
      name: c.name, blurb: c.summary, scope: c.type,
      auth: c.status, verifiedAt: c.verifiedAt || ""
    })),
    plugins: [],
    workflows: cat.workflows
  };
}

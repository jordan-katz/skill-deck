// node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readSkills, frontmatter } from "../scripts/adapters/_shared.mjs";
import { deriveExtras, folderFor, parseCommands } from "../scripts/adapters/_commands.mjs";
import { build } from "../scripts/adapters/skills-dir.mjs";

const fixture = join(dirname(fileURLToPath(import.meta.url)), "fixture");

test("folded frontmatter joins into one line", () => {
  const fm = frontmatter("---\ndescription: >\n  one\n  two\nname: x\n---\n");
  assert.equal(fm.description, "one two");
  assert.equal(fm.name, "x");
});

test("command table: deprecated rows and non-command tables stay out", async () => {
  const fmBy = await readSkills(fixture);
  const cmds = parseCommands(fmBy.get("polish-kit").text).map((c) => c.cmd);
  assert.deepEqual(cmds, ["polish", "harden", "optimize", "finish"]);
});

test("argument-hint choices, with descriptions from bullets", async () => {
  const fmBy = await readSkills(fixture);
  const cmds = parseCommands(fmBy.get("site-check").text);
  assert.deepEqual(cmds.map((c) => c.cmd), ["audit", "verify", "ship"]);
  assert.equal(cmds[0].desc, "Read every page and list what is wrong.");
});

test("an example list in argument-hint is not a command list", async () => {
  const fmBy = await readSkills(fixture);
  assert.deepEqual(parseCommands(fmBy.get("notes").text), []);
});

test("macros and uses", async () => {
  const x = deriveExtras(await readSkills(fixture));
  const finish = x.get("polish-kit").commands.find((c) => c.cmd === "finish");
  assert.deepEqual(finish.steps, [
    { skill: "polish-kit", cmd: "polish" }, { skill: "polish-kit", cmd: "harden" }, { skill: "polish-kit", cmd: "optimize" }
  ]);
  const ship = x.get("site-check").commands.find((c) => c.cmd === "ship");
  assert.deepEqual(ship.steps, [{ skill: "site-check", cmd: "audit" }, { skill: "polish-kit", cmd: "harden" }]);
  assert.equal(x.get("polish-kit").commands.find((c) => c.cmd === "polish").steps, undefined);
  assert.deepEqual(x.get("polish-kit").uses, ["site-check"]);
  assert.deepEqual(x.get("site-check").uses, ["polish-kit"]);
  // `check` is prose; `/site-check` is a skill; `not-a-skill` is not installed.
  assert.deepEqual(x.get("notes").uses, ["site-check"]);
});

test("folder rules: names and prefixes beat keywords", () => {
  const rules = [
    { folder: "Writing", keywords: ["site"] },
    { folder: "Web/QA", names: ["site-check"] },
    { folder: "Web/Polish", prefixes: ["polish-"] }
  ];
  assert.equal(folderFor("site-check", "Check a site", rules), "Web/QA");
  assert.equal(folderFor("polish-kit", "", rules), "Web/Polish");
  assert.equal(folderFor("notes", "notes about a site", rules), "Writing");
  assert.equal(folderFor("notes", "", rules), null);
});

test("skills-dir groups by folder rules, Other last, and fills uses", async () => {
  const inv = await build({ repoRoot: fixture, entry: { folders: [{ folder: "Web/QA", names: ["site-check"], lead: "Before it ships." }] } });
  assert.deepEqual(inv.groups.map((g) => g.title), ["Web/QA", "Other"]);
  assert.equal(inv.groups[0].lead, "Before it ships.");
  const pk = inv.groups[1].skills.find((s) => s.name === "polish-kit");
  assert.equal(pk.blurb, "Final quality passes on a front end. Folded across two lines on purpose.");
  assert.deepEqual(pk.uses, [{ kind: "skill", name: "site-check", blurb: "Check a site before it goes out." }]);
  assert.ok(!("text" in pk));
});

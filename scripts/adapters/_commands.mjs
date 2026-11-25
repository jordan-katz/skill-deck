// Structure a SKILL.md already spells out, read so nobody has to curate it by hand.
//
//   commands  what a skill takes as its first argument. Read from a table whose
//             first header cell is "Command", or from an argument-hint that
//             lists one-word choices ("audit | verify | ship").
//   steps     a command whose own section names other commands or skills is a
//             macro: "Run `polish`, `harden`, then `optimize`." becomes three steps.
//   uses      other skills the body names in backticks. A hyphenated name counts
//             on sight; a bare word like `check` counts only written as `/check`,
//             because a bare word in backticks is usually prose.
//
// Everything here is a pure function of the SKILL.md text and the set of skill
// names, so test/commands.test.mjs runs it against fixtures with no config.
import { body, frontmatter } from "./_shared.mjs";

// Words an argument-hint uses for the shape of an argument, not for a command.
const STOP = new Set(["then", "target", "feature", "file", "path", "url", "name", "args", "arg", "options", "option", "mode", "or", "and", "the", "to", "on", "off"]);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const squash = (s) => s.replace(/\s+/g, " ").trim();
const firstSentence = (s) => {
  const t = squash(s.replace(/[*_`]/g, ""));
  return (t.match(/^.*?[.!?](?=\s|$)/)?.[0] || t).slice(0, 180);
};

function sectionFor(md, tok) {
  const m = new RegExp(`^#{2,4}\\s+\`?${esc(tok)}\`?\\s*$`, "mi").exec(md);
  if (!m) return null;
  const rest = md.slice(m.index + m[0].length);
  const end = rest.search(/^#{1,4}\s/m);
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}

/** Commands a skill takes as its first argument, each { cmd, group, desc, section? }. */
export function parseCommands(text) {
  const md = body(text);
  const out = [];
  const seen = new Set();
  const add = (c) => {
    if (seen.has(c.cmd) || /^deprecated/i.test(c.desc || "")) return;
    seen.add(c.cmd);
    out.push(c);
  };
  // 1. | `polish [target]` | Refine | Final quality pass |
  // Only tables headed "Command", so API reference tables stay out.
  let inTable = false;
  for (const line of md.split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) { inTable = false; continue; }
    if (/^\|\s*commands?\s*\|/i.test(line)) { inTable = true; continue; }
    const m = inTable && line.match(/^\|\s*`([a-z][\w-]*)(?:\s+\[[^\]`]*\])?`\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/);
    if (m) add({ cmd: m[1], group: m[2], desc: m[3], section: sectionFor(md, m[1]) });
  }
  if (out.length) return out;

  // 2. argument-hint: "audit | verify | ship", or "[audit|verify] [target]".
  const hint = String(frontmatter(text)["argument-hint"] || "").replace(/^["']|["']$/g, "");
  if (!hint.includes("|")) return out;
  const list = hint.replace(/\[[^\]]*\]/g, (g) => (g.includes("|") ? g.slice(1, -1) : " "));
  // Every choice has to be one word: topic | "nvidia earnings" is an example, not a command list.
  const parts = list.split(/[|·]/).map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  if (parts.length < 2 || !parts.every((x) => /^[a-z][\w-]*$/.test(x))) return out;
  for (const tok of parts) {
    if (STOP.has(tok)) continue;
    const section = sectionFor(md, tok);
    const bullet = md.match(new RegExp(`^\\s*[-*]\\s+\`${esc(tok)}\`\\s*[:\\u2014-]\\s*(.+)$`, "mi"));
    add({ cmd: tok, group: "", desc: section ? firstSentence(section) : bullet ? firstSentence(bullet[1]) : "", section });
  }
  return out;
}

/**
 * The steps a macro's section spells out. `cmdsOf(name)` lists a skill's commands.
 * Inside skill `self`, "Run `polish`, `harden`, then `optimize`." gives three of
 * self's own commands; "Run `site-check` `audit`" switches to another skill.
 */
export function parseSteps(section, cmdsOf, has, self = null) {
  const para = section.split(/\r?\n\s*\r?\n/)[0].replace(/,\s*which[\s\S]*$/i, "");
  const toks = [...para.matchAll(/`\/?([a-z][\w-]*)`(?:\s+in\s+(\w+)\s+mode)?/g)].map((m) => ({ tok: m[1], mode: m[2] }));
  const steps = [];
  let ctx = self;
  toks.forEach(({ tok, mode }, i) => {
    if (ctx && cmdsOf(ctx).includes(tok)) return steps.push({ skill: ctx, cmd: tok });
    if (!has(tok)) return;
    ctx = tok;
    if (mode) return steps.push({ skill: tok, cmd: mode });
    const next = toks[i + 1]?.tok;
    if (!next || !cmdsOf(tok).includes(next)) steps.push({ skill: tok });
  });
  return steps;
}

/** Other skills a SKILL.md body names, in the order it names them. */
export function findUses(text, self, has) {
  const found = new Set();
  for (const [, slash, n] of body(text).matchAll(/`(\/?)([a-z][\w-]*)`/g)) {
    if (n === self || !has(n)) continue;
    if (!n.includes("-") && !slash) continue;
    found.add(n);
  }
  return [...found];
}

/**
 * name -> { commands, uses } for every skill in fmBy (readSkills' result).
 * commands keep { cmd, group, desc } plus steps when the command is a macro.
 */
export function deriveExtras(fmBy) {
  const has = (n) => fmBy.has(n);
  const cmds = new Map();
  for (const [name, s] of fmBy) cmds.set(name, s.text ? parseCommands(s.text) : []);
  const cmdsOf = (n) => (cmds.get(n) || []).map((c) => c.cmd);
  const out = new Map();
  for (const [name, s] of fmBy) {
    const commands = cmds.get(name).map(({ section, ...c }) => {
      if (!section) return c;
      const steps = parseSteps(section, cmdsOf, has, name);
      // A section that only names its own skill is a description, not a macro.
      const real = steps.length > 1 || (steps.length === 1 && steps[0].skill !== name);
      return real ? { ...c, steps } : c;
    });
    const uses = new Set(s.text ? findUses(s.text, name, has) : []);
    for (const c of commands) for (const st of c.steps || []) if (st.skill !== name) uses.add(st.skill);
    out.set(name, { commands, uses: [...uses] });
  }
  return out;
}

/**
 * The group a skill belongs in, from sources.json "folders" rules:
 *   [{ "folder": "Web/Frontend", "names": ["impeccable"], "prefixes": ["figma-"], "keywords": ["landing page"] }]
 * Names and prefixes are checked across every rule before keywords, so an
 * explicit name always beats a keyword that happens to appear in a description.
 */
export function folderFor(name, description, rules = []) {
  for (const r of rules) {
    if ((r.names || []).includes(name)) return r.folder;
    if ((r.prefixes || []).some((p) => name.startsWith(p))) return r.folder;
  }
  const desc = String(description || "").toLowerCase();
  for (const r of rules) if ((r.keywords || []).some((k) => desc.includes(String(k).toLowerCase()))) return r.folder;
  return null;
}

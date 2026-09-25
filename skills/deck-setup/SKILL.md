---
name: deck-setup
description: Wire this skill deck to the user's own agent configs and curate the result. Use when someone has cloned skill-deck and wants it to show their setup, when they ask to add an agent or tab to the deck, or when the deck is showing the invented starter content.
---

# Setting up someone's deck

The deck renders `data/*.json`. `sync.mjs` fills those from configs on disk;
`build.mjs` turns them into `index.html` and reads nothing outside the repo.

Syncing is the easy half and takes about a minute. The half that matters is
what comes after, and you should not stop at a green build.

## 1. Find what they actually run

Look for config directories before asking. Check `~/.claude`, `~/.codex`,
`~/.kimi-code`, `~/.config/opencode`, and any sibling `*-config` repo next to
this checkout. Report what you found and let them cut the list.

## 2. Pick an adapter per config

- `skills-dir` reads `skills/<name>/SKILL.md`, `agents/*.md` and an optional
  `mcp.json`. It needs nothing else, so it is the right answer unless the
  config has a curated catalog.
- `claude-config` also reads a hand-maintained `docs/skills.json` for grouping,
  effect levels and the delegation graph.
- `codex-catalog` reads `skill-deck/catalog.json`.

If none fit, read `scripts/adapters/_shared.mjs` and write a new adapter next
to the others. It exports `build(ctx)` and returns inventory only.

## 3. Write the entry

One object per agent in `data/sources.json`. `path` takes `~`, absolute or
repo-relative. Everything other than `path`, `adapter` and `borrowFrom` is
identity and gets copied onto the payload, so the adapter never learns
anything about their setup:

```json
"claude-code": {
  "adapter": "skills-dir",
  "path": "~/.claude",
  "name": "Claude Code",
  "binary": "claude",
  "configPath": "~/.claude",
  "commandPrefix": "/",
  "mcpCheck": "claude mcp list"
}
```

Then delete the starter entries they are not using, and run:

```
node scripts/sync.mjs && node scripts/build.mjs
```

## 4. Curate, which is the actual work

A raw sync produces a deck nobody can read. `SKILL.md` descriptions are
written to make a model reach for a skill, so they are long, they hedge, and
they open with trigger keywords. In a table cell that reads as noise:

> Prepare, verify, and hand off a safe, versioned Aseprite workflow. Use when
> the user asks to edit sprites, mentions .aseprite files, wants to...

Rewrite each one as a sentence you would say to a colleague. One line, present
tense, leading with the verb, no "use when", no keyword list.

> Edit sprite files safely and hand back a versioned copy.

Three more passes, each of which only a person or a reading agent can do:

**Group by the job, not the tool.** Six or seven groups, each with a one-line
lead. "Execution", "Writing", "Config" beat "Utilities" and "Misc". A skill
belongs where someone would look for it mid-task.

**Set the effect level honestly.** `inspect` reads and reports, `draft`
produces text, `build` edits the repo, `external` reaches past it. This is a
judgment about blast radius that nothing can infer, and a deck that says
`build` for everything has told the reader nothing. Add an `effectNote` wherever
the level alone would mislead: what it writes, what it stops before doing.

**Fill the delegation tree.** `uses` is what makes the deck worth opening,
because it shows the blast radius before the run. Read each skill for what it
actually calls. Add a `usesNote` when the shape needs a sentence.

If they run more than one agent and the skill names overlap, set `borrowFrom`
on the thinner one so it inherits the curated blurbs rather than being written
twice. Borrowers build after the config they borrow from.

## 5. Check it before handing it over

- `node scripts/build.mjs --check` exits non-zero when `index.html` is stale.
- The sync exits non-zero when it writes nothing, which is what catches a path
  that no longer resolves.
- Open `index.html` and read the first screen. If any blurb still reads like
  trigger text, go back to step 4.
- `node scripts/watch.mjs` rebuilds on save while you iterate.

## Keeping their own data out of the repo

If they want to keep the public repo clean, write `deck.local.json` at the repo
root pointing at inventory somewhere else. It is gitignored, and both scripts
respect it:

```json
{ "dataDir": "../my-deck-data", "out": "../my-deck-data/index.html" }
```

`SKILL_DECK_DATA_DIR` and `SKILL_DECK_OUT` do the same thing and win over the
file. The tracked `data/` keeps the starter, and their deck builds beside their
own files.

## 6. Make it one keystroke

A reference you have to go find is a reference you stop using. `open
index.html` puts it in a `file://` tab among forty others, which is the
failure mode, not the finish line. Offer to wire a launcher at the end of
setup, and pick the mechanism from what is actually on their machine rather
than assuming.

Chromium browsers have app mode, which is the good answer. A chromeless
window, its own taskbar entry, its own alt-tab slot:

```
chrome --app="file:///ABSOLUTE/PATH/index.html" --window-size=1000,900
```

Wrap that in whatever their OS uses for a launcher:

- **Windows**: a `.lnk` on the desktop, written with `WScript.Shell`. Set
  `TargetPath` to the browser, `Arguments` to the line above, and
  `WorkingDirectory` to the deck folder.
- **macOS**: a small `.app` from Automator running the same line, or a shell
  alias if they would rather type it.
- **Linux**: a `.desktop` entry with `Exec=` set to the same line.

Two cases where app mode is not available, so say so rather than shipping
something broken:

- **Firefox** removed site-specific browsers. Pin the tab, or use a Chromium
  browser for this one thing.
- **Safari**'s Add to Dock refuses `file://` URLs. Serve the folder over
  localhost and point the dock item at that, or use a Chromium browser.

Point the launcher at the built file, not at a copy. Rebuilds write in place,
so the shortcut keeps working and never needs updating. If they set `out` in
`deck.local.json`, point it at that path instead.

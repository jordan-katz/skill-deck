# Skill deck

A single-page reference for everything your coding agents can reach: the
commands, the skills, the subagents they spawn, the MCP servers they talk to.
One HTML file, no build step at read time, no dependencies.

It exists because `claude mcp list` and `/skills` answer "what is installed"
and not the question you actually have mid-task, which is "what do I type, what
will it touch, and what does it pull in."

Clone it and open `index.html`. What you see is an invented starter deck. The
next two sections replace it with yours.

## Quickstart

If you have Claude Code, ask it:

> set up the skill deck for my config

It reads `skills/deck-setup/SKILL.md`, finds your config directories, wires
them up and curates the result. The curation is the part worth having: raw
`SKILL.md` descriptions are written to trigger a model, not to read in a table,
so a deck built straight from them is unreadable.

By hand instead:

```bash
git clone https://github.com/jordan-katz/skill-deck
cd skill-deck
$EDITOR data/sources.json     # copy _example to a real key, point path at your config
node scripts/sync.mjs
node scripts/build.mjs
open index.html
```

A fresh clone has no agents configured, so `sync.mjs` stops and says so rather
than guessing. The key you choose becomes `data/<key>.json` and becomes a tab;
picking `claude-code` or `example` replaces one of the starter tabs, which
`git checkout data/` brings back.

## Keeping it one keystroke away

A reference you have to go find is one you stop using. Open it in a Chromium
browser's app mode and it gets a chromeless window, its own taskbar entry and
its own alt-tab slot:

```
chrome --app="file:///ABSOLUTE/PATH/index.html" --window-size=1000,900
```

Wrap that in a `.lnk` on Windows, a small Automator `.app` on macOS, or a
`.desktop` entry on Linux. Rebuilds write in place, so the shortcut never needs
updating. Firefox dropped site-specific browsers and Safari's Add to Dock
refuses `file://`, so on those, pin a tab or serve the folder over localhost.

Ask Claude Code to set this up along with the rest and it will pick the right
mechanism for your machine.

## How it fits together

`sync.mjs` reads your configs and writes `data/*.json`. `build.mjs` reads only
`data/` and writes `index.html`, so a build works on a bare checkout with no
configs present and CI can verify it.

A tab is any `data/*.json` that is not `deck.json`, `sources.json` or
`commands.json`. Adding an agent is dropping a file in `data/`, never editing a
script. `deck.json` holds the brand, the tab order and the effect vocabulary.

Each entry in `data/sources.json` names an adapter:

| Adapter | Reads |
|---|---|
| `skills-dir` | `skills/<name>/SKILL.md`, `agents/*.md`, optional `mcp.json`. Needs nothing else. Groups come from `folders` rules in `sources.json`. |
| `claude-config` | The above plus a curated `docs/skills.json` for grouping and effect levels. |
| `codex-catalog` | `skill-deck/catalog.json`. |

Write your own in `scripts/adapters/` if your layout differs. An adapter
exports `build(ctx)` and returns inventory; identity like the binary name and
command prefix lives in `sources.json`, so adapters stay generic.

`borrowFrom` lets a thin config inherit a curated one's blurbs, effect levels
and delegation trees wherever skill names match.

Every adapter also reads structure a `SKILL.md` already spells out, so a raw
sync is not flat:

- Commands: a table whose first header cell is `Command`, or an
  `argument-hint` that lists one-word choices (`audit | verify | ship`). Each
  becomes a chip under the skill that copies the full line.
- Macros: a command whose own section names other commands or skills ("Run
  `polish`, `harden`, then `optimize`.") is drawn as a macro and carries its
  steps.
- Uses: other skills the body names in backticks. A hyphenated name counts on
  sight. A bare word like `check` only counts written as `/check`, since a bare
  word in backticks is usually prose. Curated uses win wherever there are any.

`skills-dir` groups by `folders` rules on the entry, checked in order, names and
prefixes before keywords. Anything unmatched lands in Other:

```json
"folders": [
  { "folder": "Web/Frontend", "lead": "Building and polishing UI.", "names": ["polish-kit"], "prefixes": ["figma-"] },
  { "folder": "Writing", "keywords": ["prose", "copy"] }
]
```

## Using it

Click any command to copy it. The `uses` number opens the tree of what it
delegates to, three levels deep, and says when a skill it names is not
installed for this agent and which tab has it.

`Ctrl+K` searches every command in every tab. Matching is fuzzy, so `chk flk`
finds `/check flaky`, and an empty palette opens on your recent and pinned
commands.

| Key | Does |
|---|---|
| `Enter` | Copy |
| `Shift+Enter` | Add to the chain |
| `Alt+Enter` | Pin. `Alt+1` through `Alt+9` copy a pin from anywhere |
| `Ctrl+Enter` | Jump to the row |
| `Tab` | Search one agent, then the next, then all |
| `go` | List the tabs to jump to |
| `/` | Narrow the current view |

### Chains

A chain is several skills or commands for one agent, rendered as one prompt.
`Alt+click` a command to add it, or flip the click toggle to `chain` (the only
way on a phone). Alt+clicking a macro adds all of its steps. Every step you add
puts the whole chain so far on the clipboard, so Ctrl+V pastes it into any
session without going back to the tray. Clear can be undone until the next step
goes in.

With a command prefix the chain reads as commands the agent knows:

```
/polish-kit polish, then harden on src/app. Then /site-check ship. Same target throughout, one bounded pass per step in this order, one consolidated report at the end.
```

Without one it becomes a numbered instruction any agent can follow. The target
field is added to every copy while it is set, chained or not. The chain, its
target and your pins live in `localStorage`, so they stay with this browser.

### Motion

The header carries a particle ribbon in the theme accent, and the first visit
in a session gets a short entrance. `fx off` in the header turns all of it off,
and `prefers-reduced-motion` reduces it to short fades and a still ribbon. The
ribbon draws at 30fps at most and stops while the tab is hidden.

## Keeping your deck out of the repo

`deck.local.json` at the repo root, gitignored, points both scripts elsewhere:

```json
{ "dataDir": "../my-deck-data", "out": "../my-deck-data/index.html" }
```

`SKILL_DECK_DATA_DIR` and `SKILL_DECK_OUT` do the same and win over the file.

## Scripts

```
node scripts/sync.mjs           # configs  -> data/
node scripts/build.mjs          # data/    -> index.html
node scripts/build.mjs --check  # non-zero if index.html is stale
node scripts/watch.mjs          # rebuild on save
node --test test/*.test.mjs     # the SKILL.md parser against test/fixture
```

Both scripts fail loudly. The sync exits non-zero when it writes nothing,
because the failure mode that actually bites is a path that stopped resolving
and a script that kept exiting 0.

MIT.

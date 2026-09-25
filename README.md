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
| `skills-dir` | `skills/<name>/SKILL.md`, `agents/*.md`, optional `mcp.json`. Needs nothing else. |
| `claude-config` | The above plus a curated `docs/skills.json` for grouping and effect levels. |
| `codex-catalog` | `skill-deck/catalog.json`. |

Write your own in `scripts/adapters/` if your layout differs. An adapter
exports `build(ctx)` and returns inventory; identity like the binary name and
command prefix lives in `sources.json`, so adapters stay generic.

`borrowFrom` lets a thin config inherit a curated one's blurbs, effect levels
and delegation trees wherever skill names match.

## Using it

`Ctrl+K` searches every command in every tab and copies on Enter.
`Ctrl+Enter` jumps to the row instead. `Alt+Enter` pins, and `Alt+1` through
`Alt+9` copy a pinned command from anywhere on the page. `/` narrows the
current view. The `uses` number opens the tree of what a command delegates to.

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
```

Both scripts fail loudly. The sync exits non-zero when it writes nothing,
because the failure mode that actually bites is a path that stopped resolving
and a script that kept exiting 0.

MIT.

---
name: polish-kit
description: >
  Final quality passes on a front end.
  Folded across two lines on purpose.
argument-hint: "[command] [target]"
---

# Polish kit

| Command | Group | What it does |
|---|---|---|
| `polish [target]` | Refine | Final quality pass on spacing and type |
| `harden [target]` | Refine | Error states, empty states, long text |
| `optimize [target]` | Speed | Cut what slows the first paint |
| `legacy` | Old | Deprecated, use polish |
| `finish [target]` | Macro | Everything before a handoff |

Run `site-check` afterwards to confirm nothing broke.

## finish

Run `polish`, `harden`, then `optimize`, which covers the usual handoff.

## API

| Method | Returns |
|---|---|
| `get` | a thing |

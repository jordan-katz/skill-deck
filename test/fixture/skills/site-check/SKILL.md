---
name: site-check
description: Check a site before it goes out.
argument-hint: audit | verify | ship
---

- `audit`: Read every page and list what is wrong.
- `verify`: Re-run the last audit's findings.

## ship

Run `site-check` `audit`, then `polish-kit` `harden`.

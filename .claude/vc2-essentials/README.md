# VC 2.0 Essentials — vendored into this repo

Venture analysis tooling from [next-wave-partners/vc2-essentials](https://github.com/next-wave-partners/vc2-essentials)
(v2.2.0, by Next Wave Partners / John Cowan), unpacked from the upstream
`claude-plugin/vc2-essentials.plugin` bundle and wired in as **project-level**
Claude Code commands and skills so they work in any session on this repo —
CLI, desktop, or web — with nothing to install.

## Slash commands

| Command | What it does |
|---|---|
| `/score-opportunity` | EPAC-validated 10-dimension venture scorecard |
| `/generate-safer` | Safer term sheet with VREC provisions |
| `/simulate-safer` | Safer scenario simulation → HTML report |
| `/simulate-fund` | Monte Carlo fund simulation |

## Layout

```
.claude/commands/           four slash commands (upstream commands/)
.claude/skills/studio-os/   scorecard skill, auto-loads by description
.claude/vc2-essentials/     this folder — scripts + upstream docs
  tools/safer.py            stdlib only, runs as-is
  tools/safer_monte_carlo.py  needs numpy, pandas, matplotlib
```

Upstream commands referenced `${CLAUDE_PLUGIN_ROOT}`, which is only defined for
installed plugins. Those paths were rewritten to repo-relative ones during the
vendoring; that is the only change to the command text, apart from the note below.

## Known gaps

- `/generate-safer` upstream opens by reading a `capital-structurer` skill that
  the free release does not ship. The command now treats that read as optional
  and falls back to its own inline parameter defaults.
- `tools/safer_monte_carlo.py` needs `numpy`, `pandas`, and `matplotlib`, none
  of which are project dependencies. Install them into a virtualenv before
  running `/simulate-fund`; `/simulate-safer` has no such requirement.

## Updating

Re-download the upstream `.plugin` (it is a zip), unpack it, copy `commands/`,
`skills/`, and `tools/` over the paths above, and redo the
`${CLAUDE_PLUGIN_ROOT}` rewrite.

## Licensing

Prompts and methodology are **CC BY-NC 4.0** (non-commercial) — see the upstream
repo. `tools/SAFER-LICENSE` covers the simulator scripts. Fine for personal use;
check both licenses before any commercial use.

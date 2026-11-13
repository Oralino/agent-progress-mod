# Agent Progress Mod

A Claude Code mod (`team-progress`): a progress band above the prompt and a `/team` panel of subagents. Published at github.com/Oralino/agent-progress-mod.

## Rules

- No credits or references to other projects anywhere: code, comments, docs, commits. The code was written clean-room from a spec; keep it that way (never copy code from another mod).
- `LICENSE` holds only the owner's MIT notice.
- Every change must keep the mod plug and play: no setup steps for users beyond the one-line install.
- Bump `version` in `team-progress/.claude-plugin/plugin.json` for every user-visible change (users update by version).
- README screenshots show only the mod's own UI, cropped. Never capture other windows.

## Commands

From the repository root (if `claude` is not on PATH, use the copy the desktop app installed):

```bash
claude plugin validate .               # manifest, marketplace, hooks module
claude plugin test team-progress       # tests in team-progress/tests
```

Type check: `tsc -p` with a tsconfig whose `include` names the engine's API types (`.claude-plugin/types/` once the engine has loaded the mod) plus `hooks`, `types` and `tests`. The engine writes those types; they are gitignored.

All three must pass before a commit.

## Workflow

- The installed copy reads straight from `team-progress/`: after an edit, `/reload-plugins` (or a new session) picks it up.
- Releases: bump the version, update `brain/work/DONE.md`, commit, push to `main`. Users run `claude plugin update team-progress@agent-progress-mod`.

## Documents

| File | Owns | Maintained by |
|---|---|---|
| `README.md` | public description, install, screenshots | lead |
| `brain/product/REQUIREMENTS.md` | goal, features, owner decisions, scope, acceptance criteria | lead, from the owner's answers |
| `brain/design/DESIGN.md` | how the band and panel look, colors | design-advisor; owner approves |
| `brain/engineering/ARCHITECTURE.md` | stack, layout, hooks, state, data flow, known limits | lead |
| `brain/work/TASKS.md` | open work and bugs | lead |
| `brain/work/DONE.md` | finished work and releases | lead |

Update the docs when the code changes; flag contradictions between docs and code instead of guessing.

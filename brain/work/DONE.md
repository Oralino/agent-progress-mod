# Done

Owns: finished work and releases, newest first. Open work: [TASKS.md](TASKS.md).

## 2026-11-12

- **0.5.0**: the band no longer depends on the lead remembering to report. The `progress` tool is always in the tool list (no ToolSearch), the system prompt guide says to report any task that edits files or takes more than a couple of tool calls, agents or not, and a safety net starts the band by itself after 3 unreported tool calls in a turn.
- **Project docs**: added the root `CLAUDE.md` and this `brain/` folder.
- **0.4.0**: every agent type has a unique color it keeps across runs and sessions. Built-in types have fixed colors; others get an unused color on first sight, saved in `$.store`. Screenshot `docs/panel-colors.png` added to the README.
- **0.3.1**: agent types without a built-in color got a palette color instead of grey (by name hash; replaced in 0.4.0 because hashes could collide).
- **0.3.0**: plug and play. The mod adds its own reporting guide to the lead's system prompt (no CLAUDE.md edit), accepts any agent type as a task role, asks every working subagent for step reports, and falls back cleanly when a hook fails. README: shell install line, version note, setup and uninstall. Install from GitHub tested on a clean config.
- **0.2.0**: clean-room rewrite of `register.tsx` from a spec, with an officially sourced price table; `LICENSE` reduced to the owner's MIT notice. README screenshots of the band and panel. Band title width and panel spacing fixed. README fact-checked against the code.
- **0.1.1**: reports must ride along with another tool call, never a turn of their own.
- **0.1.0**: first version: progress band, `/team` panel, `progress` and `step` tools. Published to github.com/Oralino/agent-progress-mod (history later squashed).

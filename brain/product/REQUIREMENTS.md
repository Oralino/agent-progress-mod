# Requirements

Owns: what the mod is for, its features, the owner's decisions and what counts as done. How it looks: [DESIGN.md](../design/DESIGN.md). How it is built: [ARCHITECTURE.md](../engineering/ARCHITECTURE.md).

## Goal

Show, inside Claude Code, what the main session (the lead) and its subagents are doing while a task is planned and delegated: progress at a glance, and per-agent model, steps, tokens, estimated cost and time.

## Features

- **Progress band above the prompt**: task title, optional tier (Trivial, Standard, Hard, Very hard), phase (Triage, Plan, Build, Review, QA, Commit), progress bar, done/total during Build and Review, percent, a Team button and a dismiss (✕).
- **Team panel** (`/team` or the Team button): running, finished and planned subagents of the current task, each with agent type, model, self-reported steps, tokens, estimated cost and elapsed time; the lead's own tokens and cost; a collapsible Finished section. Opens by itself once per task when work is first delegated.
- **Reporting tools**: `progress` (lead only) and `step` (subagents only).
- **Agent colors**: every agent type has its own color, never shared, kept across runs and sessions.

## Owner decisions

- Built for the owner's engineering-team workflow first, but must work for anyone with no setup (plug and play).
- No credits or references to other projects; the code is a clean-room rewrite from a spec. `LICENSE` holds only the owner's MIT notice.
- Public repository: github.com/Oralino/agent-progress-mod, installed with `/plugin install team-progress --marketplace Oralino/agent-progress-mod`.
- Reports must ride along with another tool call, never take a turn of their own, to keep token cost low.
- Colors: Plan and claude-code-guide must not share a color; the same agent type keeps the same color every run.
- README carries screenshots of the real UI.

## Scope

In: the band, the panel, the two tools, the lead's system prompt guide, the step request in subagent briefs, cost estimates.

Out: billing data (costs are estimates), changing agents' tool lists (the mod can't), anything outside Claude Code.

## Acceptance criteria

- One-line install from GitHub works on a clean Claude Code config.
- No user setup needed; the lead reports because the mod's system prompt section tells it to.
- Works with any agent type, including `general-purpose` and custom or plugin agents.
- No two agent types share a color; a type keeps its color across runs and sessions.
- A failure inside the mod never blocks an agent spawn or tool call.
- `plugin validate`, `plugin test` and the type check pass.

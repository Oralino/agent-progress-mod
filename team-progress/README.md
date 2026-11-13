# team-progress

A Claude Code mod for the "engineering team" workflow (a lead session that triages and delegates to
`engineer`, `senior-engineer`, `code-reviewer`, `qa-checker`, `design-advisor`, `Explore` and forks).

```
/plugin install team-progress --marketplace Oralino/agent-progress-mod
```

See the repository README for making your agents report.

- **Progress band above the prompt**: the lead's current task, its triage tier, the phase
  (Triage, Plan, Build, Review, QA, Commit), a progress bar, tasks done out of planned during Build
  and Review, a Team button and a ✕ to dismiss it.
- **Team panel** (`/team`, or the band's Team button): the subagents of the current task, running,
  finished and planned, with each one's role, model, self-reported steps, tokens, estimated cost and
  time, plus the lead's own tokens and cost. Finished agents are cleared when a new task starts.

## How it gets its data

- `mcp__team-progress__progress`: a tool the lead calls after triage, after planning, on each phase
  change, when a task is accepted, and with `finished: true` at the end. Calls from subagents are ignored.
- `mcp__team-progress__step`: a tool workers call to report their own steps. The mod appends a short
  request to the briefs of `engineer`, `senior-engineer`, `qa-checker` and forks. Agents whose
  frontmatter has a `tools:` list need `mcp__team-progress__step` added to that list.
- Model, tokens, cost and time are read from the engine's own events, so they show for every subagent
  even if nobody reports anything. Cost is an estimate from a built-in price table.

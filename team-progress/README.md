# team-progress

A Claude Code mod that shows what a session and its subagents are doing: a progress band above the
prompt and a `/team` panel. Works with any agents and needs no setup.

```
/plugin install team-progress --marketplace Oralino/agent-progress-mod
```

- **Progress band above the prompt**: the main session's current task, its tier if it sizes tasks, the
  phase (Triage, Plan, Build, Review, QA, Commit), a progress bar, tasks done out of planned during
  Build and Review, a Team button and a ✕ to dismiss it.
- **Team panel** (`/team`, or the band's Team button): the subagents of the current task, running,
  finished and planned, with each one's type, model, self-reported steps, tokens, estimated cost and
  time, plus the main session's own tokens and cost. Finished agents are cleared when a new task starts.

## How it gets its data

- `mcp__team-progress__progress`: a tool the main session calls when it starts a multi-step task,
  once it has a plan, on each phase change, when a task finishes, and with `finished: true` at the
  end. The mod adds a short section to the main session's system prompt that says when to call it.
  Calls from subagents are ignored.
- `mcp__team-progress__step`: a tool subagents call to report their own steps. The mod appends a short
  request to every subagent's brief except quick lookup agents (`Explore`, `Plan`). An agent whose
  frontmatter has a `tools:` list needs `mcp__team-progress__step` added to that list to report steps.
- Model, tokens, cost and time are read from Claude Code's own events, so they show for every subagent
  even if nobody reports anything. Cost is an estimate from a built-in price table.

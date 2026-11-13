# Architecture

Owns: stack, file layout, hooks, state, data flow, platform facts and known limits. What it must do: [REQUIREMENTS.md](../product/REQUIREMENTS.md). How it looks: [DESIGN.md](../design/DESIGN.md). Open work: [TASKS.md](../work/TASKS.md).

## Stack

- A Claude Code mod: a plugin whose `hooks/hooks.json` names a hooks module, `hooks/register.tsx`, run by Claude Code's early-access function-hooks API (it may change between releases).
- TypeScript + JSX compiled against the engine's global `h`. No DOM, no Node; everything outside the module goes through `$`.
- Tests: `claude plugin test`, using `claude-code/testing`.

## Layout

```
.claude-plugin/marketplace.json   makes the repo a marketplace ("agent-progress-mod"), entry source ./team-progress
team-progress/
  .claude-plugin/plugin.json      name, version, license, "types"
  hooks/hooks.json                { "modules": ["./register.tsx"] }
  hooks/register.tsx              the whole mod
  types/index.d.ts                state contract (PluginState["team-progress"])
  tests/team.test.tsx             tests
docs/                             README screenshots
```

## Hooks

| Hook | Does |
|---|---|
| `session.start` | registers the `progress` and `step` tools and the `/team` command; loads saved colors from `$.store`; starts a 1s clock while agents run |
| `prompt.compose` | appends the `team-progress:guide` section (session scope) to the main session's system prompt, telling the lead when to call `progress`; skipped for `bare`, `teammate` and `analysis` renders |
| `tool.call` `mcp__team-progress__progress` | lead only (a call with `agentId` is ignored); merges into the flow; a new title or a finished flow starts fresh and drops finished runs; assigns colors to task roles |
| `tool.call` `mcp__team-progress__step` | subagents only; updates that run's step counts and note |
| `agent.spawn` | appends the step request to every brief except quick lookup types (`Explore`, `Plan`, `claude-code-guide`, `statusline-setup`); records the run; assigns its color; opens the panel once per task |
| `turn.step` | per model request: a subagent's tokens, context and cost, or the lead's own |
| `turn.complete` | marks a subagent done or failed |
| `ui.render` `AbovePrompt` | the band |
| `ui.render` `Pane` `team-progress` | the panel |

`progress`, `step` and `agent.spawn` have `.catch` handlers: on a failure the tool answers "ignored" and the spawn goes ahead untouched.

## State

`$.state` atoms (per session, kept across hot reloads), each with a shape tag that declines values an older layout stored:
`flow` (the lead's task), `agents` (up to 100 runs), `lead` (lead usage), `panel` (collapse, auto-open key), `now` (clock), `colors` (type → color).

`$.store` key `colors`: the same color map, kept across sessions.

## Data flow

1. The lead reads the guide in its system prompt and calls `progress` alongside its other tool calls.
2. Spawns are recorded by `agent.spawn`; usage comes from `turn.step`/`turn.complete`; workers report steps with `step`.
3. Render hooks read the atoms and redraw on every write.

Cost is estimated per request from a price table (USD per million tokens: input, output, cache read; cache writes at 2x input), sourced from Anthropic's published prices. Haiku 5.5 requests over 100,000 prompt tokens use its higher rates.

## Known limits

- Agents with a `tools:` list in their frontmatter need `mcp__team-progress__step` added to report steps; a mod can't add tools to an agent.
- The lead only reports if it follows the system prompt guide; nothing forces it.
- Colors are unique by value, but generated colors past the palette can look alike.
- A subagent whose usage arrives before its spawn returns shows briefly as a grey "Subagent" row.
- Costs are estimates, not billing data.
- The early-access hooks API may change and break the mod.

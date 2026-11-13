/**
 * team-progress: keeps the person informed while a lead agent delegates work.
 *
 * Two things are tracked in plugin state. The lead reports its current task
 * through the `progress` tool (title, tier, phase, planned tasks, counters),
 * and every subagent the lead spawns gets a row of its own (model, tokens,
 * estimated cost, elapsed time, and the steps the worker reports through the
 * `step` tool). A one-line band above the prompt shows the lead's task; the
 * `/team` command toggles a pane listing running, finished and planned
 * subagents.
 *
 * The cost figures are estimates from a built-in price table, not billing data.
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRun, Flow, Phase, PlannedTask, Tier } from '../types'

const PANE = 'team-progress'
const PROGRESS_TOOL = 'mcp__team-progress__progress'
const STEP_TOOL = 'mcp__team-progress__step'
const MAX_RUNS = 100
const MAX_TASKS = 50

// A shape tag declines state an older layout stored; bump it with the type.
const flowAtom = atom({ plugin: 'team-progress', key: 'flow' } as const, null, { shape: 'flow-2' })
const agentsAtom = atom({ plugin: 'team-progress', key: 'agents' } as const, [], { shape: 'agents-2' })
const leadAtom = atom(
  { plugin: 'team-progress', key: 'lead' } as const,
  { model: '', tokens: 0, costUsd: 0 },
  { shape: 'lead-2' },
)
const panelAtom = atom(
  { plugin: 'team-progress', key: 'panel' } as const,
  { isDoneCollapsed: false, autoOpenedFor: '' },
  { shape: 'panel-2' },
)
const nowAtom = atom({ plugin: 'team-progress', key: 'now' } as const, 0)

// ---------------------------------------------------------------- vocabulary

const ACCENT = '#8f8cf4'
const GOOD = '#5fbf8f'
const BAD = '#e5534b'

const ROLE_COLORS: Record<string, string> = {
  lead: '#8f8cf4',
  engineer: '#378ADD',
  'senior-engineer': '#D85A30',
  'code-reviewer': '#7F77DD',
  'qa-checker': '#1D9E75',
  'design-advisor': '#D4537E',
  Explore: '#888780',
  fork: '#BA7517',
  other: '#888780',
}

const WORKER_ROLES = ['engineer', 'senior-engineer', 'qa-checker', 'fork']
const TIERS: Tier[] = ['trivial', 'standard', 'hard', 'very-hard']
const TIER_WORDS: Record<Tier, string> = {
  trivial: 'Trivial',
  standard: 'Standard',
  hard: 'Hard',
  'very-hard': 'Very hard',
}
const PHASES: Phase[] = ['triage', 'plan', 'build', 'review', 'qa', 'commit']
const PHASE_WORDS: Record<Phase, string> = {
  triage: 'Triage',
  plan: 'Plan',
  build: 'Build',
  review: 'Review',
  qa: 'QA',
  commit: 'Commit',
}

const STEP_NOTE =
  `\n\nProgress reporting: if the tool ${STEP_TOOL} is available, call it with total ` +
  '(the number of steps you plan, 3 to 8) and done: 0 together with your first other tool call. ' +
  'Then call it with done and a few-word note each time a step finishes. Always send it in the ' +
  'same message as your next other tool call, never on its own. If the tool is not available, skip this.'

const isRole = (role: string) => Object.prototype.hasOwnProperty.call(ROLE_COLORS, role) && role !== 'other'
const colorOf = (role: string) => ROLE_COLORS[isRole(role) ? role : 'other'] ?? '#888780'
const roleOfType = (type: string) => type.slice(type.lastIndexOf(':') + 1)

// ------------------------------------------------------------------- numbers

type Rates = { input: number; output: number; cacheRead: number }

function ratesFor(model: string, bigRequest: boolean): Rates {
  const id = model.toLowerCase().replace(/\./g, '-')
  const has = (part: string) => id.includes(part)
  const set = (input: number, output: number, cacheRead: number): Rates => ({ input, output, cacheRead })

  if (has('fable-5-2') || has('mythos-5-2')) return set(8, 40, 0.2)
  if (has('fable') || has('mythos')) return set(10, 50, 1)
  if (has('opus-5-5')) return set(4, 20, 0.2)
  if (has('opus')) return set(5, 25, 0.5)
  if (has('sonnet-5-5')) return set(2, 10, 0.1)
  if (has('sonnet-5')) return set(2, 10, 0.2)
  if (has('sonnet')) return set(3, 15, 0.3)
  if (has('haiku-5-5')) return bigRequest ? set(0.5, 2.5, 0.05) : set(0.1, 0.5, 0.01)
  if (has('haiku')) return set(1, 5, 0.1)
  return set(4, 20, 0.2)
}

type Counts = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

const n0 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

function measure(model: string, usage: Partial<Counts>) {
  const input = n0(usage.input_tokens)
  const output = n0(usage.output_tokens)
  const read = n0(usage.cache_read_input_tokens)
  const write = n0(usage.cache_creation_input_tokens)
  const rates = ratesFor(model, input + read + write > 100_000)
  const costUsd =
    (input * rates.input + output * rates.output + read * rates.cacheRead + write * rates.input * 2) / 1_000_000

  return { context: input + read + write, tokens: input + output + read + write, costUsd }
}

function showTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(Math.round(n))
}

function showCost(usd: number): string {
  return `$${usd < 10 ? usd.toFixed(2) : usd.toFixed(1)}`
}

function showClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')

  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

function showModel(raw: string): string {
  const id = raw.replace(/\[.*$/, '').trim()
  if (id === '') return '—'
  const match = /^claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?(?:-|$)/.exec(id)
  if (match) {
    const name = (match[1] ?? '').replace(/^./, c => c.toUpperCase())
    return `${name} ${match[2]}${match[3] ? `.${match[3]}` : ''}`
  }

  return id.replace(/^claude-/, '') || '—'
}

function clip(text: string, max: number): string {
  const clean = text.trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

function bar(width: number, ratio: number): { filled: string; empty: string } {
  const on = Math.max(0, Math.min(width, Math.round(ratio * width)))
  return { filled: '█'.repeat(on), empty: '░'.repeat(width - on) }
}

const squash = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

// --------------------------------------------------------------- flow helpers

function flowRatio(flow: Flow): number {
  if (flow.isFinished) return 1
  return flow.total > 0 ? Math.min(1, flow.done / flow.total) : 0
}

function flowLabel(flow: Flow): string {
  if (flow.isFinished) return 'Done'
  const word = PHASE_WORDS[flow.phase]
  const counts = (flow.phase === 'build' || flow.phase === 'review') && flow.total > 0
  return counts ? `${word} ${flow.done}/${flow.total}` : word
}

function plannedOf(flow: Flow | null, runs: AgentRun[]): PlannedTask[] {
  if (!flow || flow.isFinished) return []
  const seen = new Set(runs.map(run => squash(run.description)))
  return flow.tasks.filter(task => task.role !== 'lead' && !seen.has(squash(task.title)))
}

async function togglePane($: EngineInterface, onlyOpen = false): Promise<boolean> {
  const panes = await $.ui.panes()
  const isOpen = panes.some(pane => pane.id === PANE)
  if (isOpen && !onlyOpen) {
    await $.ui.close({ id: PANE })
    return false
  }
  await $.ui.open({ id: PANE, title: 'Team' })
  return true
}

async function openOncePerFlow($: EngineInterface, key: string) {
  const panel = await read($, panelAtom)
  if (panel.autoOpenedFor === key) return
  await update($, panelAtom, p => ({ ...p, autoOpenedFor: key }))
  await togglePane($, true)
}

function blankRun(id: string, startedAt: number): AgentRun {
  return {
    id,
    agentId: id,
    type: 'other',
    description: 'Subagent',
    model: '',
    status: 'running',
    startedAt,
    contextTokens: 0,
    tokens: 0,
    costUsd: 0,
    requests: 0,
  }
}

/** Edits the run known by `id` (its row id or agent id); a run seen first by usage gets a stub. */
async function editRun($: EngineInterface, id: string, edit: (run: AgentRun) => AgentRun) {
  const at = await $.clock.now()
  await update($, agentsAtom, list => {
    const index = list.findIndex(run => run.id === id || run.agentId === id)
    if (index < 0) return [...list, edit(blankRun(id, at))].slice(-MAX_RUNS)
    return list.map((run, i) => (i === index ? edit(run) : run))
  })
}

// ------------------------------------------------------------------ progress

type Input = Record<string, unknown>

function readTasks(raw: unknown): PlannedTask[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const tasks: PlannedTask[] = []
  for (const item of raw.slice(0, MAX_TASKS)) {
    const entry = (item ?? {}) as Input
    const title = typeof entry.title === 'string' ? clip(entry.title, 80) : ''
    if (title === '') continue
    const role = typeof entry.role === 'string' && isRole(entry.role) ? entry.role : 'other'
    tasks.push({ title, role })
  }
  return tasks
}

function mergeFlow(previous: Flow | null, input: Input): Flow {
  const title = typeof input.title === 'string' && input.title.trim() !== '' ? clip(input.title, 80) : undefined
  const isFresh = !previous || previous.isFinished || (title !== undefined && title !== previous.title)
  const base: Flow =
    isFresh || !previous
      ? { title: title ?? previous?.title ?? 'Task', tier: '', phase: 'triage', total: 0, done: 0, isFinished: false, tasks: [] }
      : previous

  const tier = TIERS.find(t => t === input.tier) ?? base.tier
  const phase = PHASES.find(p => p === input.phase) ?? base.phase
  const tasks = readTasks(input.tasks) ?? base.tasks
  const total =
    typeof input.total === 'number' && Number.isFinite(input.total)
      ? Math.max(0, Math.floor(input.total))
      : Array.isArray(input.tasks)
        ? tasks.length
        : base.total
  const rawDone = typeof input.done === 'number' && Number.isFinite(input.done) ? Math.floor(input.done) : base.done
  const isFinished = typeof input.finished === 'boolean' ? input.finished : base.isFinished

  return {
    title: base.title,
    tier,
    phase,
    total,
    done: Math.max(0, Math.min(total, isFinished && input.finished === true ? total : rawDone)),
    isFinished,
    tasks,
  }
}

// ------------------------------------------------------------------ register

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)

    await $.tool.register({
      name: 'progress',
      description:
        'Report the lead\'s current task so the person sees a progress band above the prompt. Call it once you have triaged ' +
        'a task (title, tier, phase, the planned tasks with the role that will do each), again when the phase changes or ' +
        'tasks finish (done), and with finished: true when everything is complete. Omitted fields keep their value; a new ' +
        'title starts a fresh task. Only the lead may call it. ' +
        'Always send it in the same message as another tool call (in parallel), never in a message of its own: ' +
        'a call alone costs a whole extra turn.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short name of the task (80 characters at most)' },
          tier: { type: 'string', enum: TIERS },
          phase: { type: 'string', enum: PHASES },
          total: { type: 'integer', description: 'Number of tasks; defaults to the length of tasks' },
          done: { type: 'integer', description: 'Tasks finished so far' },
          finished: { type: 'boolean', description: 'True when the whole task is complete' },
          tasks: {
            type: 'array',
            description: 'The planned tasks (50 at most)',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                role: {
                  type: 'string',
                  enum: ['lead', 'engineer', 'senior-engineer', 'code-reviewer', 'qa-checker', 'design-advisor', 'Explore', 'fork'],
                },
              },
              required: ['title', 'role'],
            },
          },
        },
      },
    })

    await $.tool.register({
      name: 'step',
      description:
        'For subagents only: report your own progress so the person sees it in the team panel. Call it with total ' +
        '(the steps you plan, 3 to 8) and done: 0 with your first other tool call, then with done and a few-word note ' +
        'as each step finishes. Always send it in the same message as your next other tool call, never alone: ' +
        'a call alone costs a whole extra turn.',
      inputSchema: {
        type: 'object',
        properties: {
          done: { type: 'integer', description: 'Steps finished so far' },
          total: { type: 'integer', description: 'Steps planned' },
          note: { type: 'string', description: 'A few words on the step just finished' },
        },
        required: ['done'],
      },
      isDeferred: false,
    })

    await $.command.register({ name: 'team', description: 'Show or hide the team panel of subagents' })

    try {
      $.clock.every(1000, () => {
        void (async () => {
          const runs = await read($, agentsAtom)
          if (runs.some(run => run.status === 'running')) {
            const at = await $.clock.now()
            await update($, nowAtom, () => at)
          }
        })().catch(() => undefined)
      })
    } catch {
      // No clock: elapsed times just stay still.
    }

    return started
  })

  on('command.run', { command: 'team' }, async ($, e) => {
    const isOpen = await togglePane($, e.args.trim() === 'open')
    return { text: isOpen ? 'Team panel opened.' : 'Team panel closed.' }
  })

  on('tool.call', { tool: PROGRESS_TOOL }, async ($, e) => {
    if (e.agentId) return { result: 'ignored: only the lead reports progress' }

    const input = e as unknown as Input
    const before = await read($, flowAtom)
    const next = mergeFlow(before, input)
    const isFresh = before === null || before.title !== next.title || before.isFinished

    await update($, flowAtom, () => next)
    if (isFresh) {
      await update($, agentsAtom, list => list.filter(run => run.status === 'running'))
    }

    const planned = readTasks(input.tasks) ?? []
    if (planned.some(task => task.role !== 'lead')) {
      await openOncePerFlow($, next.title)
    }

    return { result: `ok: ${next.title} · ${flowLabel(next)}` }
  })

  on('tool.call', { tool: STEP_TOOL }, async ($, e) => {
    if (!e.agentId) return { result: 'ignored: only subagents report steps' }

    const input = e as unknown as Input
    const done = Math.max(0, Math.floor(n0(input.done)))
    const total = typeof input.total === 'number' && input.total > 0 ? Math.floor(input.total) : undefined
    const note = typeof input.note === 'string' ? clip(input.note, 60) : undefined

    await editRun($, e.agentId, run => {
      const stepTotal = total ?? run.stepTotal
      return {
        ...run,
        stepTotal,
        stepDone: stepTotal !== undefined ? Math.min(done, stepTotal) : done,
        stepNote: note ?? run.stepNote,
      }
    })

    return { result: 'ok' }
  })

  on('agent.spawn', async ($, e, next) => {
    const type = roleOfType(e.subagentType)
    const wantsSteps = WORKER_ROLES.includes(type) && !e.prompt.includes(STEP_TOOL)
    const spawned = await next(wantsSteps ? { ...e, prompt: e.prompt + STEP_NOTE } : e)

    try {
      if (spawned.deny === undefined) {
        const id = spawned.agentId ?? e.tool_use_id
        await editRun($, id, run => ({
          ...run,
          agentId: spawned.agentId,
          type,
          description: e.description,
          model: run.model || spawned.model,
        }))
        const at = await $.clock.now()
        await update($, nowAtom, () => at)

        if (type !== 'Explore' && isRole(type)) {
          const flow = await read($, flowAtom)
          await openOncePerFlow($, flow?.title ?? '(no task)')
        }
      }
    } catch {
      // Bookkeeping must never fail a spawn.
    }

    return spawned
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)

    try {
      const usage = result.usage
      const model = usage?.model || e.model
      const cost = measure(model, usage ?? {})

      if (e.agentId) {
        await editRun($, e.agentId, run => ({
          ...run,
          model: model || run.model,
          contextTokens: cost.context,
          tokens: run.tokens + cost.tokens,
          costUsd: run.costUsd + cost.costUsd,
          requests: run.requests + 1,
          status: 'running',
        }))
      } else {
        await update($, leadAtom, lead => ({
          model: model || lead.model,
          tokens: lead.tokens + cost.tokens,
          costUsd: lead.costUsd + cost.costUsd,
        }))
      }
    } catch {
      // Usage is a courtesy; never disturb the turn.
    }

    return result
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) {
      try {
        const at = await $.clock.now()
        const status = e.reason === 'answer' ? 'done' : 'failed'
        await editRun($, e.agentId, run => {
          const ended = { ...run, status, endedAt: at } as AgentRun
          if (run.requests > 0 || !e.usage) return ended
          const cost = measure(e.usage.model, e.usage)
          return {
            ...ended,
            model: run.model || e.usage.model,
            contextTokens: cost.context,
            tokens: cost.tokens,
            costUsd: cost.costUsd,
          }
        })
      } catch {
        // Ignore: the turn must end regardless.
      }
    }

    return next(e)
  })

  // ---------------------------------------------------------------------- UI

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const flow = await read($, flowAtom)
    if (flow === null || e.props.hasSurvey) return next(e)

    const runs = await read($, agentsAtom)
    const { Box, Text, Button } = $.ui.resolve(e)
    const columns = e.props.bodyColumns
    const color = flow.isFinished ? GOOD : ACCENT
    const ratio = flowRatio(flow)
    const track = bar(Math.max(6, Math.min(30, Math.round(columns / 6))), ratio)
    const running = runs.filter(run => run.status === 'running').length
    const count = runs.length + plannedOf(flow, runs).length
    const teamLabel = running > 0 ? `Team ${running}/${count}` : `Team ×${count}`

    let below = null
    try {
      const rest = await next(e)
      if (rest && rest.type !== 'engine') below = rest
    } catch {
      // Another mod's band failed; show ours alone.
    }

    const row = (
      <Box gap={1}>
        <Box width={Math.max(14, Math.min(flow.title.length + 3, 40, Math.round(columns / 3)))} flexShrink={0}>
          <Text color={color}>● </Text>
          <Text wrap="truncate-end">{flow.title}</Text>
        </Box>
        {flow.tier !== '' && <Text dimColor>{TIER_WORDS[flow.tier]}</Text>}
        <Text color={color}>{`${track.filled}${track.empty}`}</Text>
        <Text bold>{flowLabel(flow)}</Text>
        <Text dimColor>{`${Math.round(ratio * 100)}%`}</Text>
        <Button key="team" label={teamLabel} plain onPress={() => togglePane($)} />
        <Button key="dismiss" label="✕" plain role="dismiss" onPress={() => update($, flowAtom, () => null)} />
      </Box>
    )

    if (below === null) return row

    return (
      <Box flexDirection="column">
        {row}
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const flow = await read($, flowAtom)
    const runs = await read($, agentsAtom)
    const lead = await read($, leadAtom)
    const panel = await read($, panelAtom)
    const now = await read($, nowAtom)
    const { Box, Text, Button } = $.ui.resolve(e)

    const running = runs.filter(run => run.status === 'running').reverse()
    const finished = runs.filter(run => run.status !== 'running').reverse()
    const planned = plannedOf(flow, runs)
    const team = runs.reduce((sum, run) => ({ tokens: sum.tokens + run.tokens, costUsd: sum.costUsd + run.costUsd }), {
      tokens: 0,
      costUsd: 0,
    })
    const columns = e.props.bodyColumns

    const agentRow = (run: AgentRun) => {
      const roleColor = colorOf(run.type)
      const glyph = run.status === 'running' ? '●' : run.status === 'done' ? '✓' : '✗'
      const glyphColor = run.status === 'running' ? roleColor : run.status === 'done' ? GOOD : BAD
      const width = Math.max(8, Math.min(16, Math.round(columns / 4)))
      const hasSteps = run.stepTotal !== undefined && run.stepTotal > 0
      const stepRatio = hasSteps ? (run.stepDone ?? 0) / (run.stepTotal ?? 1) : 0
      const track = bar(width, run.status === 'done' ? 1 : stepRatio)
      const barColor = run.status === 'done' ? GOOD : run.status === 'failed' ? BAD : roleColor
      const lit = run.status === 'done' || hasSteps
      const elapsed = Math.max(run.endedAt ?? now, run.startedAt) - run.startedAt
      const steps = hasSteps ? `${run.stepDone ?? 0}/${run.stepTotal}${run.stepNote ? ` ${run.stepNote}` : ''} · ` : ''

      return (
        <Box key={run.id} flexDirection="column" marginBottom={1}>
          <Text>
            <Text color={glyphColor}>{glyph} </Text>
            <Text bold>{run.description}</Text>
          </Text>
          <Text>
            {'  '}
            <Text color={roleColor}>{run.type}</Text>
            <Text dimColor>{` · ${showModel(run.model)}`}</Text>
          </Text>
          <Text>
            {'  '}
            {lit ? <Text color={barColor}>{track.filled}</Text> : null}
            <Text dimColor>{lit ? track.empty : `${track.filled}${track.empty}`}</Text>
            <Text dimColor>
              {` ${steps}${showTokens(run.tokens)} tok · ≈${showCost(run.costUsd)} · ${showClock(elapsed)}`}
            </Text>
          </Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {flow !== null && (
          <Text bold>
            {`${flow.title}${flow.tier !== '' ? ` · ${TIER_WORDS[flow.tier]}` : ''} · ${flowLabel(flow)}`}
          </Text>
        )}
        <Text dimColor>
          {`Lead ${showModel(lead.model)}: ${showTokens(lead.tokens)} tok ≈${showCost(lead.costUsd)} · Team: ${showTokens(team.tokens)} tok ≈${showCost(team.costUsd)}`}
        </Text>
        <Box height={1} />
        {runs.length === 0 && planned.length === 0 && <Text>No subagents yet.</Text>}
        {running.length > 0 && <Text dimColor>{`Running · ${running.length}`}</Text>}
        {running.map(agentRow)}
        {finished.length > 0 && (
          <Button
            key="done"
            plain
            label={`${panel.isDoneCollapsed ? '▸' : '▾'} Finished · ${finished.length}`}
            onPress={() => update($, panelAtom, p => ({ ...p, isDoneCollapsed: !p.isDoneCollapsed }))}
          />
        )}
        {!panel.isDoneCollapsed && finished.map(agentRow)}
        {planned.length > 0 && <Text dimColor>{`Planned · ${planned.length}`}</Text>}
        {planned.map((task, index) => (
          <Text>
            <Text color={colorOf(task.role)}>◷</Text>
            {` ${index + 1}. ${task.title} · ${task.role}`}
          </Text>
        ))}
      </Box>
    )
  })
}

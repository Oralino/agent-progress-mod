import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { assignColor, colorOf } from '../hooks/register'

const BAND = {
  plugin: 'team-progress',
  component: 'AbovePrompt',
  props: { hasSurvey: false, bodyColumns: 100 },
} as const

const PANE = {
  plugin: 'team-progress',
  component: 'Pane',
  requestId: 'team-progress',
  props: {
    title: 'Team',
    isFocused: false,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

function engine(on: Parameters<TestBody>[1]) {
  on('tool.register', (_, e) => ({ value: { tool: e.name } }))
  on('command.register', () => ({ value: { command: 'team' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: 1_000 }))
}

test('a worker gets the step line in its brief and shows its steps', async ($, on) => {
  engine(on)
  let prompt = ''
  on('agent.spawn', (_, e) => {
    prompt = e.prompt
    return { model: 'claude-sonnet-5-5', agentId: 'w1' }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({ prompt: 'Do the thing', description: 'Add retry', subagentType: 'engineer' } as never)
  expect(prompt).toContain('mcp__team-progress__step')
  await $.tool.call({ tool: 'mcp__team-progress__step', done: 2, total: 5, note: 'tests', agentId: 'w1' } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' } as never)
  expect((await ui.find({ type: 'Text', text: /2\/5 tests/ }))?.text).toContain('2/5 tests')
  expect((await ui.find({ type: 'Text', text: /Sonnet 5\.5/ }))?.text).toContain('engineer')
  await ui.unmount()
})

test('any working agent gets the step line; quick lookup agents do not', async ($, on) => {
  engine(on)
  const prompts: Record<string, string> = {}
  on('agent.spawn', (_, e) => {
    prompts[e.subagentType] = e.prompt
    return { model: 'claude-opus-5-5', agentId: e.subagentType }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({ prompt: 'Build it', description: 'Build API', subagentType: 'general-purpose' } as never)
  await $.agent.spawn({ prompt: 'Find it', description: 'Find files', subagentType: 'Explore' } as never)
  expect(prompts['general-purpose']).toContain('mcp__team-progress__step')
  expect(prompts.Explore).toBe('Find it')
})

test('the lead learns when to report from the system prompt', async ($, on) => {
  engine(on)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' }] }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const { sections } = await $.prompt.compose({
    model: 'claude-opus-5-5',
    promptModel: 'claude-opus-5-5',
    surfaces: ['desktop'],
    tools: [],
    outputStyle: null,
    traits: [],
  } as never)
  const guide = sections.find(s => s.id === 'team-progress:guide')
  expect(guide?.scope).toBe('session')
  expect(guide?.text).toContain('mcp__team-progress__progress')
})

test('a planned task can name any agent type', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({
    tool: 'mcp__team-progress__progress',
    title: 'Ship it',
    tasks: [{ title: 'Write docs', role: 'my-plugin:docs-writer' }],
  } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' } as never)
  expect((await ui.find({ type: 'Text', text: /Write docs/ }))?.text).toContain('docs-writer')
  await ui.unmount()
})

test('built-in and team agent types have fixed, different colors', () => {
  const fixed = ['engineer', 'senior-engineer', 'code-reviewer', 'qa-checker', 'design-advisor', 'fork', 'Explore', 'general-purpose', 'Plan', 'claude-code-guide', 'statusline-setup']
  const colors = fixed.map(t => colorOf(t, {}))
  expect(new Set(colors).size).toBe(fixed.length)
  expect(colorOf('Plan', {})).not.toBe(colorOf('claude-code-guide', {}))
  expect(colorOf('engineer', {})).toBe('#378ADD')
})

test('other agent types each get a color no one else has, and keep it', () => {
  let given: Record<string, string> = {}
  const types = Array.from({ length: 40 }, (_, i) => `custom-${i}`)
  for (const t of types) given = assignColor(given, t)
  const fixed = ['engineer', 'Plan', 'general-purpose', 'claude-code-guide', 'Explore'].map(t => colorOf(t, {}))
  const custom = types.map(t => colorOf(t, given))
  expect(new Set(custom).size).toBe(types.length)
  expect(custom.some(c => fixed.includes(c))).toBe(false)
  expect(assignColor(given, 'custom-3')).toBe(given)
  expect(assignColor(given, 'Plan')).toBe(given)
})

test('a color given in an earlier session comes back and new ones are saved', async ($, on) => {
  engine(on)
  let saved: unknown
  on('store.get', () => ({ value: { 'docs-writer': '#123456' } }))
  on('store.set', (_, e) => {
    saved = e.value
    return { value: undefined }
  })
  on('agent.spawn', (_, e) => ({ model: 'claude-opus-5-5', agentId: e.subagentType }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({ prompt: 'Write', description: 'Docs', subagentType: 'docs-writer' } as never)
  await $.agent.spawn({ prompt: 'Test', description: 'Tests', subagentType: 'test-runner' } as never)
  const map = saved as Record<string, string>
  expect(map['docs-writer']).toBe('#123456')
  expect(map['test-runner']).toBeDefined()
  expect(map['test-runner']).not.toBe('#123456')
})

test('the band shows the lead task, tier and phase on every surface', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({
    tool: 'mcp__team-progress__progress',
    title: 'Fix login bug',
    tier: 'hard',
    phase: 'build',
    tasks: [
      { title: 'Add retry', role: 'engineer' },
      { title: 'Review retry', role: 'code-reviewer' },
    ],
    done: 1,
  } as never)

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface } as never)
    expect((await ui.find({ type: 'Text', text: /Build 1\/2/ }))?.text).toBe('Build 1/2')
    expect((await ui.find({ type: 'Text', text: /^Hard$/ }))?.text).toBe('Hard')
    expect((await ui.find({ type: 'Text', text: /50%/ }))?.text).toBe('50%')
    await ui.unmount()
  }
})

test('a subagent call to progress changes nothing', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__team-progress__progress', title: 'Real task', phase: 'plan' } as never)
  await $.tool.call({ tool: 'mcp__team-progress__progress', title: 'Hijack', agentId: 'a1' } as never)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  expect(await ui.find({ type: 'Text', text: /Hijack/ })).toBe(undefined)
  expect((await ui.find({ type: 'Text', text: /^Plan$/ }))?.text).toBe('Plan')
  await ui.unmount()
})

test('the panel lists planned tasks and says when no subagents ran', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const empty = await $.ui.mount({ ...PANE, surface: 'terminal' } as never)
  expect((await empty.find({ type: 'Text', text: /No subagents/ }))?.text).toBe('No subagents yet.')
  await empty.unmount()

  await $.tool.call({
    tool: 'mcp__team-progress__progress',
    title: 'Ship feature',
    tasks: [{ title: 'Build API', role: 'engineer' }, { title: 'Wire UI', role: 'lead' }],
  } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' } as never)
  expect((await ui.find({ type: 'Text', text: /Planned/ }))?.text).toBe('Planned · 1')
  expect(await ui.find({ type: 'Text', text: /Wire UI/ })).toBe(undefined)
  await ui.unmount()
})

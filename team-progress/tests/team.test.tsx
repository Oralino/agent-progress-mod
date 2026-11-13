import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

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

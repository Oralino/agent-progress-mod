export type Phase = 'triage' | 'plan' | 'build' | 'review' | 'qa' | 'commit'

export type Tier = 'trivial' | 'standard' | 'hard' | 'very-hard'

export type PlannedTask = {
  title: string
  role: string
}

export type Flow = {
  title: string
  tier: Tier | ''
  phase: Phase
  total: number
  done: number
  isFinished: boolean
  tasks: PlannedTask[]
}

export type AgentStatus = 'running' | 'done' | 'failed'

export type AgentRun = {
  id: string
  agentId?: string
  type: string
  description: string
  model: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
  contextTokens: number
  tokens: number
  costUsd: number
  requests: number
  /** Self-reported by the worker through the `step` tool. */
  stepDone?: number
  stepTotal?: number
  stepNote?: string
}

/** The main session's own usage since the session started. */
export type Lead = {
  model: string
  tokens: number
  costUsd: number
}

export type Panel = {
  isDoneCollapsed: boolean
  autoOpenedFor: string
}

declare module 'claude-code' {
  interface PluginState {
    'team-progress': {
      flow: Shaped<Flow | null>
      agents: Shaped<AgentRun[]>
      lead: Shaped<Lead>
      panel: Shaped<Panel>
      now: number
      /** Agent type -> color, for types without a fixed color; mirrored to $.store. */
      colors: Shaped<Record<string, string>>
    }
  }
}

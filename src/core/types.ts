export type ProviderId = 'codex' | 'claude-code' | 'deepseek' | 'kimi'

export type StepKind = 'prompt' | 'tool' | 'result' | 'decision'

export type StepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped'

export interface WorkflowStep {
  id: string
  title: string
  kind: StepKind
  provider: ProviderId
  tool?: string
  input: string
  output: string
  status: StepStatus
}

export interface Workflow {
  id: string
  title: string
  provider: ProviderId
  signature: '王子'
  version: '0.3.0' | '0.4.0'
  createdAt: string
  steps: WorkflowStep[]
  execution?: RunEvent[]
}

export interface AnalyzeResult {
  provider: ProviderId
  workflow: Workflow
  warnings: string[]
  summary: string
}

export interface TakeoverPlan {
  workflowId: string
  provider: ProviderId
  fromStepId: string
  history: WorkflowStep[]
  steps: WorkflowStep[]
  handoffPrompt: string
}

export type RunEvent =
  | { type: 'run.started'; runId: string; stepCount: number; fromStepId: string }
  | { type: 'step.started'; stepId: string; index: number; title: string }
  | { type: 'step.log'; stepId: string; message: string }
  | { type: 'step.finished'; stepId: string; status: 'succeeded' | 'failed' }
  | { type: 'run.finished'; status: 'succeeded' | 'failed'; runId: string }

export interface RunSnapshot {
  runId: string | null
  status: 'idle' | 'running' | 'succeeded' | 'failed'
  stepStatus: Record<string, StepStatus>
  logs: Array<{ stepId: string; message: string }>
}

export interface ShareDocument {
  format: 'wangzi-share'
  version: '0.3.0' | '0.4.0'
  signature: '王子'
  workflow: Workflow
  checksum: string
}

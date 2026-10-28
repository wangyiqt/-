import type { RunEvent, RunSnapshot, StepStatus, Workflow, WorkflowStep } from './types.ts'

export interface RunOptions {
  fromStepId?: string
  delayMs?: number
  runId?: string
  failStepIds?: string[]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function clip(text: string, max = 180): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1)}…`
}

function logFor(step: WorkflowStep): string {
  if (step.kind === 'tool') {
    const detail = clip(step.input)
    return `回放工具 ${step.tool ?? 'tool'}${detail ? `：${detail}` : ''}。这一步只在时间线里展示，不会在你的电脑上执行命令。`
  }
  if (step.kind === 'prompt') return `任务：${clip(step.input)}`
  if (step.kind === 'decision') return `判断：${clip(step.input || step.output)}`
  return `结果：${clip(step.output || step.input)}`
}

export function createSnapshot(workflow: Workflow, fromStepId?: string): RunSnapshot {
  const start = fromStepId ? workflow.steps.findIndex((step) => step.id === fromStepId) : 0
  const stepStatus: Record<string, StepStatus> = {}
  workflow.steps.forEach((step, index) => {
    stepStatus[step.id] = start > 0 && index < start ? 'succeeded' : 'pending'
  })
  return { runId: null, status: 'idle', stepStatus, logs: [] }
}

export function applyEvent(snapshot: RunSnapshot, event: RunEvent): RunSnapshot {
  switch (event.type) {
    case 'run.started':
      return { ...snapshot, runId: event.runId, status: 'running' }
    case 'step.started':
      return {
        ...snapshot,
        status: 'running',
        stepStatus: { ...snapshot.stepStatus, [event.stepId]: 'running' },
      }
    case 'step.log':
      return { ...snapshot, logs: [...snapshot.logs, { stepId: event.stepId, message: event.message }] }
    case 'step.finished':
      return { ...snapshot, stepStatus: { ...snapshot.stepStatus, [event.stepId]: event.status } }
    case 'run.finished':
      return { ...snapshot, status: event.status, runId: event.runId }
  }
}

export async function* runWorkflow(workflow: Workflow, options: RunOptions = {}): AsyncGenerator<RunEvent> {
  const start = options.fromStepId ? workflow.steps.findIndex((step) => step.id === options.fromStepId) : 0
  if (options.fromStepId && start < 0) throw new Error('找不到这一步')
  const steps = workflow.steps.slice(Math.max(start, 0))
  const runId = options.runId ?? `run-${workflow.id}`
  const fromStepId = steps[0]?.id ?? options.fromStepId ?? ''
  yield { type: 'run.started', runId, stepCount: steps.length, fromStepId }
  for (let index = 0; index < steps.length; index += 1) {
    if (options.delayMs) await sleep(options.delayMs)
    const step = steps[index]
    yield { type: 'step.started', stepId: step.id, index, title: step.title }
    const failed = options.failStepIds?.includes(step.id) ?? false
    yield { type: 'step.log', stepId: step.id, message: logFor(step) }
    yield { type: 'step.finished', stepId: step.id, status: failed ? 'failed' : 'succeeded' }
    if (failed) {
      yield { type: 'run.finished', status: 'failed', runId }
      return
    }
  }
  yield { type: 'run.finished', status: 'succeeded', runId }
}

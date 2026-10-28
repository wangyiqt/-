import { getProvider } from './providers.ts'
import type { TakeoverPlan, Workflow, WorkflowStep } from './types.ts'

function pendingCopy(step: WorkflowStep): WorkflowStep {
  return { ...step, status: 'pending' }
}

export function buildHandoffPrompt(workflow: Workflow, steps: WorkflowStep[]): string {
  const provider = getProvider(workflow.provider).label
  const lines = [
    `你正在接手一条由「王子」记录的 ${provider} 工作流。`,
    `标题：${workflow.title}`,
    '请从下面的步骤继续，不要重复已经完成的部分。',
    ...steps.map((step, index) => {
      const tool = step.tool ? `（工具 ${step.tool}）` : ''
      const detail = step.input || step.output
      return `${index + 1}. [${step.kind}] ${step.title}${tool}${detail ? `：${detail}` : ''}`
    }),
    '— 王子',
  ]
  return lines.join('\n')
}

export function planTakeover(workflow: Workflow, fromStepId: string): TakeoverPlan {
  if (workflow.steps.length === 0) throw new Error('没有可以接管的步骤')
  const index = workflow.steps.findIndex((step) => step.id === fromStepId)
  if (index < 0) throw new Error('找不到这一步')
  const history = workflow.steps.slice(0, index)
  const steps = workflow.steps.slice(index).map(pendingCopy)
  return {
    workflowId: workflow.id,
    provider: workflow.provider,
    fromStepId,
    history,
    steps,
    handoffPrompt: buildHandoffPrompt(workflow, steps),
  }
}

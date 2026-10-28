import { APP_SIGNATURE, APP_VERSION } from './brand.ts'
import { getProvider, isProviderId } from './providers.ts'
import { sha256 } from './sha256.ts'
import type { AnalyzeResult, ProviderId, StepKind, Workflow, WorkflowStep } from './types.ts'

interface AnalyzeOptions {
  provider?: ProviderId
  now?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value == null) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1)}…`
}

function textContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return asString(content)
  return content
    .map((part) => {
      if (typeof part === 'string') return part
      if (!isRecord(part)) return ''
      if (typeof part.text === 'string') return part.text
      if (typeof part.content === 'string') return part.content
      if (part.type === 'tool_use' || part.type === 'tool_result') return ''
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function readRecords(input: string, warnings: string[]): unknown[] {
  const trimmed = input.replace(/^\uFEFF/, '').trim()
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (Array.isArray(parsed)) return parsed
    if (isRecord(parsed) && Array.isArray(parsed.messages) && !parsed.type) return parsed.messages
    return [parsed]
  } catch {
    const records: unknown[] = []
    const lines = trimmed.split(/\r?\n/)
    lines.forEach((line, index) => {
      const text = line.trim()
      if (!text) return
      try {
        records.push(JSON.parse(text) as unknown)
      } catch {
        warnings.push(`已跳过无法解析的第 ${index + 1} 行`)
      }
    })
    return records
  }
}

function detectProvider(records: unknown[]): ProviderId {
  const objects = records.filter(isRecord)
  if (objects.some((record) => record.provider === 'kimi' || String(record.type ?? '').startsWith('kimi.'))) {
    return 'kimi'
  }
  if (objects.some((record) => ['session_meta', 'response_item', 'event_msg'].includes(String(record.type)))) {
    return 'codex'
  }
  if (
    objects.some((record) => {
      const message = isRecord(record.message) ? record.message : record
      const content = message.content
      return Array.isArray(content) && content.some((part) => isRecord(part) && part.type === 'tool_use')
    })
  ) {
    return 'claude-code'
  }
  if (objects.some((record) => record.type === 'user' || record.type === 'assistant')) return 'claude-code'
  if (objects.some((record) => record.role === 'tool' || Array.isArray(record.tool_calls) || isRecord(record.message) && Array.isArray((record.message as Record<string, unknown>).tool_calls))) {
    return 'deepseek'
  }
  if (objects.some((record) => typeof record.role === 'string')) return 'deepseek'
  throw new Error('无法判断这条记录来自哪一个 Agent')
}

function makeStep(
  steps: WorkflowStep[],
  provider: ProviderId,
  kind: StepKind,
  input: string,
  output = '',
  tool?: string,
): void {
  const basis = input || output || tool || kind
  if (!basis.trim()) return
  const titleSource = kind === 'tool' ? tool || input : input || output || tool || kind
  steps.push({
    id: `s${steps.length + 1}`,
    title: clip(titleSource, 32) || '未命名步骤',
    kind,
    provider,
    ...(tool ? { tool } : {}),
    input,
    output,
    status: 'succeeded',
  })
}

function parseChat(record: Record<string, unknown>, provider: ProviderId, steps: WorkflowStep[]): void {
  const message = isRecord(record.message) ? record.message : record
  const role = String(message.role ?? record.type ?? '')
  const content = message.content
  if (role === 'user' || record.type === 'user') {
    const text = textContent(content)
    if (text) makeStep(steps, provider, 'prompt', text)
    if (Array.isArray(content)) {
      for (const part of content) {
        if (!isRecord(part) || part.type !== 'tool_result') continue
        makeStep(steps, provider, 'result', '', asString(part.content ?? part.output))
      }
    }
    return
  }
  if (role === 'tool') {
    makeStep(steps, provider, 'result', '', asString(content))
    return
  }
  if (role === 'assistant' || record.type === 'assistant') {
    const text = textContent(content)
    if (text) makeStep(steps, provider, 'result', text)
    if (Array.isArray(content)) {
      for (const part of content) {
        if (!isRecord(part) || part.type !== 'tool_use') continue
        makeStep(steps, provider, 'tool', asString(part.input), '', asString(part.name))
      }
    }
    const calls = message.tool_calls ?? record.tool_calls
    if (Array.isArray(calls)) {
      for (const call of calls) {
        if (!isRecord(call)) continue
        const fn = isRecord(call.function) ? call.function : call
        makeStep(steps, provider, 'tool', asString(fn.arguments ?? fn.input), '', asString(fn.name))
      }
    }
  }
}

function parseCodex(record: Record<string, unknown>, steps: WorkflowStep[]): void {
  const payload = isRecord(record.payload) ? record.payload : record
  const type = String(payload.type ?? record.type ?? '')
  if (type === 'session_meta') return
  if (type === 'user_message') {
    makeStep(steps, 'codex', 'prompt', asString(payload.message ?? payload.text))
    return
  }
  if (type === 'agent_message') {
    makeStep(steps, 'codex', 'result', asString(payload.message ?? payload.text))
    return
  }
  if (type === 'function_call') {
    makeStep(steps, 'codex', 'tool', asString(payload.arguments ?? payload.input), '', asString(payload.name))
    return
  }
  if (type === 'function_call_output') {
    makeStep(steps, 'codex', 'result', '', asString(payload.output ?? payload.content))
    return
  }
  if (type === 'message') {
    const role = String(payload.role ?? '')
    const text = textContent(payload.content ?? payload.message)
    if (role === 'user') makeStep(steps, 'codex', 'prompt', text)
    else if (text) makeStep(steps, 'codex', 'result', text)
  }
}

function parseKimi(record: Record<string, unknown>, steps: WorkflowStep[], title: { value?: string }): void {
  const type = String(record.type ?? '')
  if (type === 'kimi.session') {
    if (typeof record.title === 'string' && record.title.trim()) title.value = record.title.trim()
    return
  }
  if (type === 'kimi.step') {
    const action = isRecord(record.action) ? record.action : undefined
    const thought = asString(record.thought ?? record.name)
    const tool = action ? asString(action.tool ?? action.name) : ''
    const input = action ? asString(action.input ?? action.arguments) : thought
    if (tool) makeStep(steps, 'kimi', 'tool', input || thought, '', tool)
    else makeStep(steps, 'kimi', 'decision', thought)
    return
  }
  if (type === 'kimi.message' || typeof record.role === 'string') parseChat(record, 'kimi', steps)
}

function sessionTitle(records: unknown[]): string | undefined {
  for (const record of records) {
    if (!isRecord(record)) continue
    if (record.type === 'kimi.session' && typeof record.title === 'string' && record.title.trim()) return record.title.trim()
    if (typeof record.title === 'string' && record.provider === 'kimi' && record.title.trim()) return record.title.trim()
  }
  return undefined
}

function parseSteps(provider: ProviderId, records: unknown[]): { steps: WorkflowStep[]; title?: string } {
  const steps: WorkflowStep[] = []
  const title = { value: sessionTitle(records) }
  for (const record of records) {
    if (!isRecord(record)) continue
    if (provider === 'codex') parseCodex(record, steps)
    else if (provider === 'kimi') parseKimi(record, steps, title)
    else parseChat(record, provider, steps)
  }
  return { steps, title: title.value }
}

export function summarize(workflow: Workflow): string {
  const tools = [...new Set(workflow.steps.map((step) => step.tool).filter((tool): tool is string => Boolean(tool)))]
  return `${getProvider(workflow.provider).label} · ${workflow.steps.length} 步 · 工具 ${tools.length ? tools.join('、') : '无'}`
}

export function analyzeTranscript(input: string, options: AnalyzeOptions = {}): AnalyzeResult {
  if (!input || !input.trim()) throw new Error('请粘贴工作流记录')
  const warnings: string[] = []
  const records = readRecords(input, warnings)
  if (records.length === 0) throw new Error('没有识别到可分析的步骤')
  const provider = options.provider ?? detectProvider(records)
  if (!isProviderId(provider)) throw new Error(`未知的 Agent：${provider}`)
  const parsed = parseSteps(provider, records)
  if (parsed.steps.length === 0) throw new Error('没有识别到可分析的步骤')
  const firstPrompt = parsed.steps.find((step) => step.kind === 'prompt')?.input
  const title = clip(parsed.title || firstPrompt || '未命名工作流', 24)
  const workflow: Workflow = {
    id: `wf-${sha256(`${provider}\n${input.trim()}`).slice(0, 12)}`,
    title,
    provider,
    signature: APP_SIGNATURE,
    version: APP_VERSION,
    createdAt: options.now ?? new Date().toISOString(),
    steps: parsed.steps,
  }
  return { provider, workflow, warnings, summary: summarize(workflow) }
}

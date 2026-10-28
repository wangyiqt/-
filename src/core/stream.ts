export interface AgentToolCall {
  name: string
  command: string
  input: string
}

export interface AgentChunk {
  logs: string[]
  toolCalls: AgentToolCall[]
  finished: boolean
}

const EMPTY: AgentChunk = { logs: [], toolCalls: [], finished: false }

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value == null) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function commandFrom(input: unknown): string {
  if (typeof input === 'string') return input
  if (!isRecord(input)) return textOf(input)
  return textOf(input.command ?? input.cmd ?? input.arguments ?? input.input ?? input)
}

function toolCall(name: unknown, input: unknown): AgentToolCall {
  const tool = textOf(name) || 'tool'
  const command = commandFrom(input)
  return { name: tool, command, input: command }
}

export function parseAgentLine(line: string): AgentChunk {
  const trimmed = line.trim()
  if (!trimmed) return EMPTY
  let record: unknown
  try {
    record = JSON.parse(trimmed) as unknown
  } catch {
    return { logs: [trimmed], toolCalls: [], finished: false }
  }
  if (!isRecord(record)) return EMPTY
  const logs: string[] = []
  const toolCalls: AgentToolCall[] = []
  const type = String(record.type ?? '')
  if (type === 'result' || type === 'turn.completed' || record.done === true) {
    const text = textOf(record.result ?? record.message)
    if (text) logs.push(text)
    return { logs, toolCalls, finished: true }
  }
  const message = isRecord(record.message) ? record.message : record
  const content = message.content ?? record.content
  if (typeof content === 'string' && content.trim()) logs.push(content)
  if (Array.isArray(content)) {
    for (const part of content) {
      if (!isRecord(part)) continue
      if (part.type === 'text' && typeof part.text === 'string') logs.push(part.text)
      if (part.type === 'tool_use') toolCalls.push(toolCall(part.name, part.input))
      if (part.type === 'tool_result') {
        const output = textOf(part.content ?? part.output)
        if (output) logs.push(output)
      }
    }
  }
  const payload = isRecord(record.payload) ? record.payload : undefined
  if (payload?.type === 'function_call' || type === 'function_call') {
    const source = payload ?? record
    toolCalls.push(toolCall(source.name, source.arguments ?? source.input))
  }
  if (payload?.type === 'agent_message' || payload?.type === 'user_message') {
    const text = textOf(payload.message)
    if (text) logs.push(text)
  }
  const delta = isRecord(record.delta) ? record.delta : undefined
  if (delta && typeof delta.text === 'string') logs.push(delta.text)
  return { logs, toolCalls, finished: false }
}

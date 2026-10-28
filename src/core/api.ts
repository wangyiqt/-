export type ModelProvider = 'deepseek' | 'kimi'

export interface ModelEndpoint {
  url: string
  model: string
}

export interface ToolCallDraft {
  index: number
  id: string
  name: string
  arguments: string
}

export interface SsePiece {
  content: string
  toolDeltas: Array<{ index: number; id?: string; name?: string; arguments?: string }>
  done: boolean
}

const ENDPOINTS: Record<ModelProvider, ModelEndpoint> = {
  deepseek: { url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' },
  kimi: { url: 'https://api.moonshot.cn/v1/chat/completions', model: 'kimi-latest' },
}

export function modelEndpoint(provider: ModelProvider): ModelEndpoint {
  return ENDPOINTS[provider]
}

export function buildChatBody(provider: ModelProvider, messages: Array<{ role: string; content: string }>): Record<string, unknown> {
  const endpoint = modelEndpoint(provider)
  return { model: endpoint.model, messages, stream: true }
}

export function applyToolDelta(tools: ToolCallDraft[], delta: { index: number; id?: string; name?: string; arguments?: string }): ToolCallDraft[] {
  const next = tools.map((tool) => ({ ...tool }))
  let found = next.find((tool) => tool.index === delta.index)
  if (!found) {
    found = { index: delta.index, id: delta.id ?? '', name: delta.name ?? '', arguments: '' }
    next.push(found)
  }
  if (delta.id) found.id = delta.id
  if (delta.name) found.name = delta.name
  if (delta.arguments) found.arguments += delta.arguments
  return next
}

function pieceFromData(data: string): SsePiece | null {
  if (data === '[DONE]') return { content: '', toolDeltas: [], done: true }
  let parsed: unknown
  try {
    parsed = JSON.parse(data) as unknown
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const choice = (parsed as { choices?: Array<{ delta?: { content?: string; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> } }> }).choices?.[0]
  const delta = choice?.delta
  const toolDeltas = (delta?.tool_calls ?? []).map((call) => ({
    index: call.index ?? 0,
    id: call.id,
    name: call.function?.name,
    arguments: call.function?.arguments,
  }))
  return { content: delta?.content ?? '', toolDeltas, done: false }
}

export function pushSse(buffer: string, chunk: string): { pieces: SsePiece[]; rest: string } {
  const text = buffer + chunk
  const parts = text.split(/\n\n/)
  const rest = parts.pop() ?? ''
  const pieces: SsePiece[] = []
  for (const part of parts) {
    const data = part
      .split(/\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('')
    if (!data) continue
    const piece = pieceFromData(data)
    if (piece) pieces.push(piece)
  }
  return { pieces, rest }
}

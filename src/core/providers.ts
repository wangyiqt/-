import type { ProviderId } from './types.ts'

export interface ProviderInfo {
  id: ProviderId
  label: string
  mark: string
  cli: string
}

export const PROVIDERS: readonly ProviderInfo[] = [
  { id: 'codex', label: 'Codex', mark: 'CX', cli: 'codex' },
  { id: 'claude-code', label: 'Claude Code', mark: 'CC', cli: 'claude' },
  { id: 'deepseek', label: 'DeepSeek', mark: 'DS', cli: 'deepseek' },
  { id: 'kimi', label: 'Kimi', mark: 'KM', cli: 'kimi' },
] as const

const BY_ID = new Map(PROVIDERS.map((provider) => [provider.id, provider]))

export function isProviderId(value: string): value is ProviderId {
  return BY_ID.has(value as ProviderId)
}

export function getProvider(id: string): ProviderInfo {
  const found = BY_ID.get(id as ProviderId)
  if (!found) throw new Error(`未知的 Agent：${id}`)
  return found
}

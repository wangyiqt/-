import { analyzeTranscript } from './analyze.ts'
import type { ProviderId } from './types.ts'

export interface SessionSummary {
  id: string
  provider: 'claude-code' | 'codex'
  title: string
  filePath: string
  cwd: string
  updatedAt: string
  resumeId: string
}

export function sessionRoots(home: string): { claude: string; codex: string } {
  const base = home.replace(/[\\/]+$/, '')
  const sep = home.includes('\\') ? '\\' : '/'
  return {
    claude: [base, '.claude', 'projects'].join(sep),
    codex: [base, '.codex', 'sessions'].join(sep),
  }
}

export function providerFromSessionPath(filePath: string): 'claude-code' | 'codex' | null {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  if (normalized.includes('/.claude/')) return 'claude-code'
  if (normalized.includes('/.codex/')) return 'codex'
  return null
}

function fileName(filePath: string): string {
  const parts = filePath.split(/[\\/]/)
  return parts.at(-1) ?? filePath
}

function findCwd(text: string): string {
  for (const line of text.split(/\r?\n/).slice(0, 40)) {
    try {
      const value = JSON.parse(line) as { cwd?: unknown; payload?: { cwd?: unknown } }
      const cwd = value.cwd ?? value.payload?.cwd
      if (typeof cwd === 'string' && cwd.trim()) return cwd
    } catch {
      continue
    }
  }
  return ''
}

function findResumeId(text: string, fallback: string): string {
  for (const line of text.split(/\r?\n/).slice(0, 40)) {
    try {
      const value = JSON.parse(line) as { id?: unknown; session_id?: unknown; payload?: { id?: unknown } }
      const id = value.session_id ?? value.payload?.id ?? value.id
      if (typeof id === 'string' && id.trim()) return id
    } catch {
      continue
    }
  }
  return fallback.replace(/\.jsonl?$/i, '')
}

export function addedText(previous: string, next: string): string {
  if (next.startsWith(previous)) return next.slice(previous.length)
  return next
}

export function summarizeSession(filePath: string, text: string, updatedAt: string): SessionSummary | null {
  const provider = providerFromSessionPath(filePath)
  if (!provider) return null
  const forced: ProviderId = provider
  try {
    const result = analyzeTranscript(text, { provider: forced })
    const resumeId = findResumeId(text, fileName(filePath))
    return {
      id: resumeId,
      provider,
      title: result.workflow.title,
      filePath,
      cwd: findCwd(text),
      updatedAt,
      resumeId,
    }
  } catch {
    return null
  }
}

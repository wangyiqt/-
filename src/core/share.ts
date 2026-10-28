import { APP_SIGNATURE, APP_VERSION, SHARE_FORMAT, SHARE_VERSIONS } from './brand.ts'
import { sha256 } from './sha256.ts'
import type { RunEvent, ShareDocument, Workflow } from './types.ts'

const SECRET_KEYS = new Set([
  'api_key',
  'apikey',
  'apiKey',
  'token',
  'access_token',
  'secret',
  'authorization',
  'password',
])

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function redactString(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer ***')
    .replace(/"(api_key|apiKey|token|access_token|secret|password)"\s*:\s*"[^"]*"/g, '"$1":"***"')
}

function redact(value: unknown, key: string | null = null): unknown {
  if (typeof value === 'string') {
    const next = redactString(value)
    if (key && SECRET_KEYS.has(key) && next.length > 0) return '***'
    return next
  }
  if (Array.isArray(value)) return value.map((item) => redact(item))
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {}
    for (const [childKey, child] of Object.entries(value)) output[childKey] = redact(child, childKey)
    return output
  }
  return value
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
}

export function shareChecksum(workflow: Workflow): string {
  return sha256(canonicalJson(workflow))
}

export function exportShare(workflow: Workflow): ShareDocument {
  const redacted = redact(cloneJson(workflow)) as Workflow
  redacted.signature = APP_SIGNATURE
  redacted.version = APP_VERSION
  return {
    format: SHARE_FORMAT,
    version: APP_VERSION,
    signature: APP_SIGNATURE,
    workflow: redacted,
    checksum: shareChecksum(redacted),
  }
}

function isShareShape(value: unknown): value is ShareDocument {
  if (!value || typeof value !== 'object') return false
  const doc = value as Partial<ShareDocument>
  return doc.format === SHARE_FORMAT && doc.signature === APP_SIGNATURE && !!doc.version && (SHARE_VERSIONS as readonly string[]).includes(doc.version) && !!doc.workflow
}

export function importShare(input: ShareDocument | string): Workflow {
  let parsed: unknown = input
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input) as unknown
    } catch {
      throw new Error('这不是王子的分享文件')
    }
  }
  if (!isShareShape(parsed)) throw new Error('这不是王子的分享文件')
  if (parsed.checksum !== shareChecksum(parsed.workflow)) throw new Error('分享文件已被改动')
  return cloneJson(parsed.workflow)
}

export function attachRunLog(workflow: Workflow, events: RunEvent[]): Workflow {
  const execution = events.filter((event) => event.type === 'step.log' || event.type === 'step.finished' || event.type === 'run.finished')
  return { ...cloneJson(workflow), execution }
}

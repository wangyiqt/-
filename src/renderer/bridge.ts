export interface SessionSummary {
  id: string
  provider: 'claude-code' | 'codex'
  title: string
  filePath: string
  cwd: string
  updatedAt: string
  resumeId: string
}

export interface CliState {
  name: 'claude' | 'codex'
  installed: boolean
  bin: string
}

export interface RunRequest {
  provider: 'claude-code' | 'codex' | 'deepseek' | 'kimi'
  prompt: string
  cwd: string
  resumeId?: string
}

export interface RunEventMessage {
  type: 'log' | 'status' | 'confirm' | 'blocked' | 'exit' | 'error'
  text?: string
  status?: string
  command?: string
  code?: number
}

export interface WangziBridge {
  platform: string
  saveText: (defaultName: string, text: string) => Promise<string | null>
  openText: () => Promise<string | null>
  listSessions: () => Promise<SessionSummary[]>
  readSession: (filePath: string) => Promise<{ text: string; updatedAt: string }>
  cliStatus: () => Promise<{ claude: CliState; codex: CliState; platform: string }>
  pickFolder: () => Promise<string | null>
  startRun: (request: RunRequest) => Promise<boolean>
  controlRun: (action: string, text?: string) => Promise<string>
  secretStatus: () => Promise<{ deepseek: boolean; kimi: boolean; encryption: boolean }>
  saveSecret: (provider: 'deepseek' | 'kimi', value: string) => Promise<boolean>
  clearSecret: (provider: 'deepseek' | 'kimi') => Promise<boolean>
  onSessions: (callback: (sessions: SessionSummary[]) => void) => () => void
  onRunEvent: (callback: (event: RunEventMessage) => void) => () => void
}

export function getBridge(): WangziBridge | null {
  const host = window as Window & { wangzi?: WangziBridge }
  return host.wangzi ?? null
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', 'true')
    area.style.position = 'fixed'
    area.style.left = '-9999px'
    document.body.appendChild(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

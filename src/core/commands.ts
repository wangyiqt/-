export type CommandRisk = 'safe' | 'confirm' | 'blocked'

const BLOCKED = [
  /(^|[;&|]\s*)rm\s+(-[^\s]*\s+)*(\/|\/\*|~)(\s|$)/i,
  /\bmkfs(\.\w+)?\b/i,
  /\bdd\s+if=/i,
  /\b(shutdown|reboot|halt|poweroff)\b/i,
  /\bdiskpart\b/i,
  /\bformat\s+[a-z]:/i,
  /curl[^\n]*\|\s*(ba)?sh\b/i,
  /wget[^\n]*\|\s*(ba)?sh\b/i,
  /:\(\)\s*\{/,
  /\breg\s+delete\b/i,
  /\b(del|erase)\s+\/[sq].*\\/i,
  /\bRemove-Item\b.*-Recurse.*\\/i,
]

const SAFE = /^(git (status|diff|log|show)|ls|dir|pwd|cat|type|head|tail|npm test|npm run [\w:-]+|node -v|python3? --version)(\s|$)/i

function normalize(command: string): string {
  return command.replace(/\s+/g, ' ').trim()
}

export function classifyCommand(command: string): CommandRisk {
  const text = normalize(command)
  if (!text) return 'confirm'
  if (BLOCKED.some((pattern) => pattern.test(text))) return 'blocked'
  if (/[|&;`]|\$\(/.test(text)) return 'confirm'
  if (/\bsudo\b|\brm\b|\bchmod\b|\bchown\b|\bkill(all)?\b|\btaskkill\b|\bnpm\s+publish\b|\bgit\s+push\b.*--force|\bgit\s+reset\s+--hard|\bgit\s+clean\b|\bdocker\s+system\s+prune\b|\bRemove-Item\b/i.test(text)) {
    return 'confirm'
  }
  if (SAFE.test(text)) return 'safe'
  return 'confirm'
}

export function gateCommand(command: string, decision: 'allow' | 'deny' | 'auto' = 'auto'): 'run' | 'ask' | 'block' {
  const risk = classifyCommand(command)
  if (risk === 'blocked') return 'block'
  if (risk === 'confirm') return decision === 'allow' ? 'run' : 'ask'
  return 'run'
}

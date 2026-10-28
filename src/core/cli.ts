export type CliName = 'claude' | 'codex'

export interface CliLaunch {
  bin: CliName
  args: string[]
  cwd: string
}

function assertPrompt(prompt: string): string {
  const text = prompt.trim()
  if (!text) throw new Error('请先写下要做的事')
  return text
}

export function launchClaude(options: { prompt: string; cwd: string; resumeId?: string }): CliLaunch {
  const prompt = assertPrompt(options.prompt)
  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose']
  if (options.resumeId) args.unshift('--resume', options.resumeId)
  return { bin: 'claude', args, cwd: options.cwd }
}

export function launchCodex(options: { prompt: string; cwd: string; resumeId?: string }): CliLaunch {
  const prompt = assertPrompt(options.prompt)
  const args = options.resumeId
    ? ['exec', 'resume', '--json', '--sandbox', 'workspace-write', options.resumeId, prompt]
    : ['exec', '--json', '--sandbox', 'workspace-write', prompt]
  return { bin: 'codex', args, cwd: options.cwd }
}

export function launchAgent(provider: 'claude-code' | 'codex', options: { prompt: string; cwd: string; resumeId?: string }): CliLaunch {
  return provider === 'claude-code' ? launchClaude(options) : launchCodex(options)
}

export function installHint(bin: CliName): string {
  if (bin === 'claude') {
    return '这台电脑还不能运行 claude。请先安装 Claude Code，安装后打开终端，输入 claude，能出现对话就可以回到王子。'
  }
  return '这台电脑还不能运行 codex。请先安装 Codex 命令行，安装后打开终端，输入 codex，能出现对话就可以回到王子。'
}

export function candidateBins(name: CliName, platform: string, home: string): string[] {
  const sep = platform === 'win32' ? '\\' : '/'
  const names = platform === 'win32' ? [`${name}.cmd`, `${name}.exe`, name] : [name]
  const roots = platform === 'win32'
    ? [home + sep + 'AppData' + sep + 'Roaming' + sep + 'npm', home + sep + '.local' + sep + 'bin']
    : [home + sep + '.local' + sep + 'bin', '/usr/local/bin', '/opt/homebrew/bin']
  return roots.flatMap((root) => names.map((file) => `${root}${sep}${file}`))
}

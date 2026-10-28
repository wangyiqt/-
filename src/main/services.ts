import { app, BrowserWindow, dialog, ipcMain, safeStorage } from 'electron'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { applyToolDelta, buildChatBody, modelEndpoint, pushSse, type ModelProvider, type ToolCallDraft } from '../core/api.ts'
import { candidateBins, installHint, launchAgent, type CliName } from '../core/cli.ts'
import { gateCommand } from '../core/commands.ts'
import { initialControl, reduceControl, type ControlState } from '../core/control.ts'
import { sessionRoots, summarizeSession, type SessionSummary } from '../core/sessions.ts'
import { parseAgentLine } from '../core/stream.ts'

const MAX_FILES = 200
const MAX_BYTES = 1_500_000

type RunProvider = 'claude-code' | 'codex' | ModelProvider

interface StartRequest {
  provider: RunProvider
  prompt: string
  cwd: string
  resumeId?: string
}

interface RunEventMessage {
  type: 'log' | 'status' | 'confirm' | 'blocked' | 'exit' | 'error'
  text?: string
  status?: string
  command?: string
  code?: number
}

let child: ChildProcess | null = null
let control: ControlState = initialControl()
let active: StartRequest | null = null
let confirmWait: ((allowed: boolean) => void) | null = null
let watchers: fs.FSWatcher[] = []
let watchTimer: NodeJS.Timeout | null = null

function send(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload)
  }
}

function emitRun(message: RunEventMessage): void {
  send('run:event', message)
}

function redactLog(text: string): string {
  return text.replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***').replace(/Bearer\s+\S+/gi, 'Bearer ***')
}

function readCap(filePath: string): string {
  const stat = fs.statSync(filePath)
  const start = Math.max(0, stat.size - MAX_BYTES)
  const fd = fs.openSync(filePath, 'r')
  try {
    const buffer = Buffer.alloc(stat.size - start)
    fs.readSync(fd, buffer, 0, buffer.length, start)
    return buffer.toString('utf8')
  } finally {
    fs.closeSync(fd)
  }
}

function walk(root: string, found: SessionSummary[]): void {
  if (!fs.existsSync(root) || found.length >= MAX_FILES) return
  const stack = [root]
  while (stack.length > 0 && found.length < MAX_FILES) {
    const dir = stack.pop()
    if (!dir) break
    let entries: fs.Dirent[] = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        try {
          const stat = fs.statSync(full)
          const summary = summarizeSession(full, readCap(full), stat.mtime.toISOString())
          if (summary) found.push(summary)
        } catch {
          continue
        }
      }
    }
  }
}

function listSessions(): SessionSummary[] {
  const roots = sessionRoots(os.homedir())
  const found: SessionSummary[] = []
  walk(roots.claude, found)
  walk(roots.codex, found)
  return found.sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : -1))
}

function insideRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function allowedSession(filePath: string): boolean {
  const roots = sessionRoots(os.homedir())
  const resolved = path.resolve(filePath)
  return insideRoot(path.resolve(roots.claude), resolved) || insideRoot(path.resolve(roots.codex), resolved)
}

function detectCli(name: CliName): { name: CliName; installed: boolean; bin: string } {
  for (const candidate of candidateBins(name, process.platform, os.homedir())) {
    if (fs.existsSync(candidate)) return { name, installed: true, bin: candidate }
  }
  const finder = process.platform === 'win32' ? 'where' : 'which'
  const result = spawnSync(finder, [name], { encoding: 'utf8' })
  const found = result.status === 0 ? result.stdout.split(/\r?\n/).find((line) => line.trim()) : ''
  return { name, installed: Boolean(found), bin: found?.trim() || name }
}

function secretFile(): string {
  return path.join(app.getPath('userData'), 'secrets.json')
}

function readSecrets(): Partial<Record<ModelProvider, string>> {
  try {
    return JSON.parse(fs.readFileSync(secretFile(), 'utf8')) as Partial<Record<ModelProvider, string>>
  } catch {
    return {}
  }
}

function encryptionReady(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function loadSecret(provider: ModelProvider): string | null {
  const encoded = readSecrets()[provider]
  if (!encoded || !encryptionReady()) return null
  try {
    return safeStorage.decryptString(Buffer.from(encoded, 'base64'))
  } catch {
    return null
  }
}

function applyControl(action: Parameters<typeof reduceControl>[1]): void {
  control = reduceControl(control, action)
  emitRun({ type: 'status', status: control.status })
}

function signalGroup(signal: NodeJS.Signals): void {
  if (!child?.pid || process.platform === 'win32') return
  try {
    process.kill(-child.pid, signal)
  } catch {
    try {
      child.kill(signal)
    } catch {
      // The process already exited.
    }
  }
}

function stopChild(): void {
  if (!child) return
  if (process.platform === 'win32') child.kill()
  else signalGroup('SIGTERM')
  const current = child
  setTimeout(() => {
    if (current.exitCode === null) current.kill('SIGKILL')
  }, 1500)
}

function pauseChild(): void {
  signalGroup('SIGSTOP')
}

function resumeChild(): void {
  signalGroup('SIGCONT')
}

function handleLine(line: string): void {
  const chunk = parseAgentLine(line)
  for (const log of chunk.logs) emitRun({ type: 'log', text: redactLog(log) })
  for (const call of chunk.toolCalls) {
    const command = call.command || call.name
    applyControl({ type: 'tool', command })
    emitRun({ type: 'log', text: `${call.name}：${redactLog(command)}` })
    if (control.status === 'awaiting-confirm') {
      pauseChild()
      emitRun({ type: 'confirm', command: redactLog(command) })
    } else if (control.risk === 'blocked') {
      stopChild()
      emitRun({ type: 'blocked', command: redactLog(command) })
    }
  }
  if (chunk.finished) emitRun({ type: 'log', text: '这一轮结束' })
}

function bindChild(next: ChildProcess): void {
  child = next
  let buffer = ''
  const onData = (chunk: Buffer) => {
    buffer += chunk.toString('utf8')
    const lines = buffer.split(/\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) handleLine(line)
  }
  next.stdout?.on('data', onData)
  next.stderr?.on('data', onData)
  next.on('exit', (code) => {
    if (buffer.trim()) handleLine(buffer)
    child = null
    if (control.status === 'running' || control.status === 'paused') applyControl({ type: 'stop' })
    emitRun({ type: 'exit', code: code ?? 0 })
  })
  next.on('error', (error) => {
    emitRun({ type: 'error', text: error.message })
  })
}

function spawnCli(request: StartRequest): void {
  const provider = request.provider === 'claude-code' ? 'claude-code' : 'codex'
  const name: CliName = provider === 'claude-code' ? 'claude' : 'codex'
  const detected = detectCli(name)
  if (!detected.installed) {
    emitRun({ type: 'error', text: installHint(name) })
    applyControl({ type: 'stop' })
    return
  }
  const launch = launchAgent(provider, { prompt: request.prompt, cwd: request.cwd, resumeId: request.resumeId })
  applyControl({ type: 'start' })
  const next = spawn(detected.bin, launch.args, {
    cwd: request.cwd,
    detached: process.platform !== 'win32',
    shell: process.platform === 'win32',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env,
  })
  bindChild(next)
}

function commandText(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{')) return trimmed
  try {
    const parsed = JSON.parse(trimmed) as { command?: unknown; cmd?: unknown; input?: unknown }
    const command = parsed.command ?? parsed.cmd ?? parsed.input
    if (typeof command === 'string') return command
  } catch {
    return trimmed
  }
  return trimmed
}

async function executeCommand(command: string, cwd: string, decision: 'allow' | 'auto'): Promise<string> {
  const gate = gateCommand(command, decision === 'allow' ? 'allow' : 'auto')
  if (gate === 'block') return '王子拦住了这条命令，没有执行。'
  if (gate === 'ask') {
    emitRun({ type: 'confirm', command: redactLog(command) })
    const allowed = await new Promise<boolean>((resolve) => {
      confirmWait = resolve
    })
    if (!allowed) return '用户拒绝执行这条命令。'
  }
  return await new Promise((resolve) => {
    const shell = spawn(command, { cwd, shell: true, timeout: 20000 })
    let output = ''
    shell.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8')
    })
    shell.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8')
    })
    shell.on('exit', () => resolve(output.slice(0, 4000) || '命令已结束'))
    shell.on('error', (error) => resolve(error.message))
  })
}

async function runModel(request: StartRequest): Promise<void> {
  const provider = request.provider as ModelProvider
  const key = loadSecret(provider)
  if (!key) {
    emitRun({ type: 'error', text: '还没有保存密钥。请先打开「设置」。' })
    return
  }
  applyControl({ type: 'start' })
  const messages: Array<{ role: string; content: string }> = [{ role: 'user', content: request.prompt }]
  const endpoint = modelEndpoint(provider)
  for (let round = 0; round < 4; round += 1) {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(buildChatBody(provider, messages)),
    })
    if (!response.ok || !response.body) {
      emitRun({ type: 'error', text: `接口没有成功：${response.status}` })
      applyControl({ type: 'stop' })
      return
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let rest = ''
    let content = ''
    let tools: ToolCallDraft[] = []
    let done = false
    while (!done) {
      const step = await reader.read()
      if (step.done) break
      const pushed = pushSse(rest, decoder.decode(step.value, { stream: true }))
      rest = pushed.rest
      for (const piece of pushed.pieces) {
        if (piece.content) {
          content += piece.content
          emitRun({ type: 'log', text: redactLog(piece.content) })
        }
        for (const delta of piece.toolDeltas) tools = applyToolDelta(tools, delta)
        done = done || piece.done
      }
    }
    if (tools.length === 0) {
      applyControl({ type: 'stop' })
      emitRun({ type: 'exit', code: 0 })
      return
    }
    messages.push({ role: 'assistant', content: content || '我需要使用工具。' })
    for (const tool of tools) {
      const command = commandText(tool.arguments || tool.name)
      emitRun({ type: 'log', text: `${tool.name || '工具'}：${redactLog(command)}` })
      applyControl({ type: 'tool', command })
      let result = '没有执行。'
      if (/^read(_file)?$/i.test(tool.name) && control.risk !== 'blocked') {
        const resolved = path.resolve(request.cwd, command)
        if (!insideRoot(path.resolve(request.cwd), resolved)) result = '只能读取所选文件夹里的文件。'
        else {
          try {
            result = fs.readFileSync(resolved, 'utf8').slice(0, 4000)
          } catch (error) {
            result = error instanceof Error ? error.message : '没有读到文件'
          }
        }
      } else if (control.risk === 'blocked') {
        result = '王子拦住了这条命令，没有执行。'
        emitRun({ type: 'blocked', command: redactLog(command) })
        applyControl({ type: 'start' })
      } else if (control.status === 'awaiting-confirm') {
        emitRun({ type: 'confirm', command: redactLog(command) })
        const allowed = await new Promise<boolean>((resolve) => {
          confirmWait = resolve
        })
        result = allowed ? await executeCommand(command, request.cwd, 'allow') : '用户拒绝执行这条命令。'
        if (allowed) applyControl({ type: 'start' })
      } else if (control.status === 'running') {
        result = await executeCommand(command, request.cwd, 'auto')
      }
      emitRun({ type: 'log', text: redactLog(result) })
      messages.push({ role: 'user', content: result })
    }
  }
  applyControl({ type: 'stop' })
  emitRun({ type: 'exit', code: 0 })
}

function startRun(request: StartRequest): void {
  stopChild()
  child = null
  control = initialControl()
  active = request
  if (!request.prompt.trim()) {
    emitRun({ type: 'error', text: '请先写下要做的事' })
    return
  }
  if (!request.cwd.trim()) {
    emitRun({ type: 'error', text: '请先选择文件夹' })
    return
  }
  if (request.provider === 'deepseek' || request.provider === 'kimi') {
    void runModel(request).catch((error: unknown) => {
      emitRun({ type: 'error', text: error instanceof Error ? error.message : '运行失败' })
      applyControl({ type: 'stop' })
    })
    return
  }
  try {
    spawnCli(request)
  } catch (error) {
    emitRun({ type: 'error', text: error instanceof Error ? error.message : '没有启动成功' })
  }
}

function controlRun(action: string, text = ''): void {
  if (action === 'pause') {
    applyControl({ type: 'pause' })
    pauseChild()
    if (process.platform === 'win32') emitRun({ type: 'log', text: 'Windows 上不能冻住进程。要停下来请点停止。' })
    return
  }
  if (action === 'continue') {
    applyControl({ type: 'continue' })
    resumeChild()
    return
  }
  if (action === 'stop') {
    confirmWait?.(false)
    confirmWait = null
    applyControl({ type: 'stop' })
    stopChild()
    return
  }
  if (action === 'allow') {
    confirmWait?.(true)
    confirmWait = null
    applyControl({ type: 'allow' })
    resumeChild()
    return
  }
  if (action === 'deny') {
    confirmWait?.(false)
    confirmWait = null
    applyControl({ type: 'deny' })
    stopChild()
    return
  }
  if (action === 'follow-up') {
    applyControl({ type: 'follow-up', text })
    if (child?.stdin?.writable) {
      child.stdin.write(`${text}\n`)
      return
    }
    if (active) startRun({ ...active, prompt: text, resumeId: active.resumeId })
  }
}

function broadcastSessions(): void {
  send('sessions:changed', listSessions())
}

export function registerServices(): void {
  ipcMain.handle('sessions:list', () => listSessions())
  ipcMain.handle('sessions:read', (_event, filePath: string) => {
    if (typeof filePath !== 'string' || !allowedSession(filePath)) throw new Error('不能读取这个文件')
    const stat = fs.statSync(filePath)
    return { text: readCap(filePath), updatedAt: stat.mtime.toISOString() }
  })
  ipcMain.handle('cli:status', () => ({ claude: detectCli('claude'), codex: detectCli('codex'), platform: process.platform }))
  ipcMain.handle('folder:pick', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })
  ipcMain.handle('run:start', (_event, request: StartRequest) => {
    startRun(request)
    return true
  })
  ipcMain.handle('run:control', (_event, action: string, text?: string) => {
    controlRun(action, text ?? '')
    return control.status
  })
  ipcMain.handle('secret:status', () => ({
    deepseek: Boolean(loadSecret('deepseek')),
    kimi: Boolean(loadSecret('kimi')),
    encryption: encryptionReady(),
  }))
  ipcMain.handle('secret:save', (_event, provider: ModelProvider, value: string) => {
    if (provider !== 'deepseek' && provider !== 'kimi') throw new Error('不支持这个 Agent')
    if (!value.trim()) throw new Error('请输入密钥')
    if (!encryptionReady()) throw new Error('这台系统没有可用的钥匙串，王子没有保存密钥。')
    const current = readSecrets()
    current[provider] = safeStorage.encryptString(value.trim()).toString('base64')
    fs.mkdirSync(path.dirname(secretFile()), { recursive: true })
    fs.writeFileSync(secretFile(), JSON.stringify(current))
    return true
  })
  ipcMain.handle('secret:clear', (_event, provider: ModelProvider) => {
    const current = readSecrets()
    delete current[provider]
    fs.mkdirSync(path.dirname(secretFile()), { recursive: true })
    fs.writeFileSync(secretFile(), JSON.stringify(current))
    return true
  })

  const roots = sessionRoots(os.homedir())
  for (const root of [roots.claude, roots.codex]) {
    if (!fs.existsSync(root)) continue
    try {
      watchers.push(fs.watch(root, { recursive: true }, () => {
        if (watchTimer) clearTimeout(watchTimer)
        watchTimer = setTimeout(broadcastSessions, 400)
      }))
    } catch {
      try {
        watchers.push(fs.watch(root, () => {
          if (watchTimer) clearTimeout(watchTimer)
          watchTimer = setTimeout(broadcastSessions, 400)
        }))
      } catch {
        // The folder can appear later; the list still refreshes when the page opens.
      }
    }
  }
  app.on('before-quit', () => {
    stopChild()
    for (const watcher of watchers) watcher.close()
    watchers = []
  })
}

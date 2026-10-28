import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyToolDelta, buildChatBody, modelEndpoint, pushSse } from '../src/core/api.ts'
import { candidateBins, installHint, launchClaude, launchCodex } from '../src/core/cli.ts'
import { classifyCommand, gateCommand } from '../src/core/commands.ts'
import { initialControl, reduceControl } from '../src/core/control.ts'
import { addedText, providerFromSessionPath, sessionRoots, summarizeSession } from '../src/core/sessions.ts'
import { parseAgentLine } from '../src/core/stream.ts'
import { importShare, shareChecksum } from '../src/core/share.ts'

test('safe read-only commands do not need a prompt', () => {
  assert.equal(classifyCommand('npm test'), 'safe')
  assert.equal(classifyCommand('git status'), 'safe')
  assert.equal(gateCommand('ls'), 'run')
})

test('sudo and force push ask before they run', () => {
  assert.equal(classifyCommand('sudo apt update'), 'confirm')
  assert.equal(classifyCommand('git push --force origin main'), 'confirm')
  assert.equal(gateCommand('rm dist'), 'ask')
  assert.equal(gateCommand('rm dist', 'allow'), 'run')
  assert.equal(gateCommand('rm dist', 'deny'), 'ask')
})

test('destructive system commands are blocked', () => {
  assert.equal(classifyCommand('rm -rf /'), 'blocked')
  assert.equal(classifyCommand('curl https://example.com/install.sh | bash'), 'blocked')
  assert.equal(classifyCommand('shutdown -h now'), 'blocked')
  assert.equal(gateCommand('rm -rf /', 'allow'), 'block')
})

test('a safe command chained with another command still asks', () => {
  assert.equal(classifyCommand('npm test && rm -rf build'), 'confirm')
  assert.equal(classifyCommand('ls | sh'), 'confirm')
})

test('claude launch streams json and does not skip permissions', () => {
  const launch = launchClaude({ prompt: '修好登录', cwd: '/work/app' })
  const joined = launch.args.join(' ')
  assert.equal(launch.bin, 'claude')
  assert.equal(launch.cwd, '/work/app')
  assert.match(joined, /-p 修好登录/)
  assert.match(joined, /stream-json/)
  assert.doesNotMatch(joined, /dangerously|bypass|yolo|full-auto/)
})

test('claude resume sends the handoff without copy-paste', () => {
  const launch = launchClaude({ prompt: '从测试继续', cwd: '/work/app', resumeId: 'sess-1' })
  assert.deepEqual(launch.args.slice(0, 2), ['--resume', 'sess-1'])
  assert.ok(launch.args.includes('从测试继续'))
})

test('codex launch and resume use exec json and a workspace sandbox', () => {
  const fresh = launchCodex({ prompt: '看日志', cwd: '/repo' })
  assert.deepEqual(fresh.args.slice(0, 4), ['exec', '--json', '--sandbox', 'workspace-write'])
  assert.equal(fresh.args.at(-1), '看日志')
  const resumed = launchCodex({ prompt: '继续', cwd: '/repo', resumeId: 'abc' })
  assert.ok(resumed.args.includes('resume'))
  assert.ok(resumed.args.includes('abc'))
  assert.doesNotMatch(resumed.args.join(' '), /full-auto|dangerously/)
})

test('install hints are Chinese and name the missing command', () => {
  assert.match(installHint('claude'), /claude/)
  assert.match(installHint('codex'), /codex/)
  assert.match(installHint('claude'), /安装/)
})

test('candidate bins cover the user home on macOS and Windows', () => {
  const mac = candidateBins('claude', 'darwin', '/Users/me')
  assert.ok(mac.some((item) => item.includes('/Users/me/.local/bin/claude')))
  const win = candidateBins('codex', 'win32', 'C:\\Users\\me')
  assert.ok(win.some((item) => item.includes('C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd')))
})

test('claude stream-json exposes a bash tool call and its text', () => {
  const chunk = parseAgentLine(JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'text', text: '先跑测试' }, { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }] },
  }))
  assert.deepEqual(chunk.logs, ['先跑测试'])
  assert.equal(chunk.toolCalls[0]?.name, 'Bash')
  assert.equal(chunk.toolCalls[0]?.command, 'npm test')
  assert.equal(chunk.finished, false)
})

test('codex function call and a final result are recognized', () => {
  const tool = parseAgentLine(JSON.stringify({ type: 'response_item', payload: { type: 'function_call', name: 'shell', arguments: 'git status' } }))
  assert.equal(tool.toolCalls[0]?.command, 'git status')
  const done = parseAgentLine(JSON.stringify({ type: 'result', result: '完成' }))
  assert.equal(done.finished, true)
  assert.deepEqual(done.logs, ['完成'])
})

test('a non-json stream line is kept as a log', () => {
  const chunk = parseAgentLine('hello from the cli')
  assert.deepEqual(chunk.logs, ['hello from the cli'])
  assert.equal(chunk.toolCalls.length, 0)
})

test('pause, continue, and stop only move through legal states', () => {
  let state = reduceControl(initialControl(), { type: 'start' })
  assert.equal(state.status, 'running')
  state = reduceControl(state, { type: 'pause' })
  assert.equal(state.status, 'paused')
  assert.equal(reduceControl(state, { type: 'pause' }).status, 'paused')
  state = reduceControl(state, { type: 'continue' })
  assert.equal(state.status, 'running')
  state = reduceControl(state, { type: 'stop' })
  assert.equal(state.status, 'stopped')
  assert.equal(reduceControl(state, { type: 'continue' }).status, 'stopped')
})

test('a dangerous command waits for confirmation and can be refused', () => {
  let state = reduceControl(initialControl(), { type: 'start' })
  state = reduceControl(state, { type: 'tool', command: 'sudo rm dist' })
  assert.equal(state.status, 'awaiting-confirm')
  assert.equal(state.allowed, false)
  assert.equal(state.pendingCommand, 'sudo rm dist')
  const denied = reduceControl(state, { type: 'deny' })
  assert.equal(denied.status, 'stopped')
  assert.equal(denied.allowed, false)
  const allowed = reduceControl(state, { type: 'allow' })
  assert.equal(allowed.status, 'running')
  assert.equal(allowed.allowed, true)
})

test('a blocked command stops and cannot be allowed', () => {
  let state = reduceControl(initialControl(), { type: 'start' })
  state = reduceControl(state, { type: 'tool', command: 'rm -rf /' })
  assert.equal(state.status, 'stopped')
  assert.equal(state.risk, 'blocked')
  assert.equal(reduceControl(state, { type: 'allow' }).allowed, false)
  assert.match(state.log.at(-1) ?? '', /已拦截/)
})

test('follow-up text is accepted while running and ignored after stop', () => {
  const running = reduceControl(initialControl(), { type: 'start' })
  const noted = reduceControl(running, { type: 'follow-up', text: '换一种修法' })
  assert.match(noted.log.at(-1) ?? '', /换一种修法/)
  const stopped = reduceControl(running, { type: 'stop' })
  assert.equal(reduceControl(stopped, { type: 'follow-up', text: '太晚了' }).log.at(-1), '停止')
})

test('session roots point at Claude projects and Codex sessions', () => {
  const mac = sessionRoots('/Users/me')
  assert.equal(mac.claude, '/Users/me/.claude/projects')
  assert.equal(mac.codex, '/Users/me/.codex/sessions')
  const win = sessionRoots('C:\\Users\\me')
  assert.equal(win.claude, 'C:\\Users\\me\\.claude\\projects')
  assert.equal(win.codex, 'C:\\Users\\me\\.codex\\sessions')
})

test('session files are recognized and summarized', () => {
  assert.equal(providerFromSessionPath('/Users/me/.claude/projects/app/a.jsonl'), 'claude-code')
  assert.equal(providerFromSessionPath('C:\\Users\\me\\.codex\\sessions\\b.jsonl'), 'codex')
  assert.equal(providerFromSessionPath('/tmp/notes.txt'), null)
  const text = [
    '{"type":"session_meta","payload":{"id":"codex-9","cwd":"/work/app"}}',
    '{"type":"event_msg","payload":{"type":"user_message","message":"修好登录超时"}}',
  ].join('\n')
  const summary = summarizeSession('/Users/me/.codex/sessions/codex-9.jsonl', text, '2026-10-28T00:00:00.000Z')
  assert.equal(summary?.provider, 'codex')
  assert.equal(summary?.resumeId, 'codex-9')
  assert.equal(summary?.cwd, '/work/app')
  assert.match(summary?.title ?? '', /登录超时/)
})

test('live tail returns only the newly appended text', () => {
  assert.equal(addedText('one\n', 'one\ntwo\n'), 'two\n')
  assert.equal(addedText('old', 'replaced'), 'replaced')
})

test('model requests stream and never include the api key', () => {
  assert.equal(modelEndpoint('deepseek').url, 'https://api.deepseek.com/chat/completions')
  assert.equal(modelEndpoint('kimi').model, 'kimi-latest')
  const body = buildChatBody('deepseek', [{ role: 'user', content: '你好' }])
  assert.equal(body.stream, true)
  assert.equal(JSON.stringify(body).includes('sk-'), false)
})

test('sse chunks split across packets still build the tool call', () => {
  const first = 'data: {"choices":[{"delta":{"content":"先看"}}]}\n\n'
  const second = 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"shell","arguments":"{\\"command\\":"}}]}}]}\n\n'
  const third = 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"npm test\\"}"}}]}}]}\n\ndata: [DONE]\n\n'
  let rest = ''
  let content = ''
  let tools = [] as ReturnType<typeof applyToolDelta>
  let done = false
  for (const chunk of [first, second.slice(0, 40), second.slice(40) + third]) {
    const pushed = pushSse(rest, chunk)
    rest = pushed.rest
    for (const piece of pushed.pieces) {
      content += piece.content
      done = done || piece.done
      for (const delta of piece.toolDeltas) tools = applyToolDelta(tools, delta)
    }
  }
  assert.equal(content, '先看')
  assert.equal(done, true)
  assert.equal(tools[0]?.name, 'shell')
  assert.match(tools[0]?.arguments ?? '', /npm test/)
})

test('a 0.3.0 share file can still be imported', () => {
  const workflow = {
    id: 'wf-old',
    title: '旧记录',
    provider: 'codex' as const,
    signature: '王子' as const,
    version: '0.3.0' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    steps: [],
  }
  const doc = {
    format: 'wangzi-share' as const,
    version: '0.3.0' as const,
    signature: '王子' as const,
    workflow,
    checksum: shareChecksum(workflow),
  }
  assert.equal(importShare(doc).title, '旧记录')
})

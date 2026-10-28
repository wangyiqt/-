import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  APP_SIGNATURE,
  APP_VERSION,
  analyzeTranscript,
  applyEvent,
  attachRunLog,
  createSnapshot,
  exportShare,
  getProvider,
  importShare,
  planTakeover,
  PROVIDERS,
  runWorkflow,
  sampleById,
  sha256,
  shareChecksum,
  theme,
  type Workflow,
  type WorkflowStep,
} from '../src/core/index.ts'

const NOW = '2026-01-01T00:00:00.000Z'

function step(id: string, title: string, kind: WorkflowStep['kind'], tool?: string): WorkflowStep {
  return {
    id,
    title,
    kind,
    provider: 'codex',
    ...(tool ? { tool } : {}),
    input: kind === 'tool' ? 'npm test' : title,
    output: kind === 'result' ? '完成' : '',
    status: 'succeeded',
  }
}

function workflow(): Workflow {
  return {
    id: 'wf-1',
    title: '登录超时',
    provider: 'codex',
    signature: '王子',
    version: '0.4.0',
    createdAt: NOW,
    steps: [step('s1', '看日志', 'prompt'), step('s2', '跑测试', 'tool', 'shell'), step('s3', '给出结论', 'result')],
  }
}

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = []
  for await (const item of source) items.push(item)
  return items
}

test('provider catalog lists Codex, Claude Code, DeepSeek and Kimi', () => {
  assert.deepEqual(PROVIDERS.map((provider) => provider.id), ['codex', 'claude-code', 'deepseek', 'kimi'])
  assert.deepEqual(PROVIDERS.map((provider) => provider.cli), ['codex', 'claude', 'deepseek', 'kimi'])
})

test('provider labels stay stable for the black-gold shell', () => {
  assert.equal(theme.background, '#070707')
  assert.equal(theme.panel, '#101010')
  assert.equal(theme.gold, '#d4af37')
  assert.equal(theme.ink, '#f3efe2')
  assert.equal(theme.signature, '王子')
  assert.deepEqual(PROVIDERS.map((provider) => provider.label), ['Codex', 'Claude Code', 'DeepSeek', 'Kimi'])
})

test('unknown provider id is rejected', () => {
  assert.throws(() => getProvider('gpt'), /未知的 Agent：gpt/)
})

test('signature constant is 王子 and version is 0.4.0', () => {
  assert.equal(APP_SIGNATURE, '王子')
  assert.equal(APP_VERSION, '0.4.0')
})

test('analyzes a Codex jsonl transcript into ordered steps', () => {
  const result = analyzeTranscript(sampleById('codex').text, { now: NOW })
  assert.equal(result.provider, 'codex')
  assert.deepEqual(result.workflow.steps.map((item) => item.kind), ['prompt', 'tool', 'result', 'result'])
  assert.equal(result.workflow.steps[1]?.tool, 'shell')
  assert.match(result.workflow.steps[0]?.input ?? '', /登录有时会超时/)
  assert.equal(result.workflow.signature, '王子')
  assert.equal(result.workflow.version, '0.4.0')
  assert.equal(analyzeTranscript(sampleById('codex').text, { now: NOW }).workflow.id, result.workflow.id)
})

test('analyzes a Claude Code transcript including tool_use', () => {
  const result = analyzeTranscript(sampleById('claude-code').text, { now: NOW })
  assert.equal(result.provider, 'claude-code')
  assert.ok(result.workflow.steps.some((item) => item.tool === 'Bash'))
  assert.ok(result.workflow.steps.some((item) => item.input.includes('登录接口')))
  assert.ok(result.workflow.steps.some((item) => item.output.includes('login timeout') || item.input.includes('login timeout')))
})

test('analyzes a DeepSeek tool-call conversation', () => {
  const result = analyzeTranscript(sampleById('deepseek').text, { now: NOW })
  assert.equal(result.provider, 'deepseek')
  assert.ok(result.workflow.steps.some((item) => item.tool === 'read_file'))
  assert.ok(result.workflow.steps.some((item) => `${item.input}\n${item.output}`.includes('timeout')))
  assert.match(result.workflow.title, /登录超时/)
})

test('analyzes a Kimi step transcript', () => {
  const result = analyzeTranscript(sampleById('kimi').text, { now: NOW })
  assert.equal(result.provider, 'kimi')
  assert.equal(result.workflow.title, '支付重试')
  assert.ok(result.workflow.steps.some((item) => item.kind === 'decision'))
  assert.ok(result.workflow.steps.some((item) => item.tool === 'edit_file'))
  assert.match(result.workflow.steps.at(-1)?.input ?? '', /三次重试/)
})

test('auto-detects provider from transcript shape', () => {
  assert.equal(analyzeTranscript(sampleById('codex').text).provider, 'codex')
  assert.equal(analyzeTranscript(sampleById('claude-code').text).provider, 'claude-code')
  assert.equal(analyzeTranscript(sampleById('deepseek').text).provider, 'deepseek')
  assert.equal(analyzeTranscript(sampleById('kimi').text).provider, 'kimi')
})

test('rejects empty transcript with a Chinese error', () => {
  assert.throws(() => analyzeTranscript('   \n'), /请粘贴工作流记录/)
})

test('builds a short Chinese summary of tools and step count', () => {
  const text = [
    '{"type":"event_msg","payload":{"type":"user_message","message":"跑一下测试"}}',
    '{"type":"response_item","payload":{"type":"function_call","name":"shell","arguments":"npm test"}}',
  ].join('\n')
  const result = analyzeTranscript(text, { now: NOW })
  assert.equal(result.summary, 'Codex · 2 步 · 工具 shell')
})

test('skips malformed lines and returns warnings', () => {
  const text = [
    '{"type":"session_meta","payload":{"id":"s"}}',
    'not-json',
    '{"type":"event_msg","payload":{"type":"user_message","message":"你好"}}',
  ].join('\n')
  const result = analyzeTranscript(text, { now: NOW })
  assert.equal(result.warnings.length, 1)
  assert.match(result.warnings[0] ?? '', /第 2 行/)
  assert.equal(result.workflow.steps.length, 1)
  assert.equal(result.workflow.steps[0]?.input, '你好')
})

test('takeover from a middle step keeps history and plans the rest', () => {
  const plan = planTakeover(workflow(), 's2')
  assert.deepEqual(plan.history.map((item) => item.id), ['s1'])
  assert.deepEqual(plan.steps.map((item) => item.id), ['s2', 's3'])
  assert.equal(plan.fromStepId, 's2')
})

test('takeover from the first step plans the whole workflow', () => {
  const plan = planTakeover(workflow(), 's1')
  assert.equal(plan.history.length, 0)
  assert.equal(plan.steps.length, 3)
})

test('missing step id throws', () => {
  assert.throws(() => planTakeover(workflow(), 'missing'), /找不到这一步/)
})

test('handoff prompt names 王子, the provider, and remaining actions', () => {
  const plan = planTakeover(workflow(), 's2')
  assert.match(plan.handoffPrompt, /王子/)
  assert.match(plan.handoffPrompt, /Codex/)
  assert.match(plan.handoffPrompt, /跑测试/)
  assert.match(plan.handoffPrompt, /shell/)
  assert.doesNotMatch(plan.handoffPrompt, /看日志/)
})

test('takeover plan steps start as pending', () => {
  const plan = planTakeover(workflow(), 's2')
  assert.ok(plan.steps.every((item) => item.status === 'pending'))
  assert.equal(plan.history[0]?.status, 'succeeded')
})

test('share document carries 王子 signature and format version 0.4.0', () => {
  const doc = exportShare(workflow())
  assert.equal(doc.signature, '王子')
  assert.equal(doc.version, '0.4.0')
  assert.equal(doc.format, 'wangzi-share')
  assert.equal(doc.workflow.signature, '王子')
})

test('checksum matches canonical workflow body', () => {
  assert.equal(sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  const doc = exportShare(workflow())
  assert.equal(doc.checksum, shareChecksum(doc.workflow))
  assert.equal(doc.checksum.length, 64)
})

test('tampered checksum is rejected', () => {
  const doc = exportShare(workflow())
  doc.workflow.title = '被改过'
  assert.throws(() => importShare(doc), /分享文件已被改动/)
})

test('api keys and bearer tokens are redacted', () => {
  const source = workflow()
  source.steps[0] = {
    ...source.steps[0],
    input: 'key sk-abcdefghijklmnopqrstuvwxyz and Bearer super-secret-token and {"api_key":"my-real-key-123"}',
  }
  const doc = exportShare(source)
  const packed = JSON.stringify(doc)
  assert.equal(packed.includes('sk-abcdefghijklmnopqrstuvwxyz'), false)
  assert.equal(packed.includes('super-secret-token'), false)
  assert.equal(packed.includes('my-real-key-123'), false)
  assert.match(packed, /sk-\*\*\*/)
  assert.match(packed, /Bearer \*\*\*/)
})

test('import roundtrip preserves steps', () => {
  const source = workflow()
  const restored = importShare(exportShare(source))
  assert.deepEqual(restored.steps, source.steps)
  assert.equal(restored.title, source.title)
  assert.equal(restored.provider, 'codex')
})

test('runner emits start, step, and finish events in order', async () => {
  const source = workflow()
  const events = await collect(runWorkflow(source, { runId: 'run-1' }))
  assert.deepEqual(events.map((event) => event.type), [
    'run.started',
    'step.started',
    'step.log',
    'step.finished',
    'step.started',
    'step.log',
    'step.finished',
    'step.started',
    'step.log',
    'step.finished',
    'run.finished',
  ])
  assert.equal(events[0]?.type === 'run.started' ? events[0].runId : '', 'run-1')
  const toolLog = events.find((event) => event.type === 'step.log' && event.stepId === 's2')
  assert.match(toolLog && toolLog.type === 'step.log' ? toolLog.message : '', /shell/)
})

test('applying events updates the real-time snapshot statuses', () => {
  const source = workflow()
  let snapshot = createSnapshot(source)
  assert.equal(snapshot.status, 'idle')
  assert.equal(snapshot.stepStatus.s1, 'pending')
  snapshot = applyEvent(snapshot, { type: 'run.started', runId: 'r', stepCount: 1, fromStepId: 's1' })
  assert.equal(snapshot.status, 'running')
  snapshot = applyEvent(snapshot, { type: 'step.started', stepId: 's1', index: 0, title: '看日志' })
  assert.equal(snapshot.stepStatus.s1, 'running')
  snapshot = applyEvent(snapshot, { type: 'step.log', stepId: 's1', message: '日志' })
  assert.equal(snapshot.logs.at(-1)?.message, '日志')
  snapshot = applyEvent(snapshot, { type: 'step.finished', stepId: 's1', status: 'succeeded' })
  snapshot = applyEvent(snapshot, { type: 'run.finished', status: 'succeeded', runId: 'r' })
  assert.equal(snapshot.status, 'succeeded')
  assert.equal(snapshot.stepStatus.s1, 'succeeded')
})

test('a marked failure stops the run and records failed', async () => {
  const events = await collect(runWorkflow(workflow(), { failStepIds: ['s2'], runId: 'run-fail' }))
  const finished = events.at(-1)
  assert.equal(finished?.type, 'run.finished')
  assert.equal(finished && finished.type === 'run.finished' ? finished.status : '', 'failed')
  assert.ok(events.some((event) => event.type === 'step.finished' && event.stepId === 's2' && event.status === 'failed'))
  assert.equal(events.some((event) => event.type === 'step.started' && event.stepId === 's3'), false)
})

test('execution log can be attached back onto a share document', async () => {
  const source = workflow()
  const events = await collect(runWorkflow(source, { runId: 'run-share' }))
  const withLog = attachRunLog(source, events)
  const restored = importShare(exportShare(withLog))
  assert.ok(restored.execution && restored.execution.length > 0)
  assert.equal(restored.execution?.at(-1)?.type, 'run.finished')
  assert.equal(JSON.stringify(exportShare(withLog)).includes('run-share'), true)
})

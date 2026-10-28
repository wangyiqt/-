import { useEffect, useMemo, useRef, useState } from 'react'
import {
  APP_VERSION,
  analyzeTranscript,
  applyEvent,
  createSnapshot,
  exportShare,
  importShare,
  planTakeover,
  PROVIDERS,
  runWorkflow,
  SAMPLES,
  type ProviderId,
  type RunSnapshot,
  type TakeoverPlan,
  type Workflow,
} from '../core/index.ts'
import { copyText, downloadText, getBridge, type RunRequest } from './bridge.ts'
import { RunPane, SessionsPane, SettingsPane } from './pages.tsx'

type Screen = 'sessions' | 'run' | 'analyze' | 'takeover' | 'live' | 'share' | 'settings'
type ProviderChoice = ProviderId | 'auto'

const STORAGE_KEY = 'wangzi.workflow.v1'
const KIND_LABEL = { prompt: '任务', tool: '工具', result: '结果', decision: '判断' }
const STATUS_LABEL = { idle: '等待', pending: '等待', running: '进行中', succeeded: '完成', failed: '失败', skipped: '跳过' }

const NAV: Array<{ id: Screen; index: string; label: string; hint: string }> = [
  { id: 'sessions', index: '01', label: '会话', hint: '本机记录' },
  { id: 'run', index: '02', label: '运行', hint: '直接接手' },
  { id: 'analyze', index: '03', label: '分析', hint: '贴记录' },
  { id: 'share', index: '04', label: '分享', hint: '导出导入' },
  { id: 'settings', index: '05', label: '设置', hint: '密钥和命令' },
]

function providerLabel(id: ProviderId): string {
  return PROVIDERS.find((provider) => provider.id === id)?.label ?? id
}

export function App() {
  const [screen, setScreen] = useState<Screen>('sessions')
  const [runRequest, setRunRequest] = useState<RunRequest | null>(null)
  const [draft, setDraft] = useState('')
  const [providerChoice, setProviderChoice] = useState<ProviderChoice>('auto')
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [summary, setSummary] = useState('')
  const [fromStepId, setFromStepId] = useState<string | null>(null)
  const [plan, setPlan] = useState<TakeoverPlan | null>(null)
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null)
  const [running, setRunning] = useState(false)
  const [shareInput, setShareInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const runToken = useRef(0)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return
    try {
      const parsed = JSON.parse(saved) as { workflow?: Workflow; draft?: string; providerChoice?: ProviderChoice }
      if (parsed.workflow) {
        setWorkflow(parsed.workflow)
        setFromStepId(parsed.workflow.steps[0]?.id ?? null)
        setSummary(`${providerLabel(parsed.workflow.provider)} · ${parsed.workflow.steps.length} 步`)
      }
      if (typeof parsed.draft === 'string') setDraft(parsed.draft)
      if (parsed.providerChoice) setProviderChoice(parsed.providerChoice)
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    if (!workflow) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ workflow, draft, providerChoice }))
  }, [workflow, draft, providerChoice])

  const shareText = useMemo(() => (workflow ? JSON.stringify(exportShare(workflow), null, 2) : ''), [workflow])

  function remember(next: Workflow, nextWarnings: string[] = [], nextSummary = ''): void {
    setWorkflow(next)
    setWarnings(nextWarnings)
    setSummary(nextSummary || `${providerLabel(next.provider)} · ${next.steps.length} 步`)
    setFromStepId(next.steps[0]?.id ?? null)
    setPlan(null)
    setSnapshot(null)
    setError(null)
  }

  function onAnalyze(): void {
    try {
      const provider = providerChoice === 'auto' ? undefined : providerChoice
      const result = analyzeTranscript(draft, { provider })
      remember(result.workflow, result.warnings, result.summary)
      setNotice('分析完成')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '分析失败')
    }
  }

  function onPlan(stepId: string): void {
    if (!workflow) return
    setFromStepId(stepId)
    try {
      setPlan(planTakeover(workflow, stepId))
      setError(null)
      setNotice('交接提示已生成')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '接管失败')
    }
  }

  async function onRun(): Promise<void> {
    if (!workflow || running) return
    const token = runToken.current + 1
    runToken.current = token
    const startId = fromStepId ?? workflow.steps[0]?.id
    setRunning(true)
    setError(null)
    setScreen('live')
    let next = createSnapshot(workflow, startId ?? undefined)
    setSnapshot(next)
    try {
      for await (const event of runWorkflow(workflow, { fromStepId: startId ?? undefined, delayMs: 360 })) {
        if (runToken.current !== token) return
        next = applyEvent(next, event)
        setSnapshot(next)
      }
      setNotice('回放结束')
    } catch (cause) {
      if (runToken.current === token) setError(cause instanceof Error ? cause.message : '回放失败')
    } finally {
      if (runToken.current === token) setRunning(false)
    }
  }

  async function onCopy(text: string, done: string): Promise<void> {
    await copyText(text)
    setNotice(done)
  }

  async function onSaveShare(): Promise<void> {
    if (!shareText) return
    const bridge = getBridge()
    if (bridge) {
      const saved = await bridge.saveText('王子-分享.json', shareText)
      setNotice(saved ? `已保存到 ${saved}` : '已取消保存')
      return
    }
    downloadText('王子-分享.json', shareText)
    setNotice('已开始下载分享文件')
  }

  function applyImported(text: string): void {
    const next = importShare(text)
    remember(next)
    setShareInput(text)
    setNotice('已导入分享文件')
    setScreen('analyze')
  }

  async function onOpenShare(): Promise<void> {
    try {
      if (shareInput.trim()) {
        applyImported(shareInput)
        return
      }
      const bridge = getBridge()
      if (!bridge) {
        setError('请先贴上分享内容')
        return
      }
      const text = await bridge.openText()
      if (!text) return
      applyImported(text)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导入失败')
    }
  }

  return (
    <div className="app">
      <aside className="seal">
        <div className="seal-mark">王子</div>
        <div className="seal-sub">签名</div>
      </aside>
      <main className="shell">
        <header className="top">
          <div>
            <h1 className="brand">王子</h1>
            <p className="lede">查看会话，直接接手，不用来回粘贴</p>
          </div>
          <div className="version">
            {APP_VERSION}
            <span>黑金 · 极简</span>
          </div>
        </header>
        <nav className="nav">
          {NAV.map((item) => (
            <button key={item.id} type="button" className={screen === item.id ? 'active' : ''} onClick={() => setScreen(item.id)}>
              <strong>{item.index} {item.label}</strong>
              <em>{item.hint}</em>
            </button>
          ))}
        </nav>
        <div className="actions">
          <button type="button" className={screen === 'takeover' ? 'gold' : 'ghost'} onClick={() => setScreen('takeover')}>接管已有记录</button>
          <button type="button" className={screen === 'live' ? 'gold' : 'ghost'} onClick={() => setScreen('live')}>只回放</button>
        </div>
        {error ? <p className="banner error">{error}</p> : null}
        {notice && !error ? <p className="banner notice">{notice}</p> : null}
        <section className="panel">
          {screen === 'sessions' ? <SessionsPane onTakeover={(request) => { setRunRequest(request); setScreen('run') }} /> : null}
          {screen === 'run' ? <RunPane request={runRequest} /> : null}
          {screen === 'settings' ? <SettingsPane /> : null}
          {screen === 'analyze' ? (
            <AnalyzePane
              draft={draft}
              providerChoice={providerChoice}
              summary={summary}
              warnings={warnings}
              workflow={workflow}
              onDraft={setDraft}
              onProvider={setProviderChoice}
              onAnalyze={onAnalyze}
              onSample={(sample) => {
                setDraft(sample.text)
                setProviderChoice(sample.provider)
                setError(null)
              }}
            />
          ) : null}
          {screen === 'takeover' ? (
            <TakeoverPane workflow={workflow} fromStepId={fromStepId} plan={plan} onPlan={onPlan} onCopy={onCopy} />
          ) : null}
          {screen === 'live' ? (
            <LivePane workflow={workflow} snapshot={snapshot} running={running} onRun={() => void onRun()} />
          ) : null}
          {screen === 'share' ? (
            <SharePane
              shareText={shareText}
              shareInput={shareInput}
              onShareInput={setShareInput}
              onCopy={() => void onCopy(shareText, '分享内容已复制')}
              onSave={() => void onSaveShare()}
              onImport={() => void onOpenShare()}
            />
          ) : null}
        </section>
      </main>
    </div>
  )
}

function AnalyzePane(props: {
  draft: string
  providerChoice: ProviderChoice
  summary: string
  warnings: string[]
  workflow: Workflow | null
  onDraft: (value: string) => void
  onProvider: (value: ProviderChoice) => void
  onAnalyze: () => void
  onSample: (sample: (typeof SAMPLES)[number]) => void
}) {
  return (
    <div>
      <div className="chips" role="group" aria-label="选择 Agent">
        <button type="button" className={props.providerChoice === 'auto' ? 'active' : ''} onClick={() => props.onProvider('auto')}>自动识别</button>
        {PROVIDERS.map((provider) => (
          <button key={provider.id} type="button" className={props.providerChoice === provider.id ? 'active' : ''} onClick={() => props.onProvider(provider.id)}>
            {provider.label}
          </button>
        ))}
      </div>
      <label className="lede" htmlFor="transcript">工作流记录</label>
      <textarea
        id="transcript"
        value={props.draft}
        placeholder="粘贴 Codex、Claude Code、DeepSeek 或 Kimi 的会话记录。也可以先载入示例。"
        onChange={(event) => props.onDraft(event.target.value)}
      />
      <div className="actions">
        {SAMPLES.map((sample) => (
          <button key={sample.id} type="button" className="ghost" onClick={() => props.onSample(sample)}>{sample.label}</button>
        ))}
        <button type="button" className="gold" onClick={props.onAnalyze}>开始分析</button>
      </div>
      {props.workflow ? (
        <>
          <div className="summary">
            <span>{props.workflow.title}</span>
            <span>{props.summary}</span>
          </div>
          {props.warnings.length > 0 ? (
            <ul className="warnings">
              {props.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          ) : null}
          <StepList workflow={props.workflow} />
        </>
      ) : <p className="empty">还没有工作流。贴上一段记录，或载入一个示例。</p>}
    </div>
  )
}

function TakeoverPane(props: {
  workflow: Workflow | null
  fromStepId: string | null
  plan: TakeoverPlan | null
  onPlan: (stepId: string) => void
  onCopy: (text: string, done: string) => Promise<void>
}) {
  if (!props.workflow) return <p className="empty">先在「分析」里读入一条工作流，再选择从哪一步接管。</p>
  return (
    <div className="split">
      <div>
        <p className="lede">选择接管起点</p>
        <ol className="timeline">
          {props.workflow.steps.map((step) => (
            <li key={step.id} className={`step ${props.fromStepId === step.id ? 'running' : ''}`}>
              <span className="dot" />
              <div>
                <h3>{step.title}</h3>
                <div className="meta">{step.id} · {KIND_LABEL[step.kind]}{step.tool ? ` · ${step.tool}` : ''}</div>
              </div>
              <button type="button" className="ghost" onClick={() => props.onPlan(step.id)}>
                {props.fromStepId === step.id ? '当前起点' : '从这里接管'}
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div>
        {props.plan ? (
          <>
            <div className="summary">
              <span>交接提示</span>
              <span>保留 {props.plan.history.length} 步，继续 {props.plan.steps.length} 步</span>
            </div>
            <pre className="handoff">{props.plan.handoffPrompt}</pre>
            <div className="actions">
              <button type="button" className="gold" onClick={() => void props.onCopy(props.plan?.handoffPrompt ?? '', '交接提示已复制')}>复制交接提示</button>
            </div>
          </>
        ) : <p className="empty">点某一步的「从这里接管」。之前的步骤会留作记录，后面的步骤写进交接提示。</p>}
      </div>
    </div>
  )
}

function LivePane(props: {
  workflow: Workflow | null
  snapshot: RunSnapshot | null
  running: boolean
  onRun: () => void
}) {
  if (!props.workflow) return <p className="empty">还没有可回放的工作流。</p>
  const snapshot = props.snapshot
  return (
    <div>
      <div className="actions">
        <button type="button" className="gold" disabled={props.running} onClick={props.onRun}>
          {props.running ? '正在回放' : '开始实时回放'}
        </button>
        <span className="status">{snapshot ? STATUS_LABEL[snapshot.status] : '等待'}</span>
      </div>
      <ol className="timeline">
        {props.workflow.steps.map((step) => {
          const status = snapshot?.stepStatus[step.id] ?? 'pending'
          return (
            <li key={step.id} className={`step ${status}`}>
              <span className="dot" />
              <div>
                <h3>{step.title}</h3>
                <div className="meta">{KIND_LABEL[step.kind]}{step.tool ? ` · ${step.tool}` : ''}</div>
              </div>
              <span className="status">{STATUS_LABEL[status]}</span>
            </li>
          )
        })}
      </ol>
      {snapshot && snapshot.logs.length > 0 ? (
        <ul className="logs">
          {snapshot.logs.map((log, index) => <li key={`${log.stepId}-${index}`}>{log.message}</li>)}
        </ul>
      ) : null}
    </div>
  )
}

function SharePane(props: {
  shareText: string
  shareInput: string
  onShareInput: (value: string) => void
  onCopy: () => void
  onSave: () => void
  onImport: () => void
}) {
  return (
    <div className="split">
      <div>
        <p className="lede">导出</p>
        {props.shareText ? <pre className="share-view">{props.shareText}</pre> : <p className="empty">分析之后，这里会出现一份可分享的王子文件。</p>}
        <div className="actions">
          <button type="button" className="gold" disabled={!props.shareText} onClick={props.onCopy}>复制</button>
          <button type="button" className="ghost" disabled={!props.shareText} onClick={props.onSave}>保存文件</button>
        </div>
      </div>
      <div>
        <label className="lede" htmlFor="share-input">导入</label>
        <textarea id="share-input" value={props.shareInput} placeholder="把收到的王子分享贴在这里" onChange={(event) => props.onShareInput(event.target.value)} />
        <div className="actions">
          <button type="button" className="gold" onClick={props.onImport}>导入</button>
          <label className="ghost file-pick">
            选择文件
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                void file.text().then((text) => props.onShareInput(text))
              }}
            />
          </label>
        </div>
      </div>
    </div>
  )
}

function StepList({ workflow }: { workflow: Workflow }) {
  return (
    <ol className="timeline">
      {workflow.steps.map((step) => (
        <li key={step.id} className="step succeeded">
          <span className="dot" />
          <div>
            <h3>{step.title}</h3>
            <div className="meta">{providerLabel(step.provider)} · {KIND_LABEL[step.kind]}{step.tool ? ` · ${step.tool}` : ''}</div>
            {step.input ? <p className="body">{step.input}</p> : null}
            {step.output ? <p className="body">{step.output}</p> : null}
          </div>
          <span className="status">已记录</span>
        </li>
      ))}
    </ol>
  )
}

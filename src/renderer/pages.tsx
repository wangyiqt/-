import { useEffect, useRef, useState } from 'react'
import { analyzeTranscript, planTakeover } from '../core/index.ts'
import { getBridge, type RunEventMessage, type RunRequest, type SessionSummary } from './bridge.ts'

const PROVIDER_LABEL = { 'claude-code': 'Claude Code', codex: 'Codex', deepseek: 'DeepSeek', kimi: 'Kimi' }

export function SessionsPane(props: { onTakeover: (request: RunRequest) => void }) {
  const bridge = getBridge()
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [selected, setSelected] = useState<string>('')
  const selectedRef = useRef('')
  const [steps, setSteps] = useState<Array<{ id: string; title: string; kind: string; tool?: string; input: string }>>([])
  const [notice, setNotice] = useState('')

  async function showFile(filePath: string, list: SessionSummary[]): Promise<void> {
    if (!bridge) return
    try {
      const file = await bridge.readSession(filePath)
      const session = list.find((item) => item.filePath === filePath)
      const result = analyzeTranscript(file.text, session ? { provider: session.provider } : {})
      setSteps(result.workflow.steps)
      setNotice(result.summary)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '这条会话还读不出来')
    }
  }

  async function refresh(): Promise<void> {
    if (!bridge) return
    const next = await bridge.listSessions()
    setSessions(next)
    if (selectedRef.current) await showFile(selectedRef.current, next)
  }

  useEffect(() => {
    if (!bridge) return
    void refresh()
    return bridge.onSessions((next) => {
      setSessions(next)
      if (selectedRef.current) void showFile(selectedRef.current, next)
    })
  }, [bridge])

  async function openSession(filePath: string): Promise<void> {
    selectedRef.current = filePath
    setSelected(filePath)
    await showFile(filePath, sessions)
  }

  if (!bridge) return <p className="empty">会话列表要在安装好的王子里看。浏览器预览读不到你电脑上的 Claude Code 和 Codex 记录。</p>

  return (
    <div className="split">
      <div>
        <div className="actions">
          <button type="button" className="ghost" onClick={() => void refresh()}>刷新</button>
        </div>
        {sessions.length === 0 ? <p className="empty">还没有找到本机的 Claude Code 或 Codex 会话。用过一次之后，这里会自动出现，并跟着新内容更新。</p> : null}
        <ol className="timeline">
          {sessions.map((session) => (
            <li key={session.filePath} className={`step ${selected === session.filePath ? 'running' : ''}`}>
              <span className="dot" />
              <div>
                <h3>{session.title}</h3>
                <div className="meta">{PROVIDER_LABEL[session.provider]} · {new Date(session.updatedAt).toLocaleString()}</div>
              </div>
              <button type="button" className="ghost" onClick={() => void openSession(session.filePath)}>打开</button>
            </li>
          ))}
        </ol>
      </div>
      <div>
        {notice ? <p className="summary"><span>{notice}</span></p> : <p className="empty">打开一条会话后，步骤会显示在这里。文件有新内容时会自动刷新。</p>}
        <ol className="timeline">
          {steps.map((step) => (
            <li key={step.id} className="step succeeded">
              <span className="dot" />
              <div>
                <h3>{step.title}</h3>
                <div className="meta">{step.kind}{step.tool ? ` · ${step.tool}` : ''}</div>
                {step.input ? <p className="body">{step.input}</p> : null}
              </div>
              <button type="button" className="ghost" onClick={() => {
                const session = sessions.find((item) => item.filePath === selected)
                if (!session) return
                const plan = planTakeover({
                  id: session.id,
                  title: session.title,
                  provider: session.provider,
                  signature: '王子',
                  version: '0.4.0',
                  createdAt: session.updatedAt,
                  steps: steps.map((item) => ({
                    id: item.id,
                    title: item.title,
                    kind: item.kind as 'prompt' | 'tool' | 'result' | 'decision',
                    provider: session.provider,
                    tool: item.tool,
                    input: item.input,
                    output: '',
                    status: 'succeeded' as const,
                  })),
                }, step.id)
                props.onTakeover({ provider: session.provider, prompt: plan.handoffPrompt, cwd: session.cwd, resumeId: session.resumeId })
              }}>从这里接管</button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

export function RunPane(props: { request: RunRequest | null }) {
  const bridge = getBridge()
  const [provider, setProvider] = useState<RunRequest['provider']>(props.request?.provider ?? 'claude-code')
  const [prompt, setPrompt] = useState(props.request?.prompt ?? '')
  const [cwd, setCwd] = useState(props.request?.cwd ?? '')
  const [resumeId, setResumeId] = useState(props.request?.resumeId)
  const [logs, setLogs] = useState<string[]>([])
  const [status, setStatus] = useState('idle')
  const [confirming, setConfirming] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [cli, setCli] = useState<{ claude: boolean; codex: boolean }>({ claude: false, codex: false })
  const [keys, setKeys] = useState<{ deepseek: boolean; kimi: boolean }>({ deepseek: false, kimi: false })

  useEffect(() => {
    if (!bridge) return
    void bridge.cliStatus().then((status) => setCli({ claude: status.claude.installed, codex: status.codex.installed }))
    void bridge.secretStatus().then((status) => setKeys({ deepseek: status.deepseek, kimi: status.kimi }))
    return bridge.onRunEvent((event) => acceptEvent(event))
  }, [bridge])

  useEffect(() => {
    if (!props.request) return
    setProvider(props.request.provider)
    setPrompt(props.request.prompt)
    setCwd(props.request.cwd)
    setResumeId(props.request.resumeId)
  }, [props.request])

  function acceptEvent(event: RunEventMessage): void {
    if (event.type === 'log' && event.text) setLogs((current) => [...current, event.text as string])
    if (event.type === 'error' && event.text) setLogs((current) => [...current, event.text as string])
    if (event.type === 'status' && event.status) setStatus(event.status)
    if (event.type === 'confirm' && event.command) setConfirming(event.command)
    if (event.type === 'blocked') {
      setConfirming('')
      setLogs((current) => [...current, `已拦截：${event.command ?? ''}`])
    }
    if (event.type === 'exit') setStatus('stopped')
  }

  async function start(): Promise<void> {
    if (!bridge) return
    setLogs([])
    setConfirming('')
    await bridge.startRun({ provider, prompt, cwd, resumeId })
  }

  const needsCli = provider === 'claude-code' || provider === 'codex'
  const cliReady = provider === 'claude-code' ? cli.claude : provider === 'codex' ? cli.codex : true
  const keyReady = provider === 'deepseek' ? keys.deepseek : provider === 'kimi' ? keys.kimi : true

  if (!bridge) return <p className="empty">运行 Agent 要在安装好的王子里。浏览器预览不能启动你电脑上的命令。</p>

  return (
    <div>
      <div className="chips" role="group" aria-label="选择 Agent">
        {(['claude-code', 'codex', 'deepseek', 'kimi'] as const).map((item) => (
          <button key={item} type="button" className={provider === item ? 'active' : ''} onClick={() => { setProvider(item); setResumeId(undefined) }}>{PROVIDER_LABEL[item]}</button>
        ))}
      </div>
      {needsCli && !cliReady ? <p className="banner error">{provider === 'claude-code' ? '还没有安装 claude。装好后重新打开王子。' : '还没有安装 codex。装好后重新打开王子。'}</p> : null}
      {!needsCli && !keyReady ? <p className="banner error">还没有密钥。请先到「设置」里保存。</p> : null}
      <div className="actions">
        <button type="button" className="ghost" onClick={() => void bridge.pickFolder().then((folder) => { if (folder) setCwd(folder) })}>选择文件夹</button>
        <span className="meta">{cwd || '还没有选择文件夹'}</span>
      </div>
      <label className="lede" htmlFor="task">要做的事</label>
      <textarea id="task" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="用一句话说明要它做什么" />
      <div className="actions">
        <button type="button" className="gold" disabled={!cliReady || !keyReady} onClick={() => void start()}>开始</button>
        <button type="button" className="ghost" onClick={() => void bridge.controlRun('pause')}>暂停</button>
        <button type="button" className="ghost" onClick={() => void bridge.controlRun('continue')}>继续</button>
        <button type="button" className="ghost" onClick={() => void bridge.controlRun('stop')}>停止</button>
        <span className="status">{status === 'awaiting-confirm' ? '等待确认' : status === 'running' ? '进行中' : status === 'paused' ? '已暂停' : status === 'stopped' ? '已停止' : '等待'}</span>
      </div>
      {confirming ? (
        <div className="confirm">
          <p>王子需要你确认这条命令：</p>
          <pre className="handoff">{confirming}</pre>
          <div className="actions">
            <button type="button" className="gold" onClick={() => { setConfirming(''); void bridge.controlRun('allow') }}>允许执行</button>
            <button type="button" className="ghost" onClick={() => { setConfirming(''); void bridge.controlRun('deny') }}>不要执行</button>
          </div>
        </div>
      ) : null}
      <label className="lede" htmlFor="follow">补充说明</label>
      <textarea id="follow" value={followUp} onChange={(event) => setFollowUp(event.target.value)} placeholder="想补充一句，写在这里再发送" />
      <div className="actions">
        <button type="button" className="ghost" onClick={() => { void bridge.controlRun('follow-up', followUp); setFollowUp('') }}>发送</button>
      </div>
      <ul className="logs">
        {logs.map((line, index) => <li key={`${index}-${line.slice(0, 12)}`}>{line}</li>)}
      </ul>
    </div>
  )
}

export function SettingsPane() {
  const bridge = getBridge()
  const [deepseek, setDeepseek] = useState('')
  const [kimi, setKimi] = useState('')
  const [status, setStatus] = useState({ deepseek: false, kimi: false, encryption: true, claude: false, codex: false })
  const [notice, setNotice] = useState('')

  async function refresh(): Promise<void> {
    if (!bridge) return
    const secrets = await bridge.secretStatus()
    const cli = await bridge.cliStatus()
    setStatus({ ...secrets, claude: cli.claude.installed, codex: cli.codex.installed })
  }

  useEffect(() => {
    void refresh()
  }, [])

  if (!bridge) return <p className="empty">设置要在安装好的王子里保存。密钥不会写进浏览器。</p>

  return (
    <div>
      <p className="lede">命令行</p>
      <p className="meta">Claude Code：{status.claude ? '已安装' : '未安装'}</p>
      <p className="meta">Codex：{status.codex ? '已安装' : '未安装'}</p>
      <p className="empty">未安装时，打开终端安装对应的命令。装好后点下面的刷新。</p>
      <div className="actions"><button type="button" className="ghost" onClick={() => void refresh()}>刷新</button></div>
      <p className="lede">DeepSeek 密钥</p>
      <input className="secret" type="password" value={deepseek} placeholder={status.deepseek ? '已保存，输入新密钥可替换' : '粘贴 DeepSeek 密钥'} onChange={(event) => setDeepseek(event.target.value)} />
      <div className="actions">
        <button type="button" className="gold" onClick={() => void bridge.saveSecret('deepseek', deepseek).then(() => { setDeepseek(''); setNotice('DeepSeek 密钥已保存在这台电脑'); void refresh() }).catch((error: unknown) => setNotice(error instanceof Error ? error.message : '没有保存'))}>保存</button>
        <button type="button" className="ghost" onClick={() => void bridge.clearSecret('deepseek').then(() => { setNotice('已清除 DeepSeek 密钥'); void refresh() })}>清除</button>
      </div>
      <p className="lede">Kimi 密钥</p>
      <input className="secret" type="password" value={kimi} placeholder={status.kimi ? '已保存，输入新密钥可替换' : '粘贴 Kimi 密钥'} onChange={(event) => setKimi(event.target.value)} />
      <div className="actions">
        <button type="button" className="gold" onClick={() => void bridge.saveSecret('kimi', kimi).then(() => { setKimi(''); setNotice('Kimi 密钥已保存在这台电脑'); void refresh() }).catch((error: unknown) => setNotice(error instanceof Error ? error.message : '没有保存'))}>保存</button>
        <button type="button" className="ghost" onClick={() => void bridge.clearSecret('kimi').then(() => { setNotice('已清除 Kimi 密钥'); void refresh() })}>清除</button>
      </div>
      {!status.encryption ? <p className="banner error">这台系统没有可用的钥匙串，王子不会把密钥存成明文。</p> : <p className="empty">密钥只用系统钥匙串加密，留在这台电脑上。</p>}
      {notice ? <p className="banner notice">{notice}</p> : null}
    </div>
  )
}

import { classifyCommand, type CommandRisk } from './commands.ts'

export type ControlStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'awaiting-confirm'

export interface ControlState {
  status: ControlStatus
  pendingCommand: string | null
  risk: CommandRisk | null
  allowed: boolean
  log: string[]
}

export type ControlAction =
  | { type: 'start' }
  | { type: 'output'; text: string }
  | { type: 'tool'; command: string }
  | { type: 'pause' }
  | { type: 'continue' }
  | { type: 'stop' }
  | { type: 'allow' }
  | { type: 'deny' }
  | { type: 'follow-up'; text: string }

export function initialControl(): ControlState {
  return { status: 'idle', pendingCommand: null, risk: null, allowed: false, log: [] }
}

export function reduceControl(state: ControlState, action: ControlAction): ControlState {
  switch (action.type) {
    case 'start':
      if (state.status === 'running') return state
      return { ...state, status: 'running', pendingCommand: null, risk: null, allowed: false, log: [...state.log, '开始'] }
    case 'pause':
      if (state.status !== 'running') return state
      return { ...state, status: 'paused', log: [...state.log, '暂停'] }
    case 'continue':
      if (state.status !== 'paused') return state
      return { ...state, status: 'running', log: [...state.log, '继续'] }
    case 'stop':
      if (state.status === 'idle' || state.status === 'stopped') return state
      return { ...state, status: 'stopped', pendingCommand: null, log: [...state.log, '停止'] }
    case 'tool': {
      const risk = classifyCommand(action.command)
      if (risk === 'blocked') {
        return {
          ...state,
          status: 'stopped',
          pendingCommand: action.command,
          risk,
          allowed: false,
          log: [...state.log, `已拦截：${action.command}`],
        }
      }
      if (risk === 'confirm') {
        if (state.status !== 'running' && state.status !== 'paused') return state
        return {
          ...state,
          status: 'awaiting-confirm',
          pendingCommand: action.command,
          risk,
          allowed: false,
          log: [...state.log, `等待确认：${action.command}`],
        }
      }
      return { ...state, log: [...state.log, `执行：${action.command}`] }
    }
    case 'allow':
      if (state.status !== 'awaiting-confirm' || state.risk === 'blocked') return state
      return { ...state, status: 'running', allowed: true, log: [...state.log, `已允许：${state.pendingCommand ?? ''}`] }
    case 'deny':
      if (state.status !== 'awaiting-confirm') return state
      return { ...state, status: 'stopped', allowed: false, log: [...state.log, `已拒绝：${state.pendingCommand ?? ''}`] }
    case 'follow-up':
      if (state.status !== 'running' && state.status !== 'paused') return state
      return { ...state, log: [...state.log, `补充：${action.text}`] }
    case 'output':
      return { ...state, log: [...state.log, action.text] }
    default:
      return state
  }
}

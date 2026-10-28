import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('wangzi', {
  platform: process.platform,
  saveText: (defaultName: string, text: string) => ipcRenderer.invoke('file:save', defaultName, text),
  openText: () => ipcRenderer.invoke('file:open'),
  listSessions: () => ipcRenderer.invoke('sessions:list'),
  readSession: (filePath: string) => ipcRenderer.invoke('sessions:read', filePath),
  cliStatus: () => ipcRenderer.invoke('cli:status'),
  pickFolder: () => ipcRenderer.invoke('folder:pick'),
  startRun: (request: unknown) => ipcRenderer.invoke('run:start', request),
  controlRun: (action: string, text?: string) => ipcRenderer.invoke('run:control', action, text),
  secretStatus: () => ipcRenderer.invoke('secret:status'),
  saveSecret: (provider: string, value: string) => ipcRenderer.invoke('secret:save', provider, value),
  clearSecret: (provider: string) => ipcRenderer.invoke('secret:clear', provider),
  onSessions: (callback: (sessions: unknown) => void) => {
    const listener = (_event: unknown, sessions: unknown) => callback(sessions)
    ipcRenderer.on('sessions:changed', listener)
    return () => ipcRenderer.removeListener('sessions:changed', listener)
  },
  onRunEvent: (callback: (event: unknown) => void) => {
    const listener = (_event: unknown, payload: unknown) => callback(payload)
    ipcRenderer.on('run:event', listener)
    return () => ipcRenderer.removeListener('run:event', listener)
  },
})

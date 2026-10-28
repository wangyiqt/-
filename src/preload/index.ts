import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('wangzi', {
  platform: process.platform,
  saveText: (defaultName: string, text: string) => ipcRenderer.invoke('file:save', defaultName, text),
  openText: () => ipcRenderer.invoke('file:open'),
})

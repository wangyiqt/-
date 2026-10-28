import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function iconPath(): string | undefined {
  const candidates = [path.join(__dirname, '../icon.png'), path.join(__dirname, '../../build/icon.png')]
  return candidates.find((candidate) => fs.existsSync(candidate))
}

function createWindow(): void {
  const indexHtml = path.join(__dirname, '../renderer/index.html')
  if (!fs.existsSync(indexHtml)) {
    dialog.showErrorBox('王子', '界面文件缺失，请重新安装。')
    app.quit()
    return
  }
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#070707',
    title: '王子',
    autoHideMenuBar: true,
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  void window.loadFile(indexHtml)
}

ipcMain.handle('file:save', async (_event, defaultName: string, text: string) => {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: '王子分享', extensions: ['json'] }],
  })
  if (result.canceled || !result.filePath) return null
  await fs.promises.writeFile(result.filePath, text, 'utf8')
  return result.filePath
})

ipcMain.handle('file:open', async () => {
  const result = await dialog.showOpenDialog({
    filters: [{ name: '王子分享', extensions: ['json'] }],
    properties: ['openFile'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  return fs.promises.readFile(result.filePaths[0], 'utf8')
})

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.whenReady().then(() => {
    createWindow()
    app.on('second-instance', () => {
      const [window] = BrowserWindow.getAllWindows()
      if (!window) {
        createWindow()
        return
      }
      if (window.isMinimized()) window.restore()
      window.focus()
    })
  })
  app.on('window-all-closed', () => {
    app.quit()
  })
}

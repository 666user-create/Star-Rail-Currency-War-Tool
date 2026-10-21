import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import path from 'path'
import { Repository } from './repository'
import { loadSettings, saveSettings } from './config'
import type { AppSettings } from '@shared/types'

let petWindow: BrowserWindow | null = null
let panelWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let repo: Repository
let settings: AppSettings
let recordStartedAt: number | null = null
let dragTimer: ReturnType<typeof setInterval> | null = null

function preloadPath(): string {
  return path.join(__dirname, '../preload/index.js')
}

function loadPage(win: BrowserWindow, page: string): void {
  const url = process.env['ELECTRON_RENDERER_URL']
  if (url) win.loadURL(`${url}/${page}.html`)
  else win.loadFile(path.join(__dirname, `../renderer/${page}.html`))
}

function isOnScreen(x: number, y: number): boolean {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea
    return x >= a.x - 200 && x <= a.x + a.width - 60 && y >= a.y - 100 && y <= a.y + a.height - 60
  })
}

function createPetWindow(): void {
  petWindow = new BrowserWindow({
    width: 260,
    height: 300,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false, // 位置完全由我们自己管（拖动逻辑）
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: { preload: preloadPath(), contextIsolation: true, nodeIntegration: false, sandbox: false }
  })
  if (settings.petX != null && settings.petY != null && isOnScreen(settings.petX, settings.petY)) {
    petWindow.setPosition(settings.petX, settings.petY)
  } else {
    const { workArea } = screen.getPrimaryDisplay()
    petWindow.setPosition(workArea.x + workArea.width - 320, workArea.y + workArea.height - 340)
  }
  loadPage(petWindow, 'pet')
  // 透明窗口的 ready-to-show 不保证触发（已知 Electron 坑）：双保险立即显示 + 渲染诊断日志
  const show = () => petWindow?.showInactive()
  petWindow.once('ready-to-show', show)
  setTimeout(show, 800)
  petWindow.webContents.on('did-fail-load', (_e, code, desc) => console.error('[renderer-load]', code, desc))
  petWindow.webContents.on('render-process-gone', (_e, d) => console.error('[renderer-gone]', d.reason))
  petWindow.webContents.on('console-message', (...args: unknown[]) => {
    const details = args.find((a) => a && typeof a === 'object' && 'message' in (a as object)) as { message?: string } | undefined
    const msg = details?.message ?? String(args[1] ?? '')
    if (msg) console.error('[renderer]', msg)
  })
  petWindow.on('closed', () => { petWindow = null; app.quit() })
}

function createPanelWindow(): void {
  panelWindow = new BrowserWindow({
    width: 900,
    height: 640,
    frame: false,
    resizable: false,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0d1226',
    webPreferences: { preload: preloadPath(), contextIsolation: true, nodeIntegration: false, sandbox: false }
  })
  loadPage(panelWindow, 'panel')
  panelWindow.on('closed', () => { panelWindow = null })
}

function createSettingsWindow(): void {
  if (settingsWindow) { settingsWindow.focus(); return }
  settingsWindow = new BrowserWindow({
    width: 460,
    height: 240,
    resizable: false,
    autoHideMenuBar: true,
    title: '设置',
    webPreferences: { preload: preloadPath(), contextIsolation: true, nodeIntegration: false, sandbox: false }
  })
  loadPage(settingsWindow, 'settings')
  settingsWindow.on('closed', () => { settingsWindow = null })
}

function togglePanel(): void {
  if (!panelWindow) createPanelWindow()
  if (!petWindow || !panelWindow) return
  if (panelWindow.isVisible()) { panelWindow.hide(); return }
  // 弹在桌宠旁边：优先右侧，放不下放左侧
  const pb = petWindow.getBounds()
  const { workArea } = screen.getPrimaryDisplay()
  const pw = panelWindow.getBounds().width
  const ph = panelWindow.getBounds().height
  let x = pb.x + pb.width + 12
  if (x + pw > workArea.x + workArea.width) x = pb.x - pw - 12
  const y = Math.min(Math.max(pb.y - 60, workArea.y), workArea.y + workArea.height - ph)
  panelWindow.setPosition(x, y)
  panelWindow.show()
  panelWindow.focus()
}

function setupIpc(): void {
  ipcMain.handle('record:list', (_e, limit?: number) => repo.list(limit))
  ipcMain.handle('record:get', (_e, id: number) => repo.byId(id))
  ipcMain.handle('stats:overview', () => repo.overview())
  ipcMain.handle('stats:lineups', () => repo.lineupStats())
  ipcMain.handle('stats:rankCurve', () => repo.rankCurve())
  ipcMain.handle('stats:durationHist', () => repo.durationHistogram())
  ipcMain.handle('stats:hourHist', () => repo.hourHistogram())

  ipcMain.handle('record:isRecording', () => recordStartedAt)
  ipcMain.handle('record:start', () => {
    recordStartedAt = Date.now()
    return recordStartedAt
  })
  // 阶段1：结束记录时写入一条演示对局（真实 OCR 在阶段2接入同一条写入路径）
  ipcMain.handle('record:end', () => {
    if (recordStartedAt == null) return null
    const startedAt = recordStartedAt
    recordStartedAt = null
    const endedAt = Date.now()
    const durationSec = Math.max(30, Math.round((endedAt - startedAt) / 1000))
    const lineups = [
      ['仙舟', '追击'], ['狼狩', '燃血'], ['战技点', '银河学者'],
      ['星核猎手', '追击'], ['燃血', '战技点']
    ]
    return repo.insert({
      startedAt, endedAt, durationSec,
      result: Math.random() < 0.62 ? 'win' : 'loss',
      lineup: lineups[Math.floor(Math.random() * lineups.length)],
      rankChange: 0,
      season: '零和博弈',
      source: 'demo',
      screenshotPath: null,
      confidence: null,
      note: '手动记录（演示）'
    })
  })

  ipcMain.handle('game:launch', () => {
    if (!settings.gamePath) return false
    try {
      shell.openPath(settings.gamePath)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('settings:get', () => settings)
  ipcMain.handle('settings:set', (_e, patch: Partial<AppSettings>) => {
    settings = { ...settings, ...patch }
    saveSettings(settings)
    return settings
  })

  ipcMain.on('panel:toggle', () => togglePanel())
  ipcMain.on('settings:open', () => createSettingsWindow())
  ipcMain.on('app:quit', () => app.quit())

  // 自定义拖动：渲染层只报开始/结束，主进程轮询光标移动窗口（保留点击能力）
  ipcMain.on('pet:drag', (_e, action: 'start' | 'end') => {
    if (!petWindow) return
    if (action === 'start' && !dragTimer) {
      const cursor = screen.getCursorScreenPoint()
      const b = petWindow.getBounds()
      const offX = cursor.x - b.x
      const offY = cursor.y - b.y
      dragTimer = setInterval(() => {
        if (!petWindow) return
        const c = screen.getCursorScreenPoint()
        petWindow.setPosition(c.x - offX, c.y - offY)
      }, 16)
    } else if (action === 'end' && dragTimer) {
      clearInterval(dragTimer)
      dragTimer = null
      const b = petWindow.getBounds()
      settings.petX = b.x
      settings.petY = b.y
      saveSettings(settings)
    }
  })
}

app.whenReady().then(async () => {
  settings = loadSettings()
  repo = await Repository.create()
  setupIpc()
  createPetWindow()
  createPanelWindow() // 预创建，保证面板秒开；用时再 show
})

app.on('window-all-closed', () => app.quit())

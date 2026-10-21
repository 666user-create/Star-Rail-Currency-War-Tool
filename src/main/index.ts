import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import fs from 'fs'
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
let petShapeMode: 'full' | 'pet' = 'pet'

// 桌宠命中形状（176×212 窗口，窗口相对坐标）：
// 'pet' 只让本体可见区接收鼠标，透明角落全部点穿到下层窗口；'full' 放开整窗（叠加层显示时）
function applyPetShape(): void {
  if (!petWindow || typeof petWindow.setShape !== 'function') return
  if (petShapeMode === 'full') {
    petWindow.setShape([{ x: 0, y: 0, width: 176, height: 212 }])
    return
  }
  petWindow.setShape([
    { x: 24, y: 34, width: 128, height: 148 },
    { x: 116, y: 146, width: 46, height: 46 }
  ])
}

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

// 夹紧到任一显示器工作区内，保证桌宠始终至少有一部分可见（防"拖出屏外消失"）
function clampToScreens(x: number, y: number, w: number, h: number): { x: number; y: number } {
  const displays = screen.getAllDisplays()
  let best: { x: number; y: number } | null = null
  let bestDist = Infinity
  for (const d of displays) {
    const a = d.workArea
    if (x >= a.x - w + 80 && x <= a.x + a.width - 80 &&
        y >= a.y - h + 100 && y <= a.y + a.height - 60) {
      return { x, y } // 已合法
    }
    const cx = Math.min(Math.max(x, a.x - w + 80), a.x + a.width - 80)
    const cy = Math.min(Math.max(y, a.y - h + 100), a.y + a.height - 60)
    const dist = (cx - x) * (cx - x) + (cy - y) * (cy - y)
    if (dist < bestDist) { bestDist = dist; best = { x: cx, y: cy } }
  }
  return best ?? { x, y }
}

function createPetWindow(): void {
  petWindow = new BrowserWindow({
    width: 176,
    height: 212,
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
  if (settings.petX != null && settings.petY != null) {
    // 恢复位置也过夹紧：旧版本若存过屏外坐标，直接拉回可见区
    const p = clampToScreens(settings.petX, settings.petY, 176, 212)
    petWindow.setPosition(Math.round(p.x), Math.round(p.y))
  } else {
    const { workArea } = screen.getPrimaryDisplay()
    petWindow.setPosition(workArea.x + workArea.width - 320, workArea.y + workArea.height - 340)
  }
  loadPage(petWindow, 'pet')
  // 透明窗口的 ready-to-show 不保证触发（已知 Electron 坑）：双保险立即显示 + 渲染诊断日志
  const show = () => {
    petWindow?.showInactive()
    applyPetShape()
  }
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

  // 官方素材形象：assets/pet/sprite.png（不入 git，release/本地分发），存在即返回 data URL
  let spriteCache: string | null | undefined
  ipcMain.handle('pet:sprite', () => {
    if (spriteCache !== undefined) return spriteCache
    const p = path.join(app.getAppPath(), 'assets', 'pet', 'sprite.png')
    try {
      spriteCache = fs.existsSync(p)
        ? 'data:image/png;base64,' + fs.readFileSync(p).toString('base64')
        : null
    } catch {
      spriteCache = null
    }
    return spriteCache
  })

  // 官方解包模型：assets/official_pet/（本地素材，永不入 git）+ Cool/Warm Ramp 色带
  let officialCache: { obj: string; tex: string; cool: string; warm: string } | null | undefined
  ipcMain.handle('pet:officialModel', () => {
    if (officialCache !== undefined) return officialCache
    const dir = path.join(app.getAppPath(), 'assets', 'official_pet')
    try {
      const objPath = path.join(dir, 'pet03.obj')
      const texPath = path.join(dir, 'pet03_color.png')
      const coolPath = path.join(dir, 'pet03_cool.png')
      const warmPath = path.join(dir, 'pet03_warm.png')
      officialCache =
        fs.existsSync(objPath) && fs.existsSync(texPath)
          ? {
              obj: fs.readFileSync(objPath, 'utf8'),
              tex: fs.readFileSync(texPath).toString('base64'),
              cool: fs.existsSync(coolPath) ? fs.readFileSync(coolPath).toString('base64') : '',
              warm: fs.existsSync(warmPath) ? fs.readFileSync(warmPath).toString('base64') : ''
            }
          : null
    } catch {
      officialCache = null
    }
    return officialCache
  })

  ipcMain.on('panel:toggle', () => togglePanel())
  ipcMain.on('settings:open', () => createSettingsWindow())
  ipcMain.on('app:quit', () => app.quit())

  // 穿透优化：默认只让桌宠本体区域接收鼠标（其余透明区可点穿到下层窗口）；
  // 气泡/计时/菜单等叠加层可见时由渲染层切到 'full' 放开整窗
  ipcMain.on('pet:shape', (_e, mode: 'full' | 'pet') => {
    petShapeMode = mode
    applyPetShape()
  })

  // 自定义拖动：渲染层报 start/move/end，主进程轮询光标移动窗口（保留点击能力）
  // 防"消失"三件套：①每帧夹紧在屏内 ②move 心跳超时终止幽灵拖动（pointerup 丢失时）③保存位置先校验
  let lastDragMove = 0
  const endDrag = (): void => {
    if (!dragTimer || !petWindow) return
    clearInterval(dragTimer)
    dragTimer = null
    const b = petWindow.getBounds()
    if (isOnScreen(b.x, b.y)) {
      settings.petX = b.x
      settings.petY = b.y
      saveSettings(settings)
    }
  }
  ipcMain.on('pet:drag', (_e, action: 'start' | 'move' | 'end') => {
    if (!petWindow) return
    // 'start'，或拖动中 cursor 暂离窗口超时被停、心跳恢复（'move' 且无计时器）→ 按当前光标重启轮询
    if ((action === 'start' || (action === 'move' && !dragTimer)) && !dragTimer) {
      const cursor = screen.getCursorScreenPoint()
      const b = petWindow.getBounds()
      const offX = cursor.x - b.x
      const offY = cursor.y - b.y
      lastDragMove = Date.now()
      dragTimer = setInterval(() => {
        if (!petWindow) { dragTimer = null; return }
        // 心跳超时：鼠标移出小窗口后释放 → pointerup 丢失 → 幽灵拖动自动终止
        if (Date.now() - lastDragMove > 1200) { endDrag(); return }
        const c = screen.getCursorScreenPoint()
        const nb = petWindow.getBounds()
        const p = clampToScreens(c.x - offX, c.y - offY, nb.width, nb.height)
        petWindow.setPosition(Math.round(p.x), Math.round(p.y))
      }, 16)
    } else if (action === 'move') {
      lastDragMove = Date.now()
    } else if (action === 'end') {
      endDrag()
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

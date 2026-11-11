import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Menu, powerMonitor, screen, shell, Tray } from 'electron'
import fs from 'fs'
import path from 'path'
import { Repository } from './repository'
import { loadSettings, saveSettings } from './config'
import { PetBubbleController } from './petBubble'
import { PetTimerController } from './petTimer'
import { createTrayIcon } from './trayIcon'
import { checkForUpdate, markNotified, openDownloadPage, wasNotified } from './updateCheck'
import { TrayMenuController } from './trayMenu'
import { createWizardWindow, hasCompletedWizard, setupWizardIpc } from './wizard'
import { defaultSeason } from '../shared/seasons'
import { normalizeSettings } from '../shared/petPreferences'
import { validateDraftInput } from '../shared/recordingValidation'
import { RecordingStore } from './recordingStore'
import { recognizeRecord } from './recognizeRecord'
import { captureDisplay, importScreenshotBytes, importScreenshotFile, screenshotDataUrl } from './recordingCapture'
import type { AppSettings, DraftInput, Match, PetBubbleContent, RecordingChange, RecordingDraft, RecordFields } from '@shared/types'

let petWindow: BrowserWindow | null = null
let panelWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let repo: Repository
let settings: AppSettings
let recordStartedAt: number | null = null
let dragTimer: ReturnType<typeof setInterval> | null = null
let petShapeRects: import('@shared/types').PetRect[] | null = null
let lastHealAt = 0
let petBubble: PetBubbleController | null = null
let petTimer: PetTimerController | null = null
let petTray: Tray | null = null
let trayMenu: TrayMenuController | null = null
let petHidden = false
let lastVisible: boolean | null = null
/** 上次自动恢复显示的时间戳，避免可见性巡检反复 showInactive 引起窗口闪动 */
let lastAutoShowAt = 0
let finishPetDrag: (() => void) | null = null
let recordingStore: RecordingStore
let captureInProgress = false
let endPending: Promise<RecordingDraft | null> | null = null
const draftJobs = new Map<string, Promise<RecordingDraft>>()
/**
 * 截图存放目录优先级：
 * 1) 用户在设置里指定的目录（settings.screenshotDir）
 * 2) 项目文件夹下的 data/screenshots（防误删/重装丢失，用户可直接找到）
 * 3) 打包后 asar 只读，退回 userData
 */
const screenshotDirectory = (): string => {
  const custom = settings?.screenshotDir?.trim()
  if (custom) return custom
  const appPath = app.getAppPath()
  if (appPath.includes('.asar')) return path.join(app.getPath('userData'), 'screenshots')
  return path.join(appPath, 'data', 'screenshots')
}

/** 把旧位置（userData/screenshots）的历史截图迁到项目目录，一次性；失败不阻断启动。 */
function migrateScreenshots(): void {
  const target = screenshotDirectory()
  const legacy = path.join(app.getPath('userData'), 'screenshots')
  if (path.resolve(target) === path.resolve(legacy)) return
  try {
    if (!fs.existsSync(legacy)) return
    fs.mkdirSync(target, { recursive: true })
    let moved = 0
    for (const name of fs.readdirSync(legacy)) {
      const from = path.join(legacy, name)
      const to = path.join(target, name)
      if (!fs.statSync(from).isFile() || fs.existsSync(to)) continue
      try { fs.copyFileSync(from, to); moved++ } catch (error) { console.error('[screenshot-migrate]', name, error) }
    }
    if (moved) console.log(`[screenshot-migrate] 已迁移 ${moved} 张历史截图到 ${target}`)
  } catch (error) { console.error('[screenshot-migrate]', error) }
}

// 默认区域只覆盖本体；可见秒表使用独立窗口，透明角落点穿到下层窗口。
const DEFAULT_SHAPE = [
  { x: 24, y: 34, width: 128, height: 148 }
]

// 区域同时裁剪绘制（SetWindowRgn 语义）：矩形必须罩住全部可见内容，
// 渲染层动态上报本体/蹦跳头顶/菜单，这里统一夹进 176×212；气泡使用独立点穿窗口。
function shapeRects(): Array<{ x: number; y: number; width: number; height: number }> {
  const rects = petShapeRects ?? DEFAULT_SHAPE
  const out: Array<{ x: number; y: number; width: number; height: number }> = []
  for (const r of rects) {
    const x = Math.max(0, Math.min(r.x, 176))
    const y = Math.max(0, Math.min(r.y, 212))
    const w = Math.max(0, Math.min(r.x + r.width, 176) - x)
    const h = Math.max(0, Math.min(r.y + r.height, 212) - y)
    if (w > 0 && h > 0) out.push({ x, y, width: w, height: h })
  }
  return out.length > 0 ? out : DEFAULT_SHAPE
}

function applyPetShape(): void {
  if (!petWindow || typeof petWindow.setShape !== 'function') return
  ensurePetSize() // 区域坐标依赖窗口尺寸：先自愈再算区域
  petWindow.setShape(shapeRects())
}

// 尺寸自愈：窗口曾被外部改成 383×408（原因未确证），setShape 区域/夹紧/布局全部错位 → 模型被裁没。
// min/max 尺寸约束（创建参数）+ resize 监听 + 关键路径校验三重兜底；每次纠正都留痕进 dev 日志。
const PET_W = 176
const PET_H = 212
function ensurePetSize(): void {
  if (!petWindow || petWindow.isDestroyed()) return
  // topmost 位可能被外部窗口活动清掉（实测掉到 Z4/Z5 被全屏 Edge 盖住）→ 每次校验时用高层级重申
  petWindow.setAlwaysOnTop(true, 'screen-saver')
  const b = petWindow.getBounds()
  const dw = Math.abs(b.width - PET_W)
  const dh = Math.abs(b.height - PET_H)
  if (dw <= 1 && dh <= 1) return // DPI 取整抖动（177↔176）容忍
  // 拖动中 setPosition 的 DIP↔物理取整会让读数短暂 178×214：小偏差节流 500ms，避免每 tick
  // setBounds 打成 resize 风暴；大偏差（外部真改尺寸，如 383×408）立即纠正
  const now = Date.now()
  if (dw <= 6 && dh <= 6 && now - lastHealAt < 500) return
  lastHealAt = now
  console.error(`[pet] size self-heal ${b.width}x${b.height} -> ${PET_W}x${PET_H} @${b.x},${b.y}`)
  petWindow.setBounds({ x: b.x, y: b.y, width: PET_W, height: PET_H })
  petWindow.setShape(shapeRects())
}

function preloadPath(): string {
  return path.join(__dirname, '../preload/index.js')
}

function loadPage(win: BrowserWindow, page: string): void {
  const url = process.env['ELECTRON_RENDERER_URL']
  if (url) win.loadURL(`${url}/${page}.html`)
  else win.loadFile(path.join(__dirname, `../renderer/${page}.html`))
}

/**
 * 坐标是否可接受：要求窗口**至少 60% 面积**落在某个显示器工作区内。
 * 之前用 `x >= a.x - 200` 这种宽松边界，会让 x=-20 这类大半截在屏幕外的坏值被判为合法，
 * 于是每次启动都从坏坐标恢复、用户永远看不到桌宠。
 */
function isOnScreen(x: number, y: number, w = PET_W, h = PET_H): boolean {
  const area = w * h
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea
    const overlapW = Math.min(x + w, a.x + a.width) - Math.max(x, a.x)
    const overlapH = Math.min(y + h, a.y + a.height) - Math.max(y, a.y)
    if (overlapW <= 0 || overlapH <= 0) return false
    return (overlapW * overlapH) / area >= 0.6
  })
}

/**
 * 桌宠贴着工作区边缘时的内缩量（逻辑像素）。
 *
 * 为什么必须留这个余量：DPI 缩放会把逻辑坐标换算成物理像素后取整（1.25 倍时
 * 212 → 265），贴边时几像素的取整误差就会让窗口底部压到任务栏下面，
 * 表现为「桌宠只剩一条边露出来」或「完全看不见」——实测踩过 petY=600 时底部 812，
 * 工作区底部 816，物理上只差 1px 就被任务栏吃掉。
 */
const EDGE_MARGIN = 10

// 夹紧到最近的显示器工作区内，保证桌宠完整可见（防「拖出屏外消失」）
function clampToScreens(x: number, y: number, w: number, h: number): { x: number; y: number } {
  const displays = screen.getAllDisplays()
  // 纵深防御：非法输入直接回落到主屏右下角的安全位置，
  // 否则 setPosition(NaN) 会让窗口彻底消失且无法再拖回来。
  const fallback = (): { x: number; y: number } => {
    const a = screen.getPrimaryDisplay().workArea
    return {
      x: Math.round(a.x + Math.max(EDGE_MARGIN, a.width - PET_W - EDGE_MARGIN)),
      y: Math.round(a.y + Math.max(EDGE_MARGIN, a.height - PET_H - EDGE_MARGIN))
    }
  }
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return fallback()
  }
  let best: { x: number; y: number } | null = null
  let bestDist = Infinity
  for (const d of displays) {
    const a = d.workArea
    // 可用范围收进 EDGE_MARGIN，避免贴边被任务栏/屏幕边缘吃掉
    const minX = a.x + EDGE_MARGIN
    const minY = a.y + EDGE_MARGIN
    const maxX = Math.max(minX, a.x + a.width - w - EDGE_MARGIN)
    const maxY = Math.max(minY, a.y + a.height - h - EDGE_MARGIN)
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
      return { x, y }
    }
    const cx = Math.min(Math.max(x, minX), maxX)
    const cy = Math.min(Math.max(y, minY), maxY)
    const dist = (cx - x) * (cx - x) + (cy - y) * (cy - y)
    if (dist < bestDist) { bestDist = dist; best = { x: cx, y: cy } }
  }
  return best ?? fallback()
}

function recoverPetPosition(): void {
  if (!petWindow || petWindow.isDestroyed()) return
  const bounds = petWindow.getBounds()
  const position = clampToScreens(bounds.x, bounds.y, bounds.width, bounds.height)
  if (bounds.x !== Math.round(position.x) || bounds.y !== Math.round(position.y)) {
    petWindow.setPosition(Math.round(position.x), Math.round(position.y))
  }
  if (!petHidden && petWindow.isVisible()) applyPetShape()
  petTimer?.refreshPosition()
  petBubble?.refreshPosition()
}

function petIsVisible(): boolean {
  return !!petWindow && !petWindow.isDestroyed() && !petHidden && !captureInProgress && petWindow.isVisible() && !petWindow.isMinimized()
}

function publishPetVisibility(): void {
  const visible = petIsVisible()
  if (visible === lastVisible) return
  lastVisible = visible
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('pet:visibility', visible)
  }
  updateTrayMenu()
}

function setPetVisible(visible: boolean): void {
  if (!petWindow || petWindow.isDestroyed()) return
  if (!visible && (!petTray || petTray.isDestroyed())) return // 必须保留可恢复入口。
  petHidden = !visible
  if (visible) {
    recoverPetPosition()
    if (petWindow.isMinimized()) petWindow.restore()
    if (!captureInProgress) petWindow.showInactive()
    applyPetShape()
  } else {
    finishPetDrag?.()
    petWindow.hide()
  }
  publishPetVisibility()
  petTimer?.refreshPosition()
  petBubble?.refreshPosition()
  updateTrayMenu()
}

function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const previousDir = settings ? screenshotDirectory() : null
  const next = normalizeSettings({ ...settings, ...patch })
  saveSettings(next)
  settings = next
  // 截图目录变更：把已有截图与数据库/草稿里的路径一起迁过去，避免断链
  const nextDir = screenshotDirectory()
  if (previousDir && path.resolve(previousDir) !== path.resolve(nextDir)) {
    try { migrateScreenshotsTo(previousDir, nextDir) } catch (error) { console.error('[screenshot-move]', error) }
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('settings:changed', settings)
  }
  updateTrayMenu()
  return settings
}

/** 把截图从旧目录搬到新目录，并重写数据库/草稿中的绝对路径。 */
function migrateScreenshotsTo(fromDir: string, toDir: string): void {
  fs.mkdirSync(toDir, { recursive: true })
  let moved = 0
  if (fs.existsSync(fromDir)) {
    for (const name of fs.readdirSync(fromDir)) {
      const from = path.join(fromDir, name)
      try {
        if (!fs.statSync(from).isFile()) continue
        const to = path.join(toDir, name)
        if (fs.existsSync(to)) continue
        fs.copyFileSync(from, to)
        moved++
      } catch (error) { console.error('[screenshot-move]', name, error) }
    }
  }
  let records = 0
  try { records = repo.rewriteScreenshotPaths(fromDir, toDir) } catch (error) { console.error('[screenshot-move] db', error) }
  let drafts = 0
  try {
    for (const draft of recordingStore.list()) {
      if (!draft.screenshotPath || !path.isAbsolute(draft.screenshotPath)) continue
      if (path.resolve(path.dirname(draft.screenshotPath)) !== path.resolve(fromDir)) continue
      recordingStore.update(draft.id, { screenshotPath: path.join(toDir, path.basename(draft.screenshotPath)) })
      drafts++
    }
  } catch (error) { console.error('[screenshot-move] drafts', error) }
  console.log(`[screenshot-move] ${fromDir} -> ${toDir}: 文件${moved} 记录${records} 草稿${drafts}`)
}

function updateTrayMenu(): void {
  if (!petTray || petTray.isDestroyed()) return
  petTray.setToolTip(`货币战争桌宠${settings.quietMode ? ' · 安静模式' : ''}${recordStartedAt !== null ? ' · 记录中' : ''}`)
  // 改用自绘菜单（深蓝金风格），不再使用 Windows 原生白底菜单
  trayMenu?.update({ petHidden, quietMode: settings.quietMode, recording: recordStartedAt !== null })
}

function createTray(): void {
  petTray = new Tray(createTrayIcon())
  // 自绘托盘菜单（替代 Windows 原生白底菜单）
  trayMenu = new TrayMenuController(preloadPath(), loadPage, onTrayMenuAction)
  petTray.on('double-click', () => setPetVisible(true))
  // 左键/右键都弹出菜单（原生菜单被替换为自绘窗口）
  petTray.on('click', () => trayMenu?.show(petTray!))
  petTray.on('right-click', () => trayMenu?.show(petTray!))
  updateTrayMenu()
}

/** 处理自绘托盘菜单发出的动作。 */
function onTrayMenuAction(action: string): void {
  if (action === 'toggle-pet') { setPetVisible(petHidden); return }
  if (action === 'toggle-quiet') {
    try { updateSettings({ quietMode: !settings.quietMode }) } catch (error) { console.error('[tray]', error); updateTrayMenu() }
    return
  }
  if (action === 'open-panel') { showPanel(); return }
  if (action === 'open-settings') { createSettingsWindow(); return }
  if (action === 'quit') { app.quit() }
}

function createPetWindow(): void {
  petWindow = new BrowserWindow({
    width: 176,
    height: 212,
    // 尺寸硬锁：外部（键盘吸附/窗口工具）改尺寸会被 DefWindowProc 按 min/max 夹回
    minWidth: 176,
    maxWidth: 176,
    minHeight: 212,
    maxHeight: 212,
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
  // 兜底自愈：任何路径改了尺寸（min/max 拦不住的）→ 拉回 + 重打区域 + 留痕
  petWindow.on('resize', () => ensurePetSize())
  petWindow.on('show', publishPetVisibility)
  petWindow.on('hide', publishPetVisibility)
  petWindow.on('minimize', publishPetVisibility)
  petWindow.on('restore', publishPetVisibility)
  // 位置恢复必须严格校验：config.json 可能被手工改坏（NaN / 字符串 / Infinity），
  // 而 setPosition(NaN, NaN) 会把窗口丢到未定义位置，表现为「桌宠彻底消失」。
  const savedX = typeof settings.petX === 'number' && Number.isFinite(settings.petX) ? settings.petX : null
  const savedY = typeof settings.petY === 'number' && Number.isFinite(settings.petY) ? settings.petY : null
  if (savedX != null && savedY != null) {
    // 恢复位置也过夹紧：旧版本若存过屏外坐标，直接拉回可见区（按真实窗口尺寸算）
    const cur = petWindow.getBounds()
    const p = clampToScreens(savedX, savedY, cur.width, cur.height)
    petWindow.setPosition(Math.round(p.x), Math.round(p.y))
  } else {
    const { workArea } = screen.getPrimaryDisplay()
    petWindow.setPosition(workArea.x + workArea.width - 320, workArea.y + workArea.height - 340)
  }
  petBubble = new PetBubbleController(petWindow, preloadPath(), loadPage, () => petTimer?.getBounds() ?? null)
  petTimer = new PetTimerController(petWindow, preloadPath(), loadPage, () => petBubble?.refreshPosition())
  petTimer.setRecording(recordStartedAt)
  loadPage(petWindow, 'pet')
  // 透明窗口的 ready-to-show 不保证触发（已知 Electron 坑）：双保险立即显示 + 渲染诊断日志
  const show = () => {
    if (petHidden || captureInProgress || !petWindow || petWindow.isDestroyed()) return
    ensurePetSize()
    petWindow?.showInactive()
    applyPetShape()
  }
  petWindow.once('ready-to-show', show)
  setTimeout(show, 800)
  petWindow.webContents.on('did-fail-load', (_e, code, desc) => console.error('[renderer-load]', code, desc))
  /**
   * 渲染进程崩溃后自动恢复。
   *
   * 之前只打日志不恢复：崩溃后窗口还在但内容是白屏，用户看到的就是「桌宠突然消失」。
   * 常见诱因是 GPU 驱动不稳定导致 WebGL 上下文丢失（Three.js 渲染直接停摆）。
   * 这里做指数退避重载：1s → 2s → 4s，最多 3 次，避免崩溃循环把 CPU 打满。
   */
  let petReloadAttempts = 0
  petWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[renderer-gone]', details.reason)
    if (!petWindow || petWindow.isDestroyed()) return
    if (details.reason === 'clean-exit') return
    if (petReloadAttempts >= 3) {
      console.error('[renderer-gone] 已连续崩溃 3 次，停止自动重载')
      return
    }
    const delay = 1000 * 2 ** petReloadAttempts
    petReloadAttempts++
    console.error(`[renderer-gone] ${delay}ms 后尝试第 ${petReloadAttempts} 次重载`)
    setTimeout(() => {
      if (!petWindow || petWindow.isDestroyed()) return
      try { petWindow.reload() } catch (error) { console.error('[renderer-reload]', error) }
    }, delay)
  })
  // 页面成功加载后清零重试计数（说明恢复成功了）
  petWindow.webContents.on('did-finish-load', () => { petReloadAttempts = 0 })
  petWindow.webContents.on('console-message', (...args: unknown[]) => {
    const details = args.find((a) => a && typeof a === 'object' && 'message' in (a as object)) as { message?: string } | undefined
    const msg = details?.message ?? String(args[1] ?? '')
    if (msg) console.error('[renderer]', msg)
  })
  petWindow.on('closed', () => { petWindow = null; app.quit() })
  // 周期兜底：全屏应用/覆盖层可能随时清掉 topmost 位或改尺寸，5s 巡检一次。
  // setAlwaysOnTop(true) 在内部状态已为 true 时是空操作（实测掉到 Z4 被盖）→ 高层级 + moveTop 真正抬回
  setInterval(() => {
    if (!petWindow || petWindow.isDestroyed()) return
    // 可见性自愈：用户没有主动隐藏（petHidden=false）但窗口不可见时，
    // 说明被外部因素藏起来了（截图流程异常退出、系统事件等）→ 自动恢复。
    // 注意跳过「正在截图」这种合法隐藏。
    if (!petHidden && !captureInProgress && !petWindow.isVisible()) {
      const now = Date.now()
      if (now - lastAutoShowAt > 5000) {
        lastAutoShowAt = now
        console.error('[pet] visibility self-heal: 窗口意外不可见，恢复显示')
        try {
          if (petWindow.isMinimized()) petWindow.restore()
          petWindow.showInactive()
          applyPetShape()
          publishPetVisibility()
        } catch (error) { console.error('[pet] auto-show failed', error) }
      }
      return
    }
    if (!petIsVisible()) return
    ensurePetSize()
    // 位置自愈：外部程序/系统缩放变化可能把窗口挪到屏外或压到任务栏下，
    // 这里每 5 秒校验一次并拉回安全区（只动位置，不动尺寸）。
    const b = petWindow.getBounds()
    const safe = clampToScreens(b.x, b.y, b.width, b.height)
    if (Math.round(safe.x) !== b.x || Math.round(safe.y) !== b.y) {
      console.error(`[pet] position self-heal ${b.x},${b.y} -> ${Math.round(safe.x)},${Math.round(safe.y)}`)
      petWindow.setPosition(Math.round(safe.x), Math.round(safe.y))
    }
    petWindow.setAlwaysOnTop(true, 'screen-saver')
    petWindow.moveTop()
    petTimer?.refreshPosition()
    petBubble?.refreshPosition()
  }, 5000)
}

function createPanelWindow(): void {
  panelWindow = new BrowserWindow({
    width: 1020,
    height: 760,
    minWidth: 820,
    minHeight: 560,
    frame: false,
    resizable: true,
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
    width: 480,
    height: 540,
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
  showPanel()
}

function showPanel(): void {
  if (!panelWindow) createPanelWindow()
  if (!petWindow || !panelWindow || captureInProgress) return
  // 弹在桌宠所在显示器，尺寸和位置都夹紧，保证小屏能看到确认按钮。
  const pb = petWindow.getBounds()
  const { workArea } = screen.getDisplayMatching(pb)
  const pw = Math.min(panelWindow.getBounds().width, workArea.width)
  const ph = Math.min(panelWindow.getBounds().height, workArea.height)
  panelWindow.setMinimumSize(Math.min(820, workArea.width), Math.min(560, workArea.height))
  let x = pb.x + pb.width + 12
  if (x + pw > workArea.x + workArea.width) x = pb.x - pw - 12
  const y = Math.min(Math.max(pb.y - 60, workArea.y), workArea.y + workArea.height - ph)
  x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - pw))
  panelWindow.setBounds({ x, y, width: pw, height: ph })
  panelWindow.show()
  panelWindow.focus()
}

function publishRecording(match: Match | null = null): void {
  petTimer?.setRecording(recordStartedAt)
  const change: RecordingChange = { startedAt: recordStartedAt, match }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('record:changed', change)
  }
  updateTrayMenu()
}

function publishRecords(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('records:changed')
  }
}

function requireDraft(id: string): RecordingDraft {
  const draft = typeof id === 'string' ? recordingStore.get(id) : null
  if (!draft) throw new Error('这份草稿已处理，请刷新记录列表')
  return draft
}

/**
 * 草稿的空白字段。
 *
 * 赛季必须给默认值：截图导入没有 startedAt 时原来填空字符串，
 * 导致这些记录不属于任何赛季，面板按赛季隔离后就再也看不到它们。
 * 有 startedAt 的草稿（秒表记录）用起点时间推赛季更准。
 */
function blankRecordFields(draft?: RecordingDraft): RecordFields {
  const overrides = { starts: settings.seasonStarts ?? {}, ends: settings.seasonEnds ?? {} }
  const season = draft?.startedAt != null
    ? draft.fields.season || defaultSeason(draft.startedAt, overrides)
    : (settings.recordSeason ?? '').trim() || defaultSeason(Date.now(), overrides)
  return { result: 'suspected', lineup: [], bonds: [], rankChange: null, season, note: null, mode: null, rankBefore: null, rankAfter: null, rating: null, squadHp: null }
}

function runDraftJob(id: string, work: () => Promise<RecordingDraft>): Promise<RecordingDraft> {
  if (draftJobs.has(id)) throw new Error('这份草稿正在处理，请稍候')
  const pending = work().finally(() => draftJobs.delete(id))
  draftJobs.set(id, pending)
  return pending
}

async function recognizeDraft(id: string): Promise<RecordingDraft> {
  const draft = requireDraft(id)
  if (!draft.screenshotPath) return recordingStore.update(id, { status: 'review', error: '还没有截图，可以重新截图、选择图片或手动填写' })
  recordingStore.update(id, { status: 'recognizing', error: null })
  publishRecords()
  try {
    const result = await recognizeRecord(draft.screenshotPath, path.join(app.getPath('userData'), 'image-templates'))
    return recordingStore.update(id, {
      status: 'review', pageKind: result.pageKind, ocrText: result.text, error: null,
      fields: { ...blankRecordFields(draft), ...result.fields },
      warnings: [...new Set([...result.warnings, ...duplicateWarnings(draft)])]
    })
  } catch (error) {
    return recordingStore.update(id, { status: 'review', error: error instanceof Error ? error.message : '识别失败，可以重新识别或手动填写' })
  } finally { publishRecords() }
}

function duplicateWarnings(draft: RecordingDraft): string[] {
  return draft.screenshotPath && repo.list(100000).some(match => match.screenshotPath === draft.screenshotPath)
    ? ['这张图片曾用于已保存的战绩，请确认不是重复导入。'] : []
}

async function captureOnce(display: Electron.Display): Promise<string> {
  if (captureInProgress) throw new Error('正在截图，请稍候再试')
  captureInProgress = true
  const visibleWindows: BrowserWindow[] = []
  try {
    finishPetDrag?.()
    visibleWindows.push(...BrowserWindow.getAllWindows().filter(win => win.isVisible()))
    for (const win of visibleWindows) win.hide()
    publishPetVisibility()
    await new Promise(resolve => setTimeout(resolve, 160))
    return await captureDisplay(display, screenshotDirectory())
  } finally {
    captureInProgress = false
    for (const win of visibleWindows) {
      if (win.isDestroyed() || win.getParentWindow() === petWindow) continue
      if (win === petWindow && petHidden) continue
      win.showInactive()
    }
    petTimer?.refreshPosition()
    petBubble?.refreshPosition()
    publishPetVisibility()
  }
}

async function captureDraft(id: string, display: Electron.Display): Promise<RecordingDraft> {
  requireDraft(id)
  recordingStore.update(id, { status: 'capturing', error: null })
  publishRecords()
  try {
    const screenshotPath = await captureOnce(display)
    recordingStore.update(id, { screenshotPath, fields: blankRecordFields(requireDraft(id)), ocrText: '', pageKind: 'unknown', warnings: ['请检查原图：本次截取的是触发操作时光标所在的显示器。'] })
  } catch (error) {
    const draft = recordingStore.update(id, { status: 'review', error: error instanceof Error ? error.message : '截图失败，可以主动重截或导入图片' })
    publishRecords()
    return draft
  }
  return recognizeDraft(id)
}

function startRecording(): number {
  if (endPending || captureInProgress) throw new Error('上一局截图正在处理，请稍候再开始计时')
  recordStartedAt = recordingStore.start()
  lastLongRunReminderAt = 0
  publishRecording()
  return recordStartedAt
}

/** 有新版本时用气泡提示（不自动安装；绿色包替换文件需要用户自己解压覆盖）。 */
async function notifyUpdateIfAny(): Promise<void> {
  try {
    const result = await checkForUpdate()
    if (!result.hasUpdate || !result.latest) return
    // 同一版本只提示一次，避免每次启动都唠叨
    if (wasNotified(result.latest)) return
    markNotified(result.latest)
    petBubble?.update({
      text: `老板~新版本 ${result.latest} 出来了（当前 ${result.current}），右键菜单 →「检查更新」可以去下载~`
    })
    setTimeout(() => petBubble?.update(null), 12000)
  } catch (error) {
    // 版本检查失败绝不能影响主功能
    console.error('[update-check]', error)
  }
}

/**
 * 长局提醒：只读本地起始时间戳，不碰屏幕。
 * 50 分钟提醒第一次（大多数对局早该结束了），之后每 10 分钟一次。
 * 间隔加了随机抖动：固定节拍太像闹钟，随机一点更像桌宠在念叨。
 */
const LONG_RUN_FIRST_SEC = 50 * 60
/** 之后的提醒基准间隔 */
const LONG_RUN_REPEAT_SEC = 10 * 60
/** 随机抖动范围：基准 ± 这么多秒（10 分钟 → 8~12 分钟随机） */
const LONG_RUN_JITTER_SEC = 2 * 60
let lastLongRunReminderAt = 0
/** 下次提醒的时间点（毫秒），带随机抖动，避免每次都是同一个节拍 */
let nextLongRunReminderAt = 0

/** 生成下一次提醒时间：基准间隔 ± 抖动。 */
function scheduleNextLongRun(from: number): number {
  const jitter = (Math.random() * 2 - 1) * LONG_RUN_JITTER_SEC
  return from + (LONG_RUN_REPEAT_SEC + jitter) * 1000
}

function checkLongRun(): void {
  if (recordStartedAt === null) {
    lastLongRunReminderAt = 0
    nextLongRunReminderAt = 0
    return
  }
  const now = Date.now()
  const elapsedSec = (now - recordStartedAt) / 1000
  if (elapsedSec < LONG_RUN_FIRST_SEC) return

  // 第一次到 50 分钟：立即提醒，并安排下一次
  if (nextLongRunReminderAt === 0) {
    nextLongRunReminderAt = scheduleNextLongRun(now)
    lastLongRunReminderAt = now
    fireLongRunReminder(elapsedSec)
    return
  }
  // 之后按抖动的间隔提醒
  if (now < nextLongRunReminderAt) return
  nextLongRunReminderAt = scheduleNextLongRun(now)
  lastLongRunReminderAt = now
  fireLongRunReminder(elapsedSec)
}

function fireLongRunReminder(elapsedSec: number): void {
  if (settings.quietMode) return
  petBubble?.update({ text: `老板~这局记了 ${formatDuration(elapsedSec)} 了，是忘了收工，还是真在肝？` })
  setTimeout(() => petBubble?.update(null), 6000)
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '未知时长'
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}小时${m}分`
  if (m > 0) return `${m}分${s}秒`
  return `${s}秒`
}

function endRecording(): Promise<RecordingDraft | null> {
  if (endPending) return endPending
  // 赛季优先级：设置里（由面板顶部切换按钮写入）＞ 按时间推测（含用户填写的赛季开始时间）
  const overrides = { starts: settings.seasonStarts ?? {}, ends: settings.seasonEnds ?? {} }
  const season = (settings.recordSeason ?? '').trim() || defaultSeason(Date.now(), overrides)
  const draft = recordingStore.end(Date.now(), season)
  if (!draft) return Promise.resolve(null)
  recordStartedAt = null
  publishRecording()
  publishRecords()
  // 自助截图模式：结束只冻结时长，不自动截屏（全屏下抓屏会黑）。
  // 但面板照常自动打开，落在"等你导入/粘贴截图"的核对状态。
  setPetVisible(true)
  showPanel()
  // 面板打开后自动选中这条新草稿，用户可直接导入/粘贴截图
  setTimeout(() => {
    if (panelWindow && !panelWindow.isDestroyed() && !panelWindow.webContents.isDestroyed()) {
      panelWindow.webContents.send('draft:focus', draft.id)
    }
  }, 260)
  return Promise.resolve(draft)
}

async function chooseScreenshot(): Promise<string | null> {
  const options: Electron.OpenDialogOptions = { title: '选择结算或历史战绩截图', properties: ['openFile'], filters: [{ name: '截图', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] }
  const result = panelWindow ? await dialog.showOpenDialog(panelWindow, options) : await dialog.showOpenDialog(options)
  return result.canceled || !result.filePaths[0] ? null : importScreenshotFile(result.filePaths[0], screenshotDirectory())
}

async function readClipboardImage(): Promise<string | null> {
  const items = await clipboard.read()
  for (const item of items) {
    const imageType = item.types.find((type) => type === 'image/png' || type === 'image/jpeg' || type.startsWith('image/'))
    if (!imageType) continue
    try {
      const blob = await item.getType(imageType)
      if (blob instanceof Blob) {
        const bytes = Buffer.from(await blob.arrayBuffer())
        const extension = imageType === 'image/jpeg' ? '.jpg' : '.png'
        return importScreenshotBytes(bytes, extension, screenshotDirectory())
      }
    } catch { /* 尝试下一个条目 */ }
  }
  return null
}

/**
 * 把用户选的路径解析成用于「启动游戏」的可执行文件。
 * 优先 launcher.exe（官方启动器，asInvoker 普通权限，无需 UAC，会负责更新与进入游戏）；
 * 没有启动器时退回 Game\StarRail.exe（requireAdministrator，会弹 UAC）。
 * 支持用户填：游戏根目录 / Game 目录 / 任意一个 exe 的完整路径。
 */
function resolveGameLauncher(input: string): { exe: string; viaLauncher: boolean } | null {
  const raw = (input ?? '').trim().replace(/^"|"$/g, '')
  if (!raw) return null
  // 用户在设置里可能填的是 exe 本身：取其所在目录作为根
  const roots: string[] = [raw]
  try {
    if (fs.statSync(raw).isFile()) roots.unshift(path.dirname(path.dirname(raw)), path.dirname(raw))
  } catch { /* 路径不可访问时按目录处理 */ }

  for (const root of roots) {
    // 1) 官方启动器：根目录下的 launcher.exe（不需要管理员权限，体验最好）
    const launcher = path.join(root, 'launcher.exe')
    try {
      if (fs.statSync(launcher).isFile()) return { exe: launcher, viaLauncher: true }
    } catch { /* 继续 */ }
    // 2) 退回游戏主程序
    for (const gameExe of [path.join(root, 'Game', 'StarRail.exe'), path.join(root, 'StarRail.exe')]) {
      try {
        if (fs.statSync(gameExe).isFile()) return { exe: gameExe, viaLauncher: false }
      } catch { /* 继续 */ }
    }
  }
  return null
}

function setupIpc(): void {
  // 赛季隔离：面板切换赛季后，列表与所有统计只统计该赛季（传 null/undefined 表示不隔离）
  ipcMain.handle('record:list', (_e, limit?: number, season?: string | null) => repo.list(limit, false, season))
  ipcMain.handle('record:get', (_e, id: number) => repo.byId(id))
  ipcMain.handle('stats:seasons', () => repo.seasons())
  ipcMain.handle('stats:overview', (_e, season?: string | null) => repo.overview(season))
  ipcMain.handle('stats:lineups', (_e, season?: string | null) => repo.lineupStats(season))
  ipcMain.handle('stats:bonds', (_e, season?: string | null) => repo.bondStats(season))
  ipcMain.handle('stats:rankCurve', (_e, season?: string | null) => repo.rankCurve(season))
  ipcMain.handle('stats:durationHist', (_e, season?: string | null) => repo.durationHistogram(season))
  ipcMain.handle('stats:hourHist', (_e, season?: string | null) => repo.hourHistogram(season))

  ipcMain.handle('record:isRecording', () => recordStartedAt)
  ipcMain.handle('record:start', startRecording)
  ipcMain.handle('record:end', endRecording)
  // 草稿相关文件访问只接受面板发起；路径始终由主进程选择或生成。
  const panelHandle = (channel: string, handler: (...args: any[]) => unknown): void => {
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      if (event.sender !== panelWindow?.webContents) throw new Error('请在战绩面板中操作')
      return handler(...args)
    })
  }
  panelHandle('draft:list', () => recordingStore.list().filter(draft => !repo.byDraftId(draft.id)))
  panelHandle('draft:image', (id: string) => screenshotDataUrl(requireDraft(id).screenshotPath, screenshotDirectory()))
  panelHandle('record:image', (id: number) => screenshotDataUrl(repo.byId(id)?.screenshotPath ?? null, screenshotDirectory()))
  // 用系统默认看图器打开原图（文件已在本机，点开即可放大细看，无需应用内缩放）
  panelHandle('draft:open-image', async (id: string) => {
    const file = requireDraft(id).screenshotPath
    if (!file) throw new Error('这份草稿还没有截图。')
    const failure = await shell.openPath(file)
    if (failure) throw new Error('无法打开图片：' + failure)
    return true
  })
  panelHandle('record:open-image', async (id: number) => {
    const file = repo.byId(id)?.screenshotPath
    if (!file) throw new Error('这条记录没有保存原图。')
    const failure = await shell.openPath(file)
    if (failure) throw new Error('无法打开图片：' + failure)
    return true
  })
  panelHandle('draft:import', async () => {
    const screenshotPath = await chooseScreenshot()
    if (!screenshotPath) return null
    const existing = recordingStore.list().find(draft => draft.screenshotPath === screenshotPath && !repo.byDraftId(draft.id))
    if (existing) return existing
    const draft = recordingStore.createImport()
    recordingStore.update(draft.id, { screenshotPath })
    return runDraftJob(draft.id, () => recognizeDraft(draft.id))
  })
  // 剪贴板粘贴导入：Win+Shift+S 截好结算图后，面板里 Ctrl+V 直达草稿核对
  panelHandle('draft:paste', async () => {
    const screenshotPath = await readClipboardImage()
    if (!screenshotPath) return null
    const existing = recordingStore.list().find(draft => draft.screenshotPath === screenshotPath && !repo.byDraftId(draft.id))
    if (existing) return existing
    const draft = recordingStore.createImport()
    recordingStore.update(draft.id, { screenshotPath })
    return runDraftJob(draft.id, () => recognizeDraft(draft.id))
  })
  panelHandle('draft:can-paste', async () => {
    const items = await clipboard.read()
    return items.some((item) => item.types.some((type) => type.startsWith('image/')))
  })
  panelHandle('draft:recognize', (id: string) => runDraftJob(id, () => recognizeDraft(id)))
  panelHandle('draft:replace', (id: string) => runDraftJob(id, async () => {
    requireDraft(id)
    const screenshotPath = await chooseScreenshot()
    if (!screenshotPath) return requireDraft(id)
    recordingStore.update(id, { screenshotPath, fields: blankRecordFields(requireDraft(id)), ocrText: '', pageKind: 'unknown', warnings: [], error: null })
    return recognizeDraft(id)
  }))
  // 核对页内粘贴：用剪贴板图片替换这份草稿的截图并重新识别
  panelHandle('draft:replace-paste', (id: string) => runDraftJob(id, async () => {
    requireDraft(id)
    const screenshotPath = await readClipboardImage()
    if (!screenshotPath) throw new Error('剪贴板里没有图片。请先用截图工具截下结算画面。')
    recordingStore.update(id, { screenshotPath, fields: blankRecordFields(requireDraft(id)), ocrText: '', pageKind: 'unknown', warnings: [], error: null })
    return recognizeDraft(id)
  }))
  panelHandle('draft:capture', (id: string) => {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    return runDraftJob(id, () => captureDraft(id, display))
  })
  panelHandle('draft:discard', (id: string) => {
    if (draftJobs.has(id)) throw new Error('正在处理截图，请稍候再丢弃')
    requireDraft(id)
    recordingStore.remove(id)
    publishRecords()
  })
  panelHandle('draft:confirm', (id: string, input: DraftInput) => {
    if (draftJobs.has(id)) throw new Error('正在处理截图，请稍候再保存')
    const saved = repo.byDraftId(id)
    if (saved) {
      if (recordingStore.get(id)) {
        try { recordingStore.remove(id) } catch (error) { console.error('[draft-cleanup]', error) }
      }
      publishRecords()
      return saved
    }
    const draft = requireDraft(id)
    const { endedAt, durationSec, ...fields } = validateDraftInput(input)
    const match = repo.insert({ ...fields, endedAt, durationSec, startedAt: durationSec === null ? null : endedAt - durationSec * 1000,
      screenshotPath: draft.screenshotPath, source: draft.ocrText.trim() ? 'ocr' : 'manual', confidence: null }, id)
    // 正式记录已原子写盘后，清理失败也不能向用户谎报“未保存”；唯一键与列表过滤防重。
    try { recordingStore.remove(id) } catch (error) { console.error('[draft-cleanup]', error) }
    publishRecords()
    publishRecording(match)
    return match
  })

  panelHandle('record:update', (id: number, input: DraftInput) => {
    const { endedAt, durationSec, ...fields } = validateDraftInput(input)
    const match = repo.update(id, { ...fields, endedAt, durationSec,
      startedAt: durationSec === null ? null : endedAt - durationSec * 1000 })
    publishRecords()
    return match
  })

  // 「货币战争启动!」：解析游戏启动器并启动（不是打开文件夹）
  // 优先 launcher.exe：普通权限、无 UAC、由官方启动器处理更新与登录。
  // 仅当没有启动器时才用 Game\StarRail.exe —— 它 manifest 要求管理员，必须走 ShellExecute 弹 UAC。
  ipcMain.handle('game:launch', async () => {
    const target = resolveGameLauncher(settings.gamePath)
    if (!target) return false
    try {
      // shell.openPath 走 ShellExecute：既能启动 exe，也会在需要时正确触发 UAC 提权
      const failure = await shell.openPath(target.exe)
      if (failure) { console.error('[game-launch]', failure); return false }
      console.log(`[game-launch] ${target.viaLauncher ? 'launcher' : 'game exe'}: ${target.exe}`)
      return true
    } catch (error) {
      console.error('[game-launch]', error)
      return false
    }
  })

  ipcMain.handle('settings:get', () => settings)
  // —— 自定义托盘菜单 ——
  ipcMain.handle('tray:state', () => trayMenu?.getState() ?? { petHidden, quietMode: settings.quietMode, recording: recordStartedAt !== null })
  ipcMain.on('tray:action', (event, action: string) => {
    // 只接受托盘菜单窗口自己的消息
    const sender = event.sender
    if (!sender || sender.isDestroyed() || sender.getURL().includes('tray-menu') === false) return
    if (action !== 'close') onTrayMenuAction(action)
    else trayMenu?.hide()
  })
  ipcMain.handle('settings:set', (_e, patch: Partial<AppSettings>) => updateSettings(patch))
  // 选择截图目录（设置页用）：返回选中路径，用户取消返回 null
  ipcMain.handle('settings:pick-screenshot-dir', async () => {
    const options: Electron.OpenDialogOptions = {
      title: '选择截图保存文件夹', properties: ['openDirectory', 'createDirectory']
    }
    const result = settingsWindow ? await dialog.showOpenDialog(settingsWindow, options) : await dialog.showOpenDialog(options)
    return result.canceled || !result.filePaths[0] ? null : result.filePaths[0]
  })
  // 当前实际生效的截图目录（设置页展示用）
  ipcMain.handle('settings:screenshot-dir', () => screenshotDirectory())
  ipcMain.handle('pet:visibility', () => petIsVisible())
  ipcMain.on('pet:hide', (event) => { if (event.sender === petWindow?.webContents) setPetVisible(false) })
  ipcMain.on('pet:show', () => setPetVisible(true))

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

  // 官方解包模型：优先读可写的 data/official_pet（向导提取到这里），回落到 assets/official_pet（旧位置）
  let officialCache: { obj: string; tex: string; cool: string; warm: string } | null | undefined
  ipcMain.handle('pet:officialModel', () => {
    if (officialCache !== undefined) return officialCache
    const candidates = app.getAppPath().includes('.asar')
      ? [path.join(app.getPath('userData'), 'assets', 'official_pet')]
      : [path.join(app.getAppPath(), 'data', 'official_pet'), path.join(app.getAppPath(), 'assets', 'official_pet')]
    for (const dir of candidates) {
      try {
        const objPath = path.join(dir, 'pet03.obj')
        const texPath = path.join(dir, 'pet03_color.png')
        if (!fs.existsSync(objPath) || !fs.existsSync(texPath)) continue
        const coolPath = path.join(dir, 'pet03_cool.png')
        const warmPath = path.join(dir, 'pet03_warm.png')
        officialCache = {
          obj: fs.readFileSync(objPath, 'utf8'),
          tex: fs.readFileSync(texPath).toString('base64'),
          cool: fs.existsSync(coolPath) ? fs.readFileSync(coolPath).toString('base64') : '',
          warm: fs.existsSync(warmPath) ? fs.readFileSync(warmPath).toString('base64') : ''
        }
        return officialCache
      } catch { /* 尝试下一个候选目录 */ }
    }
    officialCache = null
    return officialCache
  })

  ipcMain.on('panel:toggle', () => togglePanel())
  ipcMain.on('settings:open', () => createSettingsWindow())
  ipcMain.on('app:quit', () => app.quit())

  // 手动检查更新（跳过 24 小时节流）
  ipcMain.handle('app:checkUpdate', async () => {
    const result = await checkForUpdate(true)
    if (result.hasUpdate && result.latest) markNotified(result.latest)
    return result
  })
  ipcMain.handle('app:openDownload', () => openDownloadPage())

  ipcMain.on('pet:bubble', (event, content: PetBubbleContent | null) => {
    if (event.sender !== petWindow?.webContents) return
    const text = typeof content?.text === 'string' ? content.text.slice(0, 240) : ''
    petBubble?.update(text ? { text } : null)
  })
  ipcMain.handle('bubble:view', (event) => petBubble?.getView(event.sender))
  ipcMain.on('bubble:measure', (event, height: number, revision: number) => petBubble?.measure(event.sender, height, revision))
  ipcMain.on('pet:menu', (event, open: boolean) => {
    if (event.sender === petWindow?.webContents) petTimer?.setMenuOpen(open === true)
  })
  ipcMain.on('timer:shape', (event, rect: import('@shared/types').PetRect, startedAt: number | null) => {
    petTimer?.measure(event.sender, rect, startedAt)
  })

  // 区域由渲染层按可见内容上报（本体/动效头顶/菜单），主进程统一夹进窗口后应用
  ipcMain.on('pet:shape', (_e, rects: import('@shared/types').PetRect[]) => {
    petShapeRects = Array.isArray(rects) && rects.length > 0 ? rects : null
    applyPetShape()
  })

  // 自定义拖动：渲染层报 start/move/end，主进程轮询光标移动窗口（保留点击能力）
  // 防"消失"三件套：①每帧夹紧在屏内 ②move 心跳超时终止幽灵拖动（pointerup 丢失时）③保存位置先校验
  let lastDragMove = 0
  const endDrag = (): void => {
    if (!dragTimer || !petWindow) return
    clearInterval(dragTimer)
    dragTimer = null
    ensurePetSize() // 保存前确保尺寸正确，坏尺寸不落盘
    const b = petWindow.getBounds()
    if (isOnScreen(b.x, b.y)) {
      settings.petX = b.x
      settings.petY = b.y
      saveSettings(settings)
    }
  }
  finishPetDrag = endDrag
  ipcMain.on('pet:drag', (event, action: 'start' | 'move' | 'end') => {
    if (!petWindow || event.sender !== petWindow.webContents) return
    // 收起后的迟到 move 不能重新启动拖动轮询。
    if (!petIsVisible()) { endDrag(); return }
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
        ensurePetSize() // 拖动中尺寸被改 → 先拉回再夹紧（区域/夹紧都依赖正确尺寸）
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

// 最早期启动追踪：写文件而非 stdout（打包后 stdout 不可见）
const bootTrace = (msg: string): void => {
  try {
    const dir = path.join(process.env.APPDATA ?? '', 'currency-war-pet')
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(path.join(dir, 'boot.log'), `[${new Date().toISOString()}] ${msg}\n`, 'utf8')
  } catch { /* 追踪失败不影响启动 */ }
}
bootTrace('module loaded')

// 固定 userData 路径：productName 含中文时 Electron 会用中文目录名，避免由此引发的路径问题；
// 同时保证 dev 与打包版共用同一份数据。必须在 requestSingleInstanceLock 前设置。
try {
  app.setPath('userData', path.join(process.env.APPDATA ?? app.getPath('appData'), 'currency-war-pet'))
} catch (error) {
  console.error('[user-data]', error)
}
bootTrace('userData set')

// sql.js与草稿均由单进程持有，阻止两个实例用旧快照互相覆盖用户文件。
const ownsData = app.requestSingleInstanceLock()
bootTrace(`singleInstanceLock = ${ownsData}`)
if (!ownsData) {
  // 已有实例在运行：聚焦它并退出（正常行为，不是崩溃）
  bootTrace('quit: another instance owns the data')
  app.quit()
}
app.on('second-instance', () => {
  if (!petWindow) return
  setPetVisible(true)
  showPanel()
})

if (ownsData) app.whenReady().then(async () => {
  bootTrace('whenReady fired')
  const crashLog = (stage: string, error: unknown) => {
    try {
      const line = `[${new Date().toISOString()}] ${stage} ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
      fs.appendFileSync(path.join(app.getPath('userData'), 'startup-error.log'), line, 'utf8')
    } catch { /* 日志写入失败不阻断 */ }
  }
  process.on('uncaughtException', (error) => { crashLog('uncaughtException', error); console.error(error) })
  process.on('unhandledRejection', (error) => { crashLog('unhandledRejection', error); console.error(error) })
  try {
  settings = loadSettings()
  repo = await Repository.create()
  recordingStore = new RecordingStore(path.join(app.getPath('userData'), 'recording-state.json'))
  migrateScreenshots()
  // 迁移后把已保存记录里的旧绝对路径改到新目录，否则详情页读不到原图
  try {
    const legacyDir = path.join(app.getPath('userData'), 'screenshots')
    const targetDir = screenshotDirectory()
    const updated = repo.rewriteScreenshotPaths(legacyDir, targetDir)
    if (updated) console.log(`[screenshot-migrate] 已更新 ${updated} 条记录的原图路径`)
    // 待确认草稿的原图路径同样要改，否则核对页读不到
    let draftUpdated = 0
    for (const draft of recordingStore.list()) {
      if (!draft.screenshotPath || !path.isAbsolute(draft.screenshotPath)) continue
      if (path.resolve(path.dirname(draft.screenshotPath)) !== path.resolve(legacyDir)) continue
      recordingStore.update(draft.id, { screenshotPath: path.join(targetDir, path.basename(draft.screenshotPath)) })
      draftUpdated++
    }
    if (draftUpdated) console.log(`[screenshot-migrate] 已更新 ${draftUpdated} 份草稿的原图路径`)
  } catch (error) { console.error('[screenshot-migrate] 路径重写失败', error) }
  recordStartedAt = recordingStore.getStartedAt()
  setupIpc()
  // 首次启动：先走向导（选游戏路径/截图目录/解包模型），完成后才创建桌宠
  setupWizardIpc({
    getSettings: () => settings,
    applyConfig: (config) => {
      updateSettings({ gamePath: config.gamePath, screenshotDir: config.screenshotDir })
    }
  })
  if (!hasCompletedWizard()) {
    createWizardWindow(() => {
      // 向导完成后再拉起桌宠与托盘
      createPetWindow()
      createTray()
      createPanelWindow()
    })
    return
  }
  createPetWindow()
  createTray()
  createPanelWindow() // 预创建，保证面板秒开；用时再 show
  // 长局提醒巡检：纯本地时间戳，1 分钟一次（不截屏、不读游戏；40 分后需 10 分钟粒度提醒）
  setInterval(() => { try { checkLongRun() } catch (error) { console.error('[long-run]', error) } }, 60 * 1000)
  // 版本检查：启动 8 秒后查一次（不去抢启动阶段的资源），有新版本用气泡提示
  setTimeout(() => { void notifyUpdateIfAny() }, 8000)
  // 跨重启恢复：上一局没点结束（含中途退出）→ 计时继续累计，并明确告知
  if (recordStartedAt !== null) {
    const elapsed = (Date.now() - recordStartedAt) / 1000
    setTimeout(() => {
      try {
        petBubble?.update({ text: `上一局还在记着（已 ${formatDuration(elapsed)}），老板~按结束收工，或者接着打~` })
        setTimeout(() => petBubble?.update(null), 6000)
      } catch (error) { console.error('[resume-recording]', error) }
    }, 3000)
  }
  // 全屏时可停留在结算页主动结束；注册失败仍可使用秒表和右键。
  if (!globalShortcut.register('CommandOrControl+Shift+F8', () => {
    if (endPending) return
    try {
      if (recordStartedAt === null) startRecording()
      else void endRecording().catch(error => console.error('[record-shortcut]', error))
    } catch (error) { console.error('[record-shortcut]', error) }
  })) console.error('[record-shortcut] Ctrl+Shift+F8 unavailable')
  screen.on('display-removed', recoverPetPosition)
  screen.on('display-added', recoverPetPosition)
  screen.on('display-metrics-changed', recoverPetPosition)
  powerMonitor.on('resume', () => setTimeout(recoverPetPosition, 250))
  } catch (error) {
    crashLog('startup', error)
    console.error('[startup]', error)
    dialog.showErrorBox('启动失败', `应用初始化失败：\n${error instanceof Error ? error.message : String(error)}\n\n详细信息已写入 startup-error.log`)
    app.quit()
  }
})

app.on('before-quit', () => { globalShortcut.unregisterAll(); petTray?.destroy(); petTray = null })
app.on('window-all-closed', () => app.quit())

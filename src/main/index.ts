import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Menu, powerMonitor, screen, shell, Tray } from 'electron'
import fs from 'fs'
import path from 'path'
import { Repository } from './repository'
import { loadSettings, saveSettings } from './config'
import { PetBubbleController } from './petBubble'
import { PetTimerController } from './petTimer'
import { createTrayIcon } from './trayIcon'
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
let petHidden = false
let lastVisible: boolean | null = null
let finishPetDrag: (() => void) | null = null
let recordingStore: RecordingStore
let captureInProgress = false
let endPending: Promise<RecordingDraft | null> | null = null
const draftJobs = new Map<string, Promise<RecordingDraft>>()
const screenshotDirectory = (): string => path.join(app.getPath('userData'), 'screenshots')

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
  const next = normalizeSettings({ ...settings, ...patch })
  saveSettings(next)
  settings = next
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('settings:changed', settings)
  }
  updateTrayMenu()
  return settings
}

function updateTrayMenu(): void {
  if (!petTray || petTray.isDestroyed()) return
  petTray.setToolTip(`货币战争桌宠${settings.quietMode ? ' · 安静模式' : ''}${recordStartedAt !== null ? ' · 记录中' : ''}`)
  petTray.setContextMenu(Menu.buildFromTemplate([
    { label: petHidden ? '显示桌宠' : '暂时收起桌宠', click: () => setPetVisible(petHidden) },
    { label: '安静模式', type: 'checkbox', checked: settings.quietMode, click: (item) => {
      try { updateSettings({ quietMode: item.checked }) } catch (error) { console.error('[settings-save]', error); updateTrayMenu() }
    } },
    { label: '设置', click: () => createSettingsWindow() },
    { label: '战绩与待确认记录', click: () => showPanel() },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]))
}

function createTray(): void {
  petTray = new Tray(createTrayIcon())
  petTray.on('double-click', () => setPetVisible(true))
  updateTrayMenu()
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
  if (settings.petX != null && settings.petY != null) {
    // 恢复位置也过夹紧：旧版本若存过屏外坐标，直接拉回可见区（按真实窗口尺寸算）
    const cur = petWindow.getBounds()
    const p = clampToScreens(settings.petX, settings.petY, cur.width, cur.height)
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
  petWindow.webContents.on('render-process-gone', (_e, d) => console.error('[renderer-gone]', d.reason))
  petWindow.webContents.on('console-message', (...args: unknown[]) => {
    const details = args.find((a) => a && typeof a === 'object' && 'message' in (a as object)) as { message?: string } | undefined
    const msg = details?.message ?? String(args[1] ?? '')
    if (msg) console.error('[renderer]', msg)
  })
  petWindow.on('closed', () => { petWindow = null; app.quit() })
  // 周期兜底：全屏应用/覆盖层可能随时清掉 topmost 位或改尺寸，5s 巡检一次。
  // setAlwaysOnTop(true) 在内部状态已为 true 时是空操作（实测掉到 Z4 被盖）→ 高层级 + moveTop 真正抬回
  setInterval(() => {
    if (!petWindow || petWindow.isDestroyed() || !petIsVisible()) return
    ensurePetSize()
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

function blankRecordFields(draft?: RecordingDraft): RecordFields {
  const season = draft?.startedAt != null ? draft.fields.season : ''
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

/** 长局提醒：只读本地起始时间戳，不碰屏幕。30分、40分各提醒一次；40分之后每 10 分钟提醒。 */
const LONG_RUN_FIRST_SEC = 30 * 60
const LONG_RUN_SECOND_SEC = 40 * 60
const LONG_RUN_REPEAT_SEC = 10 * 60
let lastLongRunReminderAt = 0
function checkLongRun(): void {
  if (recordStartedAt === null) { lastLongRunReminderAt = 0; return }
  const elapsedSec = (Date.now() - recordStartedAt) / 1000
  if (elapsedSec < LONG_RUN_FIRST_SEC) return
  // 30→40 分钟之间只提醒一次；40 分钟后按 10 分钟间隔反复提醒
  const interval = elapsedSec >= LONG_RUN_SECOND_SEC ? LONG_RUN_REPEAT_SEC : LONG_RUN_SECOND_SEC - LONG_RUN_FIRST_SEC
  if (lastLongRunReminderAt && (Date.now() - lastLongRunReminderAt) / 1000 < interval) return
  lastLongRunReminderAt = Date.now()
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
  const draft = recordingStore.end(Date.now(), settings.recordSeason ?? '')
  if (!draft) return Promise.resolve(null)
  recordStartedAt = null
  publishRecording()
  publishRecords()
  // 自助截图模式：结束计时只冻结时长，不自动截屏、不自动弹面板
  // （自动开面板会打断用户在游戏里的操作，且容易触发截图/焦点问题；改由桌宠提醒后用户自行打开）
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

function setupIpc(): void {
  ipcMain.handle('record:list', (_e, limit?: number) => repo.list(limit))
  ipcMain.handle('record:get', (_e, id: number) => repo.byId(id))
  ipcMain.handle('stats:overview', () => repo.overview())
  ipcMain.handle('stats:lineups', () => repo.lineupStats())
  ipcMain.handle('stats:bonds', () => repo.bondStats())
  ipcMain.handle('stats:rankCurve', () => repo.rankCurve())
  ipcMain.handle('stats:durationHist', () => repo.durationHistogram())
  ipcMain.handle('stats:hourHist', () => repo.hourHistogram())

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
  ipcMain.handle('settings:set', (_e, patch: Partial<AppSettings>) => updateSettings(patch))
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

// sql.js与草稿均由单进程持有，阻止两个实例用旧快照互相覆盖用户文件。
const ownsData = app.requestSingleInstanceLock()
if (!ownsData) app.quit()
app.on('second-instance', () => {
  if (!petWindow) return
  setPetVisible(true)
  showPanel()
})

if (ownsData) app.whenReady().then(async () => {
  settings = loadSettings()
  repo = await Repository.create()
  recordingStore = new RecordingStore(path.join(app.getPath('userData'), 'recording-state.json'))
  recordStartedAt = recordingStore.getStartedAt()
  setupIpc()
  createPetWindow()
  createTray()
  createPanelWindow() // 预创建，保证面板秒开；用时再 show
  // 长局提醒巡检：纯本地时间戳，1 分钟一次（不截屏、不读游戏；40 分后需 10 分钟粒度提醒）
  setInterval(() => { try { checkLongRun() } catch (error) { console.error('[long-run]', error) } }, 60 * 1000)
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
})

app.on('before-quit', () => { globalShortcut.unregisterAll(); petTray?.destroy(); petTray = null })
app.on('window-all-closed', () => app.quit())

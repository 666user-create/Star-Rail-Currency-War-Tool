import { BrowserWindow, screen, type Rectangle, type WebContents } from 'electron'
import { placeTimer } from '../shared/timerPlacement'
import type { PetRect } from '../shared/types'

/** 独立秒表只跟随桌宠窗口移动，不跟随角色动作起伏。 */
export class PetTimerController {
  private window: BrowserWindow | null = null
  private startedAt: number | null = null
  private menuOpen = false
  private ready = false
  private layoutKey = ''

  constructor(
    private readonly pet: BrowserWindow,
    private readonly preload: string,
    private readonly loadPage: (win: BrowserWindow, page: string) => void,
    private readonly onLayoutChange: () => void
  ) {
    pet.on('move', this.refreshPosition)
    pet.on('resize', this.refreshPosition)
    pet.on('hide', this.refreshPosition)
    pet.on('show', this.refreshPosition)
    pet.on('minimize', this.refreshPosition)
    pet.on('restore', this.refreshPosition)
    screen.on('display-added', this.refreshPosition)
    screen.on('display-removed', this.refreshPosition)
    screen.on('display-metrics-changed', this.refreshPosition)
    pet.once('closed', () => {
      screen.removeListener('display-added', this.refreshPosition)
      screen.removeListener('display-removed', this.refreshPosition)
      screen.removeListener('display-metrics-changed', this.refreshPosition)
      if (this.window && !this.window.isDestroyed()) this.window.destroy()
      this.window = null
      this.notifyLayout()
    })
    this.createWindow()
  }

  setRecording(startedAt: number | null): void {
    if (this.startedAt === startedAt) return
    this.startedAt = startedAt
    this.ready = false
    this.window?.hide()
    this.refreshPosition()
  }

  setMenuOpen(open: boolean): void {
    if (this.menuOpen === open) return
    this.menuOpen = open
    this.refreshPosition()
  }

  measure(sender: WebContents, rect: PetRect, startedAt: number | null): void {
    const win = this.window
    if (!win || win.isDestroyed() || sender !== win.webContents || startedAt !== this.startedAt) return
    if (!rect || ![rect.x, rect.y, rect.width, rect.height, rect.x + rect.width, rect.y + rect.height].every(Number.isFinite) ||
        rect.width <= 0 || rect.height <= 0) return
    const bounds = win.getBounds()
    // 窗口由 48 宽切到 136 宽时，渲染端的旧视口测量可能给出负坐标（胶囊居中溢出）。
    // 以前这里直接丢弃，导致 ready 永远为 false、计时表一直隐藏（重启后"闹钟丢失"）。
    // 现在把窗口扩到能容纳内容即可，不必丢弃这次测量。
    const needWidth = Math.max(bounds.width, Math.ceil(rect.x + rect.width) + 4)
    const needHeight = Math.max(bounds.height, Math.ceil(rect.y + rect.height) + 4)
    if (needWidth > bounds.width || needHeight > bounds.height) {
      win.setBounds({ x: bounds.x, y: bounds.y, width: needWidth, height: needHeight })
    }
    const x = Math.max(0, Math.floor(rect.x) - 4)
    const y = Math.max(0, Math.floor(rect.y) - 4)
    const right = Math.min(needWidth, Math.ceil(rect.x + rect.width) + 4)
    const bottom = Math.min(needHeight, Math.ceil(rect.y + rect.height) + 4)
    if (right <= x || bottom <= y) return
    if (typeof win.setShape === 'function') win.setShape([{ x, y, width: right - x, height: bottom - y }])
    this.ready = true
    this.refreshPosition()
  }

  getBounds(): Rectangle | null {
    const win = this.window
    return win && !win.isDestroyed() && win.isVisible() ? win.getBounds() : null
  }

  readonly refreshPosition = (): void => {
    const win = this.window
    if (!win || win.isDestroyed() || this.pet.isDestroyed()) return
    const petBounds = this.pet.getBounds()
    const bounds = placeTimer(petBounds, { width: this.startedAt === null ? 48 : 136, height: 48 }, screen.getDisplayMatching(petBounds).workArea)
    if (!bounds.width || !bounds.height) {
      win.hide()
      this.notifyLayout()
      return
    }
    const previous = win.getBounds()
    if (previous.x !== bounds.x || previous.y !== bounds.y || previous.width !== bounds.width || previous.height !== bounds.height) {
      win.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height })
    }
    if (this.ready && !this.menuOpen && this.pet.isVisible() && !this.pet.isMinimized()) {
      win.setAlwaysOnTop(true, 'screen-saver')
      if (!win.isVisible()) win.showInactive()
    } else {
      win.hide()
    }
    this.notifyLayout()
  }

  private notifyLayout(): void {
    const bounds = this.getBounds()
    const key = bounds ? `${bounds.x},${bounds.y},${bounds.width},${bounds.height}` : 'hidden'
    if (this.layoutKey === key) return
    this.layoutKey = key
    this.onLayoutChange()
  }

  private createWindow(): void {
    const win = new BrowserWindow({
      width: 48, height: 48, parent: this.pet,
      title: '桌宠计时表', transparent: true, frame: false,
      focusable: false, resizable: false, movable: false,
      alwaysOnTop: true, skipTaskbar: true, hasShadow: false, show: false,
      webPreferences: { preload: this.preload, contextIsolation: true, nodeIntegration: false, sandbox: false }
    })
    this.window = win
    win.webContents.on('did-start-loading', () => {
      this.ready = false
      win.hide()
      this.notifyLayout()
    })
    win.webContents.on('did-fail-load', (_event, code, description) => console.error('[timer-load]', code, description))
    win.webContents.on('render-process-gone', (_event, details) => {
      this.ready = false
      win.hide()
      this.notifyLayout()
      console.error('[timer-gone]', details.reason)
    })
    win.on('closed', () => {
      this.window = null
      this.ready = false
      this.notifyLayout()
    })
    this.refreshPosition()
    this.loadPage(win, 'timer')
  }
}

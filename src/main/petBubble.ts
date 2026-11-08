import { BrowserWindow, screen, type WebContents } from 'electron'
import { placeBubble } from '../shared/bubblePlacement'
import type { PetBubbleContent, PetBubbleView } from '../shared/types'

/** 独立的点穿气泡，不扩大桌宠窗口，也不与任何动作共用绘制区域。 */
export class PetBubbleController {
  private window: BrowserWindow | null = null
  private view: PetBubbleView = { content: null, side: 'right', revision: 0 }
  private naturalHeight = 100
  private measuredRevision = -1

  constructor(
    private readonly pet: BrowserWindow,
    private readonly preload: string,
    private readonly loadPage: (win: BrowserWindow, page: string) => void,
    private readonly timerBounds: () => Electron.Rectangle | null = () => null
  ) {
    pet.on('move', this.refreshPosition)
    pet.on('resize', this.refreshPosition)
    pet.on('hide', this.refreshPosition)
    pet.on('show', this.refreshPosition)
    screen.on('display-added', this.refreshPosition)
    screen.on('display-removed', this.refreshPosition)
    screen.on('display-metrics-changed', this.refreshPosition)
    pet.once('closed', () => {
      screen.removeListener('display-added', this.refreshPosition)
      screen.removeListener('display-removed', this.refreshPosition)
      screen.removeListener('display-metrics-changed', this.refreshPosition)
      if (this.window && !this.window.isDestroyed()) this.window.destroy()
      this.window = null
    })
  }

  update(content: PetBubbleContent | null): void {
    this.view = { ...this.view, content, revision: this.view.revision + 1 }
    if (content) this.createWindow()
    this.publish()
    this.refreshPosition()
  }

  getView(sender: WebContents): PetBubbleView {
    return sender === this.window?.webContents ? this.view : { ...this.view, content: null }
  }

  measure(sender: WebContents, height: number, revision: number): void {
    if (sender !== this.window?.webContents || revision !== this.view.revision || !Number.isFinite(height)) return
    this.naturalHeight = Math.min(200, Math.max(40, Math.ceil(height)))
    this.measuredRevision = revision
    this.refreshPosition()
  }

  readonly refreshPosition = (): void => {
    const win = this.window
    if (!win || win.isDestroyed() || this.pet.isDestroyed()) return
    if (!this.view.content || !this.pet.isVisible() || this.pet.isMinimized()) { win.hide(); return }
    const petBounds = this.pet.getBounds()
    const workArea = screen.getDisplayMatching(petBounds).workArea
    const timer = this.timerBounds()
    const bounds = placeBubble(petBounds, { width: 224, height: this.naturalHeight }, workArea, 10, timer ? [timer] : [])
    if (!bounds.width || !bounds.height) { win.hide(); return }
    if (bounds.side !== this.view.side) {
      this.view = { ...this.view, side: bounds.side }
      this.publish()
    }
    const previous = win.getBounds()
    if (previous.x !== bounds.x || previous.y !== bounds.y || previous.width !== bounds.width || previous.height !== bounds.height) {
      win.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height })
    }
    // 首次内容完成布局后再显示，避免透明窗口初始化时闪出空白或旧台词。
    if (this.measuredRevision === this.view.revision) {
      win.setAlwaysOnTop(true, 'screen-saver')
      if (!win.isVisible()) win.showInactive()
    }
  }

  private publish(): void {
    if (this.window && !this.window.isDestroyed()) this.window.webContents.send('bubble:view', this.view)
  }

  private createWindow(): void {
    if (this.window) return
    const win = new BrowserWindow({
      width: 224, height: 100, parent: this.pet,
      title: '桌宠气泡', transparent: true, frame: false,
      resizable: false, movable: false, focusable: false,
      alwaysOnTop: true, skipTaskbar: true, hasShadow: false, show: false,
      webPreferences: { preload: this.preload, contextIsolation: true, nodeIntegration: false, sandbox: false }
    })
    this.window = win
    // CSS pointer-events 无法穿透原生窗口，必须让整个窗口忽略鼠标事件。
    win.setIgnoreMouseEvents(true)
    win.webContents.on('did-fail-load', (_event, code, description) => console.error('[bubble-load]', code, description))
    win.webContents.on('render-process-gone', (_event, details) => console.error('[bubble-gone]', details.reason))
    win.on('closed', () => { this.window = null; this.measuredRevision = -1 })
    this.loadPage(win, 'bubble')
  }
}

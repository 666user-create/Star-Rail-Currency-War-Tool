/// <reference types="electron-vite/node" />
import { BrowserWindow, screen, type Tray } from 'electron'
import path from 'node:path'

export interface TrayMenuState {
  petHidden: boolean
  quietMode: boolean
  recording: boolean
}

/**
 * 自定义托盘菜单窗口。
 * Windows 原生托盘菜单只能白底系统样式，无法与深蓝金界面统一，因此自绘一个无边框置顶窗口。
 * 行为对齐原生菜单：点击空白/失焦关闭、贴托盘图标弹出、超出屏幕时自动内收。
 */
export class TrayMenuController {
  private window: BrowserWindow | null = null
  private state: TrayMenuState = { petHidden: false, quietMode: false, recording: false }
  private trayBounds: Electron.Rectangle | null = null

  constructor(
    private readonly preload: string,
    private readonly loadPage: (win: BrowserWindow, page: string) => void,
    private readonly onAction: (action: string) => void
  ) {}

  update(state: TrayMenuState): void {
    this.state = state
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('tray:state', this.state)
    }
  }

  getState(): TrayMenuState { return this.state }

  /** 在托盘图标附近弹出；trayBounds 由调用方从 Tray.getBounds() 提供。 */
  show(tray: Tray): void {
    try { this.trayBounds = tray.getBounds() } catch { this.trayBounds = null }
    if (!this.window || this.window.isDestroyed()) this.create()
    if (!this.window) return
    this.applyBounds()
    this.window.webContents.send('tray:state', this.state)
    this.window.showInactive()
    this.window.focus()
  }

  hide(): void {
    if (this.window && !this.window.isDestroyed()) this.window.hide()
  }

  isVisible(): boolean {
    return !!this.window && !this.window.isDestroyed() && this.window.isVisible()
  }

  private create(): void {
    this.window = new BrowserWindow({
      width: 210,
      height: 226,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      transparent: true,
      hasShadow: false,
      webPreferences: { preload: this.preload, contextIsolation: true, nodeIntegration: false, sandbox: false }
    })
    this.loadPage(this.window, 'tray-menu')
    this.window.on('blur', () => this.hide())
    this.window.on('closed', () => { this.window = null })
    this.window.webContents.on('ipc-message', (_event, channel, ...args) => {
      if (channel !== 'tray:action') return
      const action = String(args[0] ?? '')
      if (action === 'close') { this.hide(); return }
      this.hide()
      this.onAction(action)
    })
  }

  /** 贴着托盘图标弹出：优先右下，空间不足时自动翻转，保证完整在屏内。 */
  private applyBounds(): void {
    if (!this.window) return
    const { width, height } = this.window.getBounds()
    const anchor = this.trayBounds
    const display = screen.getDisplayNearestPoint(
      anchor ? { x: Math.round(anchor.x + anchor.width / 2), y: Math.round(anchor.y + anchor.height / 2) }
        : screen.getCursorScreenPoint()
    )
    const area = display.workArea
    let x: number
    let y: number
    if (anchor && anchor.width > 0) {
      // 任务栏在下方：菜单向上弹；在上方：向下弹
      const trayCenterX = anchor.x + anchor.width / 2
      x = Math.round(trayCenterX - width + anchor.width / 2)
      y = anchor.y > area.y + area.height / 2 ? anchor.y - height - 6 : anchor.y + anchor.height + 6
    } else {
      const cursor = screen.getCursorScreenPoint()
      x = Math.round(cursor.x - width + 12)
      y = Math.round(cursor.y - height - 12)
    }
    x = Math.max(area.x + 4, Math.min(x, area.x + area.width - width - 4))
    y = Math.max(area.y + 4, Math.min(y, area.y + area.height - height - 4))
    this.window.setBounds({ x, y, width, height })
  }
}

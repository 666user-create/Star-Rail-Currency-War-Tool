/// <reference types="electron-vite/node" />
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

/** 首次设置向导：选择游戏路径/截图目录，并调用内置 Python 解包随宠模型。 */
let wizardWindow: BrowserWindow | null = null

const ASSET_FILES = ['pet03.obj', 'pet03_color.png', 'pet03_cool.png', 'pet03_warm.png']

/** 提取器与内嵌 Python 的实际位置（打包后在 resources，开发态在项目根）。 */
function resourcesRoot(): string {
  const packed = process.resourcesPath
  if (packed && fs.existsSync(path.join(packed, 'extractor'))) return packed
  return app.getAppPath()
}

function extractorDir(): string {
  return path.join(resourcesRoot(), 'extractor')
}

/** 内嵌 Python（python-embed）目录；优先用它，找不到才回落到系统 Python。 */
function embeddedPython(): string | null {
  const candidates = [
    path.join(resourcesRoot(), 'python-embed', 'python.exe'),
    path.join(app.getAppPath(), 'python-embed', 'python.exe'),
    path.join(resourcesRoot(), 'python', 'python.exe')
  ]
  return candidates.find((p) => fs.existsSync(p)) ?? null
}

function systemPython(): string | null {
  for (const name of ['python.exe', 'python3.exe']) {
    const candidates = [
      path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Python', 'Python311', name),
      path.join(process.env.ProgramFiles ?? '', 'Python311', name)
    ]
    const found = candidates.find((p) => fs.existsSync(p))
    if (found) return found
  }
  return null
}

/** 探测游戏根目录：优先常见盘符扫描（沿用 extractor/locate.py 的判断规则）。 */
export function detectGameRoot(): { path: string | null; message: string } {
  const drives = ['C:', 'D:', 'E:', 'F:', 'G:'].map((d) => d + path.sep)
  const patterns = ['Star Rail', 'StarRail', '崩坏：星穹铁道', 'HonkaiStarRail', 'Games\\Star Rail']
  for (const drive of drives) {
    for (const name of patterns) {
      const candidate = path.join(drive, name)
      if (isGameRoot(candidate)) return { path: candidate, message: `已找到：${candidate}` }
    }
  }
  return { path: null, message: '没有自动找到游戏目录，请点「浏览…」手动选择' }
}

function isGameRoot(root: string): boolean {
  try {
    if (!fs.statSync(root).isDirectory()) return false
    // 标准布局：<root>\Game\StarRail.exe + <root>\Game\StarRail_Data
    if (fs.existsSync(path.join(root, 'Game', 'StarRail.exe'))) return true
    // 兼容：直接指向 Game 目录
    if (fs.existsSync(path.join(root, 'StarRail.exe'))) return true
    return false
  } catch { return false }
}

/** 解包进度百分比估算：按提取器日志里的关键节点推进。 */
function estimatePercent(line: string): number {
  if (/\[game\]/i.test(line)) return 8
  if (/\[asb\s*\]/i.test(line)) return 12
  if (/prefab|bundle/i.test(line)) return 22
  if (/mesh|CAB|匹配|部件/i.test(line)) return 55
  if (/贴图|texture|\.png/i.test(line)) return 78
  if (/完成|写出|saved/i.test(line)) return 96
  return -1
}

export function createWizardWindow(onFinished?: () => void): BrowserWindow {
  if (wizardWindow && !wizardWindow.isDestroyed()) { wizardWindow.focus(); return wizardWindow }
  wizardWindow = new BrowserWindow({
    width: 720, height: 560,
    resizable: false, frame: false, show: false,
    backgroundColor: '#0d1226',
    title: '首次设置',
    webPreferences: { preload: path.join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  })
  const url = process.env['ELECTRON_RENDERER_URL']
  if (url) wizardWindow.loadURL(`${url}/wizard.html`)
  else wizardWindow.loadFile(path.join(__dirname, '../renderer/wizard.html'))
  wizardWindow.once('ready-to-show', () => wizardWindow?.show())
  wizardWindow.on('closed', () => {
    wizardWindow = null
    // 向导没走完就关窗 = 用户放弃初始化：直接退出，避免留下无窗口的后台进程
    if (!hasCompletedWizard()) app.quit()
    else onFinished?.()
  })
  return wizardWindow
}

export function hasCompletedWizard(): boolean {
  return fs.existsSync(path.join(app.getPath('userData'), '.wizard-done'))
}

export function markWizardDone(): void {
  try { fs.writeFileSync(path.join(app.getPath('userData'), '.wizard-done'), new Date().toISOString(), 'utf8') } catch { /* 标记失败不阻断使用 */ }
}

/** 注册向导相关 IPC。回调用于把配置写回主进程 settings。 */
export function setupWizardIpc(options: {
  getSettings: () => { screenshotDir?: string }
  applyConfig: (config: { gamePath: string; screenshotDir: string }) => void
}): void {
  ipcMain.handle('wizard:detect-game', () => detectGameRoot())
  ipcMain.handle('wizard:pick-game', async () => {
    const win = wizardWindow
    const op: Electron.OpenDialogOptions = { title: '选择游戏根目录（含 Game\\StarRail.exe）', properties: ['openDirectory'] }
    const result = win ? await dialog.showOpenDialog(win, op) : await dialog.showOpenDialog(op)
    return result.canceled || !result.filePaths[0] ? null : result.filePaths[0]
  })
  ipcMain.handle('wizard:pick-screenshot', async () => {
    const win = wizardWindow
    const op: Electron.OpenDialogOptions = { title: '选择截图保存文件夹', properties: ['openDirectory', 'createDirectory'] }
    const result = win ? await dialog.showOpenDialog(win, op) : await dialog.showOpenDialog(op)
    return result.canceled || !result.filePaths[0] ? null : result.filePaths[0]
  })

  ipcMain.handle('wizard:extract', async (_event, gamePath: string) => {
    const interrupted = () => { throw new Error('解包被中断') }
    if (!gamePath || !isGameRoot(gamePath)) throw new Error('游戏路径无效：请选择包含 Game\\StarRail.exe 的目录')

    const python = embeddedPython() ?? systemPython()
    if (!python) throw new Error('找不到 Python 运行环境（安装包应当内置，请重新安装或反馈此问题）')

    const script = path.join(extractorDir(), 'extract_pet.py')
    if (!fs.existsSync(script)) throw new Error('安装包缺少提取脚本 extractor/extract_pet.py')

    // 输出目录：必须写可写位置。打包后 asar 只读，统一放 userData；
    // 开发态放 data/official_pet（assets/ 在 Windows 上对本进程不可写，且打包后只读）。
    const assetOut = app.getAppPath().includes('.asar')
      ? path.join(app.getPath('userData'), 'assets', 'official_pet')
      : path.join(app.getAppPath(), 'data', 'official_pet')
    fs.mkdirSync(assetOut, { recursive: true })

    const send = (line: string, percent: number) => {
      if (wizardWindow && !wizardWindow.isDestroyed() && !wizardWindow.webContents.isDestroyed()) {
        wizardWindow.webContents.send('wizard:progress', { line, percent })
      }
    }

    await new Promise<void>((resolve, reject) => {
      const child = spawn(python, [script, '--game', gamePath, '--out', assetOut], {
        cwd: extractorDir(),
        env: { ...process.env, HSR_GUI: '1', PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
        windowsHide: true
      })
      let lastPercent = 0
      let sawError = ''

      const handleLine = (raw: string) => {
        let line = raw
        if (line.startsWith('@@PROGRESS@@')) line = line.slice('@@PROGRESS@@'.length)
        else if (line.startsWith('@@ERROR@@')) { sawError = line.slice('@@ERROR@@'.length); return }
        if (!line.trim()) return
        const p = estimatePercent(line)
        if (p > lastPercent) lastPercent = p
        send(line, lastPercent)
      }

      child.stdout?.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString('utf8').split(/\r?\n/)) handleLine(line)
      })
      child.stderr?.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString('utf8').split(/\r?\n/)) if (line.trim()) { sawError = line; send(line, lastPercent) }
      })
      child.on('error', (error) => reject(new Error('无法启动解包进程：' + error.message)))
      child.on('close', (code) => {
        if (code === 0) { send('提取完成', 100); resolve(); return }
        reject(new Error(sawError || `解包进程退出码 ${code}`))
      })
    })

    // 校验产物齐全
    for (const name of ASSET_FILES) {
      if (!fs.existsSync(path.join(assetOut, name))) throw new Error(`提取完成但缺少文件：${name}`)
    }
  })

  ipcMain.handle('wizard:complete', (_event, config: { gamePath: string; screenshotDir: string }) => {
    options.applyConfig({ gamePath: config.gamePath ?? '', screenshotDir: config.screenshotDir ?? '' })
    markWizardDone()
    if (wizardWindow && !wizardWindow.isDestroyed()) { wizardWindow.close(); wizardWindow = null }
  })
}

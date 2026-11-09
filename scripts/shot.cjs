// 桌宠 3D 形象自查截图工具（开发期使用）
// 用法: npx electron scripts/shot.cjs <输出png路径> [预览页URL] [宽] [高] [等待ms]
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const { createShotLogger } = require('./shot-logger.cjs')

app.disableHardwareAcceleration()

const out = path.resolve(process.argv[2] || 'shot.png')
const url = process.argv[3] || 'http://localhost:5173/pet-official-preview.html?bare=1'
// 可选：画布尺寸与等待时间（视频素材采集用 1920x1080）
const width = Number(process.argv[4]) || 300
const height = Number(process.argv[5]) || 340
const waitMs = Number(process.argv[6]) || 4200
const log = createShotLogger(out + '.log')

app.whenReady().then(async () => {
  fs.mkdirSync(path.dirname(out), { recursive: true })
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    backgroundColor: '#0d1226',
    paintWhenInitiallyHidden: true,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  win.webContents.on('console-message', (...args) => {
    const d = args.find((a) => a && typeof a === 'object' && 'message' in a)
    log('[page]', d ? d.message : String(args[1] ?? ''))
  })
  await win.loadURL(url)
  // 等场景构建 + 模型/贴图异步加载 + 若干帧渲染
  await new Promise((r) => setTimeout(r, waitMs))
  const img = await win.webContents.capturePage()
  fs.writeFileSync(out, img.toPNG())
  log('SAVED:', out)
  app.quit()
}).catch((e) => {
  log('SHOT_FAILED', e)
  app.exit(1)
})

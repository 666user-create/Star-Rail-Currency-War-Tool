// 桌宠 3D 形象自查截图工具（开发期使用）
// 用法: npx electron scripts/shot.cjs <输出png路径> [预览页URL]
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

app.disableHardwareAcceleration()

const out = path.resolve(process.argv[2] || 'shot.png')
const url = process.argv[3] || 'http://localhost:5173/pet3d-preview.html'

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 300,
    height: 340,
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
    console.log('[page]', d ? d.message : String(args[1] ?? ''))
  })
  await win.loadURL(url)
  // 等场景构建 + 若干帧渲染 + 首次眨眼时点
  await new Promise((r) => setTimeout(r, 2600))
  const img = await win.webContents.capturePage()
  fs.writeFileSync(out, img.toPNG())
  console.log('SAVED:', out)
  app.quit()
}).catch((e) => {
  console.error('SHOT_FAILED', e)
  app.exit(1)
})

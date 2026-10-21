// 参考视频抓帧工具（开发期自查用）：打开 BV 号，静音自动播放，按间隔连拍视频区域
// 用法: npx electron scripts/videoframes.cjs <BV或URL> <输出目录> [首等ms] [帧数] [帧间隔ms]
const { app, BrowserWindow, screen } = require('electron')
const fs = require('fs')
const path = require('path')

app.disableHardwareAcceleration()

const arg = process.argv[2] || ''
const url = arg.startsWith('http') ? arg : `https://www.bilibili.com/video/${arg}/`
const outDir = path.resolve(process.argv[3] || '.superpowers/preview/bv-frames')
const firstWait = parseInt(process.argv[4] || '7000', 10)
const frames = parseInt(process.argv[5] || '8', 10)
const interval = parseInt(process.argv[6] || '400', 10)
const seek = parseFloat(process.argv[7] || '0', 10)

fs.mkdirSync(outDir, { recursive: true })

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1100,
    height: 700,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: { backgroundThrottling: false, contextIsolation: true, nodeIntegration: false, sandbox: false }
  })
  win.webContents.on('console-message', (...args) => {
    const d = args.find((a) => a && typeof a === 'object' && 'message' in a)
    const m = d ? d.message : String(args[1] ?? '')
    if (/error|failed|play/i.test(m)) console.log('[page]', m)
  })
  await win.loadURL(url)
  await new Promise((r) => setTimeout(r, firstWait))

  // 找播放器里的 <video>，静音播放；可选跳转时间点；返回其页面内位置供裁剪
  const info = await win.webContents.executeJavaScript(`(async () => {
    const v = document.querySelector('video')
    if (!v) return { found: false, title: document.title }
    v.muted = true
    if (${seek} > 0) { try { v.currentTime = ${seek} } catch (e) {} }
    try { await v.play() } catch (e) {}
    await new Promise(r => setTimeout(r, 400))
    const r = v.getBoundingClientRect()
    return { found: true, w: v.videoWidth, h: v.videoHeight, t: v.currentTime, dur: v.duration,
             paused: v.paused, x: Math.round(r.x), y: Math.round(r.y), vw: Math.round(r.width), vh: Math.round(r.height),
             title: document.title }
  })()`)
  console.log('VIDEO:', JSON.stringify(info))

  const base = info && info.found && info.vw > 40
    ? { x: Math.max(0, info.x), y: Math.max(0, info.y), width: Math.min(info.vw, 1100), height: Math.min(info.vh, 700) }
    : undefined

  for (let i = 0; i < frames; i++) {
    await new Promise((r) => setTimeout(r, interval))
    const img = await win.webContents.capturePage(base)
    const f = path.join(outDir, `f${String(i).padStart(2, '0')}.png`)
    fs.writeFileSync(f, img.toPNG())
    console.log('SAVED:', f)
  }
  // 位置信息，方便分析时间轴
  const t2 = await win.webContents.executeJavaScript(`document.querySelector('video') ? document.querySelector('video').currentTime : -1`)
  console.log('END currentTime =', t2)
  app.quit()
}).catch((e) => {
  console.error('FRAME_FAILED', e)
  app.exit(1)
})

// 参考视频抓帧工具（开发期自查用）
// 单段模式: npx electron scripts/videoframes.cjs <BV或URL> <输出目录> [首等ms] [帧数] [帧间隔ms] [seek秒]
// 时间轴模式: npx electron scripts/videoframes.cjs <BV或URL> <输出目录> 7000 0 0 "start-end-step"
//   例: ... 7000 0 0 "0-42-2"  → t0..42 每2秒一帧（每帧先 seek+等seeked）
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

app.disableHardwareAcceleration()

const arg = process.argv[2] || ''
const url = arg.startsWith('http') ? arg : `https://www.bilibili.com/video/${arg}/`
const outDir = path.resolve(process.argv[3] || '.superpowers/preview/bv-frames')
const firstWait = parseInt(process.argv[4] || '7000', 10)
const frames = parseInt(process.argv[5] || '8', 10)
const interval = parseInt(process.argv[6] || '400', 10)
const seekArg = process.argv[7] || '0'

fs.mkdirSync(outDir, { recursive: true })

const SEEK_JS = (t, pause) => `(async () => {
  const v = document.querySelector('video')
  if (!v) return 'NO_VIDEO'
  ${pause ? 'v.pause();' : ''}
  v.muted = true
  if (Math.abs(v.currentTime - ${t}) > 0.05) {
    v.currentTime = ${t}
    await new Promise(r => { const h = () => { v.removeEventListener('seeked', h); r() }; v.addEventListener('seeked', h); setTimeout(r, 2000) })
  }
  return v.currentTime
})()`

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1100,
    height: 700,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: { backgroundThrottling: false, contextIsolation: true, nodeIntegration: false, sandbox: false }
  })
  await win.loadURL(url)
  await new Promise((r) => setTimeout(r, firstWait))

  const info = await win.webContents.executeJavaScript(`(() => {
    const v = document.querySelector('video')
    if (!v) return { found: false, title: document.title }
    v.muted = true
    const r = v.getBoundingClientRect()
    return { found: true, x: Math.round(r.x), y: Math.round(r.y), vw: Math.round(r.width), vh: Math.round(r.height),
             dur: v.duration, title: document.title }
  })()`)
  console.log('VIDEO:', JSON.stringify(info))
  if (!info.found) { console.error('NO_VIDEO_ELEMENT'); app.exit(1); return }

  const base = { x: Math.max(0, info.x), y: Math.max(0, info.y), width: Math.min(info.vw, 1100), height: Math.min(info.vh, 700) }

  if (seekArg.includes('-')) {
    // 时间轴模式：start-end-step，逐点 seek + 暂停态抓拍
    const [a, b, st] = seekArg.split('-').map(Number)
    for (let t = a; t <= b + 0.001; t += st) {
      const tt = Math.round(t * 10) / 10
      const cur = await win.webContents.executeJavaScript(SEEK_JS(tt, true))
      await new Promise((r) => setTimeout(r, 300))
      const img = await win.webContents.capturePage(base)
      const f = path.join(outDir, `t${String(Math.round(tt * 10)).padStart(4, '0')}.png`)
      fs.writeFileSync(f, img.toPNG())
      console.log('SAVED:', f, 'seek->', cur)
    }
  } else {
    // 连拍模式：播放中按间隔抓
    await win.webContents.executeJavaScript(`document.querySelector('video').play()`)
    const seekNum = parseFloat(seekArg)
    if (seekNum > 0) await win.webContents.executeJavaScript(SEEK_JS(seekNum, false))
    for (let i = 0; i < frames; i++) {
      await new Promise((r) => setTimeout(r, interval))
      const img = await win.webContents.capturePage(base)
      const f = path.join(outDir, `f${String(i).padStart(2, '0')}.png`)
      fs.writeFileSync(f, img.toPNG())
      console.log('SAVED:', f)
    }
  }
  app.quit()
}).catch((e) => {
  console.error('FRAME_FAILED', e)
  app.exit(1)
})

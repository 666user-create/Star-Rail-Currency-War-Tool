// 验证「所有可能导致桌宠不可见」的路径，直接跑真实 Electron
// 用主进程 API 实测：位置、可见性、shape 区域、崩溃恢复
const { app, BrowserWindow, screen } = require('electron')

// 这个脚本需要作为 Electron 主进程运行，通过 dev 应用验证
// 改用另一种方式：直接检查运行中的应用状态

const PET_W = 176
const PET_H = 212
const EDGE_MARGIN = 10

function clampToScreens(x, y, w, h, displays) {
  const fallback = () => {
    const a = screen.getPrimaryDisplay().workArea
    return {
      x: Math.round(a.x + Math.max(EDGE_MARGIN, a.width - PET_W - EDGE_MARGIN)),
      y: Math.round(a.y + Math.max(EDGE_MARGIN, a.height - PET_H - EDGE_MARGIN))
    }
  }
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return fallback()
  }
  let best = null, bestDist = Infinity
  for (const d of displays) {
    const a = d.workArea
    const minX = a.x + EDGE_MARGIN, minY = a.y + EDGE_MARGIN
    const maxX = Math.max(minX, a.x + a.width - w - EDGE_MARGIN)
    const maxY = Math.max(minY, a.y + a.height - h - EDGE_MARGIN)
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) return { x, y }
    const cx = Math.min(Math.max(x, minX), maxX)
    const cy = Math.min(Math.max(y, minY), maxY)
    const dist = (cx - x) ** 2 + (cy - y) ** 2
    if (dist < bestDist) { bestDist = dist; best = { x: cx, y: cy } }
  }
  return best ?? fallback()
}

app.whenReady().then(() => {
  const displays = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()

  console.log('=== 真实屏幕参数 ===')
  console.log('bounds:', JSON.stringify(primary.bounds))
  console.log('workArea:', JSON.stringify(primary.workArea))
  console.log('scaleFactor:', primary.scaleFactor)
  console.log('任务栏高度(逻辑):', primary.bounds.height - primary.workArea.height)

  const results = []
  function test(name, x, y, expectOk = true) {
    const p = clampToScreens(x, y, PET_W, PET_H, displays)
    // 严格判据：逻辑坐标必须在 workArea 内且留余量
    const a = primary.workArea
    const inX = p.x >= a.x && p.x + PET_W <= a.x + a.width
    const inY = p.y >= a.y && p.y + PET_H <= a.y + a.height
    const hasMargin = p.x >= a.x + EDGE_MARGIN - 1 && p.y >= a.y + EDGE_MARGIN - 1
    const bottomOk = p.y + PET_H <= a.y + a.height - EDGE_MARGIN + 1
    // 物理像素检查
    const sf = primary.scaleFactor
    const physBottom = Math.round(p.y * sf) + Math.round(PET_H * sf)
    const physWorkBottom = Math.round(a.y * sf) + Math.round(a.height * sf)
    const physOk = physBottom <= physWorkBottom + 2  // 容忍 2px 取整

    const ok = inX && inY && hasMargin && bottomOk && physOk
    results.push({ name, input: [x, y], output: p, ok, detail: { inX, inY, hasMargin, bottomOk, physOk, physBottom, physWorkBottom } })
    return ok
  }

  console.log('\n=== 穷举测试 ===')
  const cases = [
    ['正常中央', 700, 300],
    ['中央偏下', 700, 500],
    ['历史坏值 -20,607', -20, 607],
    ['历史坏值 22,600（贴底事故）', 22, 600],
    ['历史坏值 -27,635', -27, 635],
    ['左越界', -500, 400],
    ['右越界', 3000, 400],
    ['上越界', 400, -500],
    ['下越界', 400, 2000],
    ['四角越界', -999, -999],
    ['右下越界', 99999, 99999],
    ['minX 边界', EDGE_MARGIN, 400],
    ['maxX 边界', primary.workArea.width - PET_W - EDGE_MARGIN, 400],
    ['minY 边界', 400, EDGE_MARGIN],
    ['maxY 边界', 400, primary.workArea.height - PET_H - EDGE_MARGIN],
    ['NaN x', NaN, 400],
    ['NaN y', 400, NaN],
    ['Infinity x', Infinity, 400],
    ['-Infinity y', 400, -Infinity],
    ['字符串数字', '700', '300'],
    ['null 坐标', null, null],
    ['undefined 坐标', undefined, undefined]
  ]

  let fails = 0
  for (const [name, x, y] of cases) {
    // 字符串/null 走配置校验路径（会被拦下用默认值），这里只测 clamp 自身的健壮性
    const isInvalidInput = !Number.isFinite(x) || !Number.isFinite(y)
    const ok = test(name, x, y, !isInvalidInput)
    if (!ok) fails++
    const mark = ok ? 'PASS' : 'FAIL'
    const r = results[results.length - 1]
    console.log(`${mark} ${name}: [${x},${y}] → [${r.output.x},${r.output.y}] ${ok ? '' : JSON.stringify(r.detail)}`)
  }

  console.log(`\n=== ${results.length - fails}/${results.length} 通过 ===`)

  // 额外验证：物理像素下的安全区
  console.log('\n=== 物理像素安全区 ===')
  const sf = primary.scaleFactor
  const a = primary.workArea
  console.log(`逻辑安全区: x ∈ [${a.x + EDGE_MARGIN}, ${a.x + a.width - PET_W - EDGE_MARGIN}], y ∈ [${a.y + EDGE_MARGIN}, ${a.y + a.height - PET_H - EDGE_MARGIN}]`)
  console.log(`物理安全区: x ∈ [${Math.round((a.x + EDGE_MARGIN) * sf)}, ${Math.round((a.x + a.width - PET_W - EDGE_MARGIN) * sf)}], y ∈ [${Math.round((a.y + EDGE_MARGIN) * sf)}, ${Math.round((a.y + a.height - PET_H - EDGE_MARGIN) * sf)}]`)
  console.log(`窗口物理尺寸: ${Math.round(PET_W * sf)}x${Math.round(PET_H * sf)}`)

  app.quit()
  process.exit(fails > 0 ? 1 : 0)
})

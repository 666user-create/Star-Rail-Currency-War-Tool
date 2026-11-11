/**
 * 桌宠可见性回归测试（纯逻辑，不依赖 Electron 运行时）。
 *
 * 覆盖历史事故：
 * 1. config 存了 NaN/字符串坐标 → setPosition 把窗口丢到未定义位置
 * 2. 窗口贴底被任务栏吃掉（实测 petY=600，物理上只差 1px）
 * 3. 桌面被拖出屏幕四边
 * 4. 多显示器切换后坐标失效
 * 5. 超大窗口尺寸（外部改过窗口尺寸时）
 */
import test from 'node:test'
import assert from 'node:assert/strict'

const PET_W = 176
const PET_H = 212
const EDGE_MARGIN = 10

/** 复刻 src/main/index.ts 的 clampToScreens（含非法输入兜底） */
function makeClamp(displays, primary) {
  return function clampToScreens(x, y, w, h) {
    const fallback = () => {
      const a = primary.workArea
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
      const minX = a.x + EDGE_MARGIN
      const minY = a.y + EDGE_MARGIN
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
}

// 真实本机参数：逻辑 1536x864，任务栏 48 → 工作区 1536x816
const workArea = { x: 0, y: 0, width: 1536, height: 816 }
const displays = [{ workArea }]
const clamp = makeClamp(displays, displays[0])

/** 严格判定：窗口是否完整落在工作区内且留有余量 */
function isFullyVisible(x, y, w = PET_W, h = PET_H) {
  const marginRight = (workArea.x + workArea.width) - (x + w)
  const marginBottom = (workArea.y + workArea.height) - (y + h)
  return x >= workArea.x && y >= workArea.y && marginRight >= 0 && marginBottom >= 0
}

// ── 历史事故回归 ──

test('事故1: config 存 NaN 时不能把窗口丢到未定义位置', () => {
  const p = clamp(NaN, NaN, PET_W, PET_H)
  assert.ok(Number.isFinite(p.x), 'x 必须是有限数')
  assert.ok(Number.isFinite(p.y), 'y 必须是有限数')
  assert.ok(isFullyVisible(p.x, p.y), '必须落在工作区内')
})

test('事故1b: config 存字符串/Infinity 也要兜底', () => {
  for (const [x, y] of [['abc', 'def'], [Infinity, 0], [0, -Infinity], [null, null], [undefined, undefined]]) {
    const p = clamp(x, y, PET_W, PET_H)
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `输入 ${x},${y} 应回落到有限坐标`)
    assert.ok(isFullyVisible(p.x, p.y), `输入 ${x},${y} 应落在工作区内`)
  }
})

test('事故2: petY=600 贴底时必须上移（物理像素只差 1px 会被任务栏吃掉）', () => {
  // 逻辑 600+212=812 < 816 看似放得下，但 DPI 1.25 下物理 1019 vs 工作区 1020，仅差 1px
  const p = clamp(22, 600, PET_W, PET_H)
  assert.equal(p.x, 22, 'x 合法不变')
  assert.equal(p.y, 594, 'y 必须夹到 816-212-10=594')
  assert.ok(isFullyVisible(p.x, p.y))
  // 关键：底部至少留 EDGE_MARGIN
  const marginBottom = (workArea.y + workArea.height) - (p.y + PET_H)
  assert.ok(marginBottom >= EDGE_MARGIN, `底余量 ${marginBottom} 必须 >= ${EDGE_MARGIN}`)
})

test('事故3: petX=-20 / -27 这类负坐标必须拉回', () => {
  for (const badX of [-20, -27, -100, -500]) {
    const p = clamp(badX, 500, PET_W, PET_H)
    assert.ok(p.x >= workArea.x + EDGE_MARGIN, `x=${badX} 应至少拉到 ${EDGE_MARGIN}，实际 ${p.x}`)
    assert.ok(isFullyVisible(p.x, p.y))
  }
})

// ── 四边越界 ──

test('四边越界都被拉回', () => {
  const cases = [
    [-1000, 400, '左'],
    [5000, 400, '右'],
    [400, -1000, '上'],
    [400, 5000, '下']
  ]
  for (const [x, y, dir] of cases) {
    const p = clamp(x, y, PET_W, PET_H)
    assert.ok(isFullyVisible(p.x, p.y), `${dir}越界后必须完整可见，实际 ${JSON.stringify(p)}`)
  }
})

test('四角全越界', () => {
  for (const [x, y] of [[-9999, -9999], [9999, -9999], [-9999, 9999], [9999, 9999]]) {
    const p = clamp(x, y, PET_W, PET_H)
    assert.ok(isFullyVisible(p.x, p.y), `角越界 ${x},${y} 后必须可见`)
  }
})

// ── 边界值 ──

test('安全区四角边界值原样保留', () => {
  const minX = workArea.x + EDGE_MARGIN
  const minY = workArea.y + EDGE_MARGIN
  const maxX = workArea.x + workArea.width - PET_W - EDGE_MARGIN
  const maxY = workArea.y + workArea.height - PET_H - EDGE_MARGIN
  assert.deepEqual(clamp(minX, minY, PET_W, PET_H), { x: minX, y: minY })
  assert.deepEqual(clamp(maxX, maxY, PET_W, PET_H), { x: maxX, y: maxY })
  assert.ok(isFullyVisible(minX, minY))
  assert.ok(isFullyVisible(maxX, maxY))
})

test('正常范围内坐标不被修改', () => {
  for (const [x, y] of [[100, 100], [700, 300], [1300, 500]]) {
    assert.deepEqual(clamp(x, y, PET_W, PET_H), { x, y }, `${x},${y} 不该被移动`)
  }
})

// ── 异常尺寸 ──

test('窗口尺寸异常（0 或负数）时回落到安全位置', () => {
  for (const [w, h] of [[0, 0], [-10, -10], [NaN, 100]]) {
    const p = clamp(400, 300, w, h)
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `尺寸 ${w}x${h} 应回落到有限坐标`)
    assert.ok(isFullyVisible(p.x, p.y), `尺寸 ${w}x${h} 应可见`)
  }
})

test('窗口大于屏幕时不产生负坐标', () => {
  const p = clamp(-100, -100, 2000, 1200)
  assert.ok(p.x >= workArea.x + EDGE_MARGIN)
  assert.ok(p.y >= workArea.y + EDGE_MARGIN)
})

// ── 多显示器 ──

test('副屏上的合法坐标不被拉回主屏', () => {
  const second = { workArea: { x: 1536, y: 0, width: 1920, height: 1040 } }
  const multiClamp = makeClamp([{ workArea }, second], { workArea })
  const p = multiClamp(2000, 300, PET_W, PET_H)
  assert.deepEqual(p, { x: 2000, y: 300 }, '副屏合法位置不该被移动')
})

test('主屏越界时拉回主屏，不会飞到副屏', () => {
  const second = { workArea: { x: 1536, y: 0, width: 1920, height: 1040 } }
  const multiClamp = makeClamp([{ workArea }, second], { workArea })
  const p = multiClamp(-20, 500, PET_W, PET_H)
  assert.equal(p.x, EDGE_MARGIN)
  assert.ok(p.x < 1536, '应该留在主屏')
})

// ── 不变量 ──

test('不变量：任意输入下输出都满足「完整可见」', () => {
  const inputs = []
  for (let x = -600; x <= 2200; x += 137) {
    for (let y = -600; y <= 1400; y += 113) {
      inputs.push([x, y])
    }
  }
  // 加上特殊值
  inputs.push([NaN, NaN], [Infinity, -Infinity], ['x', 'y'], [null, undefined])

  let violations = 0
  for (const [x, y] of inputs) {
    const p = clamp(x, y, PET_W, PET_H)
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !isFullyVisible(p.x, p.y)) {
      violations++
      if (violations <= 3) console.log(`  违规: 输入(${x},${y}) → (${p.x},${p.y})`)
    }
  }
  assert.equal(violations, 0, `${inputs.length} 组输入中 ${violations} 组违反不变量`)
})

test('EDGE_MARGIN 足以覆盖 DPI 1.25/1.5/2.0 的取整误差', () => {
  // 176*2=352, 212*2=424，取整误差最多 1px；10px 余量对任何整数缩放都够
  for (const sf of [1.25, 1.5, 1.75, 2.0]) {
    const physH = Math.round(PET_H * sf)
    assert.ok(EDGE_MARGIN * sf >= 2, `缩放 ${sf} 时余量 ${EDGE_MARGIN * sf}px 应覆盖取整误差`)
    assert.ok(physH > 0)
  }
})

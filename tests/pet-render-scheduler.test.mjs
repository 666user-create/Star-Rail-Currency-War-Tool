import test from 'node:test'
import assert from 'node:assert/strict'
import { createPetRenderScheduler } from '../src/renderer/src/pet/petRenderScheduler.ts'

/** 只模拟浏览器时钟与任务队列，断言实际执行/挂起次数，不依赖显示器或游戏素材。 */
function browserClock(refreshRate = 60) {
  let time = 0
  let sequence = 0
  let frameRequests = 0
  const pending = new Map()
  const enqueue = (kind, callback, due) => {
    const id = sequence++ // 包含合法的 0 句柄，取消逻辑不能依赖 truthiness。
    pending.set(id, { kind, callback, due })
    return id
  }
  const platform = {
    now: () => time,
    requestFrame(callback) {
      frameRequests++
      return enqueue('frame', callback, (Math.floor((time + 0.000001) / (1000 / refreshRate)) + 1) * (1000 / refreshRate))
    },
    cancelFrame: id => pending.delete(id),
    setTimer: (callback, delay) => enqueue('timer', callback, time + delay),
    clearTimer: id => pending.delete(id)
  }
  const advance = target => {
    let executed = 0
    while (true) {
      const next = [...pending.entries()].sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0]
      if (!next || next[1].due > target + 0.000001) break
      assert(++executed < 10000, '调度不能产生零延时死循环')
      time = next[1].due
      pending.delete(next[0])
      next[1].callback()
    }
    time = target
  }
  return { platform, advance, pending, requests: () => frameRequests }
}

test('待机以约 20fps 更新，等待期间使用 timer，不以 60fps 空跑 rAF', () => {
  const clock = browserClock()
  const frames = []
  const scheduler = createPetRenderScheduler({ platform: clock.platform, mode: () => 'idle', render: now => frames.push(now) })
  scheduler.invalidate()
  clock.advance(1000)
  assert(frames.length >= 19 && frames.length <= 21, `实际更新 ${frames.length} 次`)
  assert(clock.requests() <= 21, 'rAF 请求数量也受到节流，不仅跳过重绘')
  assert.equal(clock.pending.size, 1)
  assert.equal([...clock.pending.values()][0].kind, 'timer')
  scheduler.stop()
  assert.equal(clock.pending.size, 0)
})

test('动作和短暂混合保持约 60fps，结束后转为待机低帧率', () => {
  const clock = browserClock()
  const frames = []
  const scheduler = createPetRenderScheduler({
    platform: clock.platform,
    mode: now => now < 300 ? 'animation' : 'idle',
    render: now => frames.push(now)
  })
  scheduler.invalidate()
  clock.advance(1000)
  const moving = frames.filter(now => now < 300)
  const idle = frames.filter(now => now >= 350)
  assert(moving.length >= 17 && moving.length <= 18, '300ms 动作约有 18 个显示帧')
  assert(idle.length >= 12 && idle.length <= 14, '后续待机约为 20fps')
  assert(moving.slice(1).every((now, i) => now - moving[i] < 17), '动作更新间隔保持显示帧率')
  scheduler.stop()
})

test('165Hz 屏幕的动作也限制在约 60fps，不以屏幕最高刷新率空转', () => {
  const clock = browserClock(165)
  const frames = []
  const scheduler = createPetRenderScheduler({ platform: clock.platform, mode: () => 'animation', render: now => frames.push(now) })
  scheduler.invalidate()
  clock.advance(2000)
  assert(frames.length >= 119 && frames.length <= 121, `2 秒实际更新 ${frames.length} 次`)
  assert(clock.requests() <= 121, '高刷屏也不连续请求 165fps rAF')
  scheduler.stop()
})

test('定点预览只渲染一次，更新时间时按需唤醒且合并重复请求', () => {
  const clock = browserClock()
  const frames = []
  const scheduler = createPetRenderScheduler({ platform: clock.platform, mode: () => 'still', render: now => frames.push(now) })
  scheduler.invalidate()
  scheduler.invalidate()
  scheduler.invalidate()
  clock.advance(1000)
  assert.equal(frames.length, 1)
  assert.equal(clock.requests(), 1)
  assert.equal(clock.pending.size, 0, '暂停预览没有持续 rAF 或 timer')
  scheduler.invalidate()
  clock.advance(2000)
  assert.equal(frames.length, 2, '进度或视角改变后可以继续显示新姿态')
  scheduler.stop()
})

test('收起立即取消已挂起的待机 timer，隐藏期间零更新，恢复可继续呼吸', () => {
  const clock = browserClock()
  let hidden = false
  let count = 0
  const scheduler = createPetRenderScheduler({
    platform: clock.platform, mode: () => hidden ? 'paused' : 'idle', render: () => count++
  })
  scheduler.invalidate()
  clock.advance(30)
  assert.equal(count, 1)
  assert.equal([...clock.pending.values()][0].kind, 'timer')
  hidden = true
  scheduler.invalidate()
  assert.equal(clock.pending.size, 0)
  clock.advance(10000)
  assert.equal(count, 1)
  hidden = false
  scheduler.invalidate()
  clock.advance(10100)
  assert(count >= 2 && count <= 4)
  scheduler.stop()
})

test('收起取消动作 rAF；真实时间照常前进，恢复不重新播放已结束动作', () => {
  const clock = browserClock()
  let hidden = false
  let actionStart = 0
  const phases = []
  const scheduler = createPetRenderScheduler({
    platform: clock.platform,
    mode: now => hidden ? 'paused' : now - actionStart < 200 ? 'animation' : 'still',
    render: now => phases.push(now - actionStart)
  })
  scheduler.invalidate()
  clock.advance(50)
  const beforeHide = phases.length
  hidden = true
  scheduler.invalidate()
  assert.equal(clock.pending.size, 0)
  clock.advance(5000)
  assert.equal(phases.length, beforeHide)
  hidden = false
  scheduler.invalidate()
  clock.advance(5500)
  assert.equal(phases.length, beforeHide + 1)
  assert(phases.at(-1) > 5000, '恢复采用当前真实时间，不从相位零开始')
  assert.equal(clock.pending.size, 0)
  actionStart = clock.platform.now()
  scheduler.invalidate()
  clock.advance(5600)
  assert(phases.at(-1) < 120, '恢复后新触发的动作可立即正常播放')
  scheduler.stop()
})

test('隐藏时收到新动作仅保留时钟状态；未结束可继续，已经结束只更新末帧', () => {
  const clock = browserClock()
  let hidden = true
  let actionStart = 0
  const phases = []
  const scheduler = createPetRenderScheduler({
    platform: clock.platform,
    mode: now => hidden ? 'paused' : now - actionStart < 300 ? 'animation' : 'still',
    render: now => phases.push(now - actionStart)
  })
  scheduler.invalidate()
  assert.equal(clock.pending.size, 0)
  clock.advance(1000)
  actionStart = clock.platform.now()
  scheduler.invalidate()
  clock.advance(1100)
  hidden = false
  scheduler.invalidate()
  clock.advance(1150)
  assert(phases.length >= 2)
  assert(phases[0] >= 100 && phases[0] < 120)
  hidden = true
  scheduler.invalidate()
  clock.advance(2000)
  const pausedAt = phases.length
  hidden = false
  scheduler.invalidate()
  clock.advance(2500)
  assert.equal(phases.length, pausedAt + 1)
  assert(phases.at(-1) >= 1000)
  assert.equal(clock.pending.size, 0)
  scheduler.stop()
})

test('销毁取消包括句柄 0 的帧，旧实例不能再被唤醒', () => {
  const clock = browserClock()
  let count = 0
  const scheduler = createPetRenderScheduler({ platform: clock.platform, mode: () => 'animation', render: () => count++ })
  scheduler.invalidate()
  assert(clock.pending.has(0))
  scheduler.stop()
  scheduler.invalidate()
  clock.advance(1000)
  assert.equal(clock.pending.size, 0)
  assert.equal(count, 0)
})

// 计时「暂停-恢复」语义测试
// 需求：重启后延续上次未结束的计时进度，但不把软件关闭期间的时长算进去
import test from 'node:test'
import assert from 'node:assert/strict'

// 复刻 recordingStore 的语义
function makeStore() {
  return {
    state: { startedAt: null, accumulatedSec: 0 },
    start(now) {
      this.state.startedAt = now
      this.state.accumulatedSec = 0
    },
    elapsedSec(now) {
      const base = this.state.accumulatedSec ?? 0
      if (this.state.startedAt === null) return base
      return base + Math.max(0, Math.round((now - this.state.startedAt) / 1000))
    },
    pauseRunningTimer(now) {
      if (this.state.startedAt === null) return
      const base = this.state.accumulatedSec ?? 0
      this.state.accumulatedSec = base + Math.max(0, Math.round((now - this.state.startedAt) / 1000))
      this.state.startedAt = null
    },
    resumeRunningTimer(now) {
      if (this.state.startedAt !== null) return this.state.startedAt
      const base = this.state.accumulatedSec ?? 0
      if (base <= 0) return null
      const startedAt = now - base * 1000
      if (startedAt < 0) return null
      // 关键：base 已折进 startedAt，必须清零否则 elapsedSec 会双算
      this.state.startedAt = startedAt
      this.state.accumulatedSec = 0
      return startedAt
    }
  }
}

test('计时 10 分钟后退出 → 已累计 600 秒', () => {
  const store = makeStore()
  const t0 = 1000000
  store.start(t0)
  // 10 分钟后退出
  store.pauseRunningTimer(t0 + 10 * 60 * 1000)
  assert.equal(store.state.accumulatedSec, 600)
  assert.equal(store.state.startedAt, null, '退出后不应留下 startedAt')
})

test('关键：隔 1 小时再启动，计时从 10 分钟继续（不是从 70 分钟）', () => {
  const store = makeStore()
  const t0 = 1000000
  store.start(t0)
  store.pauseRunningTimer(t0 + 10 * 60 * 1000) // 已计 10 分钟

  // 1 小时后重启
  const restartAt = t0 + 70 * 60 * 1000
  const resumed = store.resumeRunningTimer(restartAt)
  assert.notEqual(resumed, null, '应该恢复计时')
  assert.equal(store.elapsedSec(restartAt), 600, '重启瞬间仍是 10 分钟，不含关闭的 1 小时')

  // 继续打 5 分钟
  assert.equal(store.elapsedSec(restartAt + 5 * 60 * 1000), 900, '10 分钟 + 5 分钟 = 15 分钟')
})

test('多次重启累计，每次都只算实际运行时间', () => {
  const store = makeStore()
  const t0 = 1000000
  store.start(t0)

  // 第一次：打 10 分钟，退出
  store.pauseRunningTimer(t0 + 10 * 60 * 1000)
  // 隔 2 小时重启
  const r1 = t0 + 130 * 60 * 1000
  store.resumeRunningTimer(r1)
  assert.equal(store.elapsedSec(r1), 600)

  // 第二次：再打 5 分钟，退出
  store.pauseRunningTimer(r1 + 5 * 60 * 1000)
  assert.equal(store.state.accumulatedSec, 900, '累计 15 分钟')

  // 隔 3 小时再重启
  const r2 = r1 + 5 * 60 * 1000 + 180 * 60 * 1000
  store.resumeRunningTimer(r2)
  assert.equal(store.elapsedSec(r2), 900, '仍是 15 分钟，两次关闭的时间都没算进去')
})

test('没有未结束计时时，resume 返回 null', () => {
  const store = makeStore()
  assert.equal(store.resumeRunningTimer(Date.now()), null)
})

test('新开一局会把累计清零', () => {
  const store = makeStore()
  store.state.accumulatedSec = 900 // 上次累计 15 分钟
  store.start(2000000)
  assert.equal(store.state.accumulatedSec, 0, '新一局从 0 起算')
  assert.equal(store.elapsedSec(2000000 + 60000), 60, '1 分钟后是 1 分钟')
})

test('正常结束一局时会把累计清零', () => {
  const store = makeStore()
  store.state.accumulatedSec = 900
  store.state.startedAt = null
  // 模拟 end() 里的清零
  store.state.accumulatedSec = 0
  assert.equal(store.elapsedSec(Date.now()), 0)
})

// 计时状态清理测试：软件关闭后不应继续累计
import test from 'node:test'
import assert from 'node:assert/strict'

// 复刻启动时的处理逻辑
function onStartup(state) {
  const staleStartedAt = state.startedAt
  if (staleStartedAt !== null) {
    state.startedAt = null
    state.discarded = true
    state.discardedAfterMs = Date.now() - staleStartedAt
  }
  return state.startedAt
}

test('上次退出时在计时 → 启动后清零', () => {
  const state = { startedAt: Date.now() - 2 * 3600 * 1000, drafts: [] }
  const result = onStartup(state)
  assert.equal(result, null, '启动后不应继续计时')
  assert.equal(state.startedAt, null, '持久化状态也要清掉')
  assert.equal(state.discarded, true)
})

test('上次正常结束（startedAt 为 null）→ 保持 null', () => {
  const state = { startedAt: null, drafts: [] }
  const result = onStartup(state)
  assert.equal(result, null)
  assert.equal(state.discarded, undefined, '没东西可丢弃就不该标记')
})

test('草稿不受影响', () => {
  const drafts = [{ id: 'd1' }, { id: 'd2' }]
  const state = { startedAt: Date.now() - 60000, drafts }
  onStartup(state)
  assert.equal(state.drafts.length, 2, '丢弃计时不应删除草稿')
})

test('回归：热重启不会把关闭期间算进对局', () => {
  // 场景：晚上 10 点开始计时，忘记结束就关了软件，第二天早上 8 点启动
  const startedAt = new Date(2026, 10, 12, 22, 0, 0).getTime()
  const restartAt = new Date(2026, 10, 13, 8, 0, 0).getTime()
  const wouldBeMinutes = (restartAt - startedAt) / 60000 // 600 分钟

  assert.ok(wouldBeMinutes > 590, '如果不清理，会算出 600 分钟这种离谱时长')

  // 清理后时长应为 0（没在计时）
  const state = { startedAt, drafts: [] }
  const after = onStartup(state)
  assert.equal(after, null, '清理后不处于计时状态，不会产生 600 分钟的假对局')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSettings, idleDelayMs, IDLE_ACTIVITY_SECONDS } from '../src/shared/petPreferences.ts'

test('默认赛季可设置或清空，旧配置不自动套入未经确认的赛季', () => {
  assert.equal(normalizeSettings({}).recordSeason, undefined)
  assert.equal(normalizeSettings({ recordSeason: ' 零和博弈 ' }).recordSeason, '零和博弈')
  assert.equal(normalizeSettings({ recordSeason: '' }).recordSeason, undefined)
  assert.equal(normalizeSettings({ recordSeason: true }).recordSeason, undefined)
  assert.equal(normalizeSettings({ recordSeason: '长'.repeat(100) }).recordSeason.length, 80)
})

test('旧配置补齐陪伴偏好，保留原来的路径、形象与位置', () => {
  const settings = normalizeSettings({ gamePath: 'D:/StarRail.exe', petX: -200, petY: 340, petStyle: 'official' })
  assert.deepEqual(settings, { gamePath: 'D:/StarRail.exe', petX: -200, petY: 340, petStyle: 'official', quietMode: false, idleAnimations: true, idleTalk: true, activity: 'normal' })
})

test('安静模式保留独立偏好，关闭后仍能按原来的组合陪伴', () => {
  const original = normalizeSettings({ idleAnimations: false, idleTalk: true, activity: 'low' })
  const quiet = normalizeSettings({ ...original, quietMode: true })
  assert.equal(quiet.idleAnimations, false)
  assert.equal(quiet.idleTalk, true)
  assert.deepEqual(normalizeSettings({ ...quiet, quietMode: false }), original)
})

test('无效配置回退为安全默认值，不向窗口传入无穷坐标', () => {
  for (const value of [null, [], 'wrong', { gamePath: false, quietMode: 'true', idleTalk: null, activity: 'instant', petX: Infinity, petY: NaN }]) {
    assert.deepEqual(normalizeSettings(value), normalizeSettings(null))
  }
})

test('三档活跃频率范围稳定，随机值异常也不会产生忙循环', () => {
  for (const [activity, [min, max]] of Object.entries(IDLE_ACTIVITY_SECONDS)) {
    assert.equal(idleDelayMs(activity, 0), min * 1000)
    assert.equal(idleDelayMs(activity, 1), max * 1000)
    for (const random of [-2, 0.4, 4, NaN, Infinity]) {
      const delay = idleDelayMs(activity, random)
      assert(Number.isFinite(delay) && delay >= min * 1000 && delay <= max * 1000)
    }
  }
})

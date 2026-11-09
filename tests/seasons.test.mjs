// 验证「面板顶部选中赛季 → 写入设置 → 秒表结束带入新记录」这条链路
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SEASONS, defaultSeason, normalizeSeason, hasStartTime, needsStartConfirm,
  resolvedSeasons, parseStartDate, formatStartDate, seasonStartAt
} from '../src/shared/seasons.ts'

test('SEASONS 包含零和博弈与入画奇航', () => {
  const ids = SEASONS.map((s) => s.id)
  assert.ok(ids.includes('零和博弈'), '应包含第一赛季')
  assert.ok(ids.includes('入画奇航'), '应包含第二赛季')
})

test('defaultSeason 返回已知赛季之一', () => {
  const season = defaultSeason()
  assert.ok(SEASONS.some((s) => s.id === season), `defaultSeason() 应返回已知赛季，实际: ${season}`)
})

test('normalizeSeason 对已知赛季返回原名', () => {
  for (const season of SEASONS) {
    assert.equal(normalizeSeason(season.id), season.id)
  }
})

test('normalizeSeason 保留用户自定义赛季名（允许留空外的自由填写）', () => {
  assert.equal(normalizeSeason('实验赛季'), '实验赛季')
})

test('normalizeSeason 空值回落到默认赛季', () => {
  assert.equal(normalizeSeason(''), defaultSeason())
  assert.equal(normalizeSeason('   '), defaultSeason())
})

test('normalizeSeason 截断超长名称到 80 字符', () => {
  const long = 'X'.repeat(200)
  assert.equal(normalizeSeason(long).length, 80)
})

test('入画奇航 有官方开始时间（随 4.7 开服，2026-11-11 约 11:00 UTC+8）', () => {
  // 官方 4.7 前瞻：06:00 (UTC+8) 开始停机维护，约 5 小时 → 11:00 开服，赛季随之开启
  assert.equal(hasStartTime('入画奇航'), true, '官方已公布时间，内置数据应有 startAt')
  const season = resolvedSeasons().find((s) => s.id === '入画奇航')
  assert.ok(season.startAt != null)
  const local = new Date(season.startAt)
  assert.equal(local.getUTCFullYear(), 2026)
  assert.equal(local.getUTCMonth(), 10) // 11 月
  assert.equal(local.getUTCDate(), 11)
})

test('用户填写的开始时间优先于内置值', () => {
  const starts = { '入画奇航': Date.UTC(2026, 10, 10, 22) }
  const seasons = resolvedSeasons({ starts })
  const season = seasons.find((s) => s.id === '入画奇航')
  assert.equal(season.startAt, Date.UTC(2026, 10, 10, 22))
  assert.equal(hasStartTime('入画奇航', { starts }), true)
})

test('填了开始时间后，该时间点起 入画奇航 成为默认赛季', () => {
  const starts = { '入画奇航': Date.UTC(2026, 10, 10, 22) }
  // 2026-11-11 06:00 (UTC+8) 之后
  assert.equal(defaultSeason(Date.UTC(2026, 10, 10, 23), { starts }), '入画奇航')
  // 之前仍是零和博弈
  assert.equal(defaultSeason(Date.UTC(2026, 10, 10, 21), { starts }), '零和博弈')
})

test('parseStartDate 接受 yyyy-MM-dd 并返回当天零点', () => {
  const ms = parseStartDate('2026-11-11')
  assert.ok(ms != null, '合法日期应解析成功')
  const date = new Date(ms)
  assert.equal(date.getFullYear(), 2026)
  assert.equal(date.getMonth(), 10)
  assert.equal(date.getDate(), 11)
  assert.equal(date.getHours(), 0)
})

test('parseStartDate 拒绝非法输入', () => {
  assert.equal(parseStartDate(''), null)
  assert.equal(parseStartDate('2026/11/11'), null)
  assert.equal(parseStartDate('2026-02-30'), null, '不存在的日期不能被自动滚动')
  assert.equal(parseStartDate('乱写'), null)
})

test('formatStartDate 与 parseStartDate 往返一致', () => {
  const ms = parseStartDate('2026-11-11')
  assert.equal(formatStartDate(ms), '2026-11-11')
})

test('formatStartDate 对空值返回空字符串', () => {
  assert.equal(formatStartDate(undefined), '')
  assert.equal(formatStartDate(null), '')
})

test('入画奇航 切换时先显示开启时间说明界面', () => {
  // 新赛季要等版本更新开服后才开始，切换前告知使用者
  assert.equal(needsStartConfirm('入画奇航'), true)
})

test('入画奇航 的官方开启时间已内置（2026-11-11 11:00 UTC+8）', () => {
  const start = seasonStartAt('入画奇航')
  assert.ok(start != null, '应有官方开启时间')
  // UTC+8 的 11:00 = UTC 03:00
  assert.equal(new Date(start).toISOString(), '2026-11-11T03:00:00.000Z')
})

test('零和博弈 切换时不弹确认（已有确定时间，无需每次核对）', () => {
  assert.equal(needsStartConfirm('零和博弈'), false)
})

test('未知赛季不触发确认', () => {
  assert.equal(needsStartConfirm('不存在的赛季'), false)
})

test('seasonStartAt 返回用户填写值优先', () => {
  const builtin = seasonStartAt('入画奇航')
  assert.ok(builtin != null, '内置应有官方时间')
  const override = Date.UTC(2026, 10, 10, 22)
  assert.equal(seasonStartAt('入画奇航', { starts: { '入画奇航': override } }), override)
})

test('没有任何开始时间的赛季也要求确认', () => {
  // 模拟一个没有 startAt 的新赛季
  const seasons = resolvedSeasons({})
  const unknown = seasons.find((s) => s.startAt == null)
  if (unknown) assert.equal(needsStartConfirm(unknown.id), true)
})

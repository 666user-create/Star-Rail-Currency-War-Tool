// 验证「面板顶部选中赛季 → 写入设置 → 秒表结束带入新记录」这条链路
import test from 'node:test'
import assert from 'node:assert/strict'
import { SEASONS, defaultSeason, normalizeSeason } from '../src/shared/seasons.ts'

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

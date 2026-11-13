// 段位打分与排序测试：直接测真实实现（src/shared/ranks.ts）
import test from 'node:test'
import assert from 'node:assert/strict'
import { rankToScore, subLevelGain } from '../src/shared/ranks.ts'

test('分数 = 大段序号×1000 + 小段位，按官方档数夹断', () => {
  assert.equal(rankToScore('A0 黑铁1'), 1)
  assert.equal(rankToScore('A3 钴银5'), 3005)
  assert.equal(rankToScore('A5 紫金9'), 5009)
  assert.equal(rankToScore('A6 投资大师7'), 6007)
  assert.equal(rankToScore('A7 资本帝王9'), 7009)
  assert.equal(rankToScore('A8 财富造物主3'), 8003)
  assert.equal(rankToScore('A8 财富造物主20'), 8020)
})

test('排序：大段优先，小段位靠后', () => {
  const a = rankToScore('A5 紫金9')
  const b = rankToScore('A6 投资大师1')
  assert.ok(a !== null && b !== null && a < b, 'A5满档不能高于 A6一档')
  const c = rankToScore('A7 资本帝王9')
  const d = rankToScore('A8 财富造物主1')
  assert.ok(c !== null && d !== null && c < d)
})

test('脏数据：超出档数的值按上限排序，不会排到阶梯之外', () => {
  assert.equal(rankToScore('财富造物主50'), rankToScore('A8 财富造物主20'))
  assert.equal(rankToScore('紫金99'), rankToScore('A5 紫金9'))
})

test('未填小段位：按 0 排，在大段内最小但不越段', () => {
  const noSub = rankToScore('A7 资本帝王')
  const one = rankToScore('A7 资本帝王1')
  const prevBandTop = rankToScore('A6 投资大师9')
  assert.ok(noSub !== null && one !== null && prevBandTop !== null)
  assert.ok(noSub < one)
  assert.ok(noSub > prevBandTop, 'A7 未填仍高于 A6 满档')
})

test('无法解析返回 null（调用方跳过该点）', () => {
  assert.equal(rankToScore(''), null)
  assert.equal(rankToScore('随便写点'), null)
})

test('跨段涨幅跟随官方档数（黑铁/青铜只有 3 档）', () => {
  // A0 只有 3 档：黑铁2 → 青铜1 = (3−2)+1 = 2
  assert.equal(subLevelGain({ code: 'A0', sub: 2 }, { code: 'A1', sub: 1 }), 2)
  // A3 有 5 档：钴银5 → 冰钛1 = (5−5)+1 = 1
  assert.equal(subLevelGain({ code: 'A3', sub: 5 }, { code: 'A4', sub: 1 }), 1)
  // A4 有 7 档：冰钛7 → 紫金2 = (7−7)+2 = 2
  assert.equal(subLevelGain({ code: 'A4', sub: 7 }, { code: 'A5', sub: 2 }), 2)
})

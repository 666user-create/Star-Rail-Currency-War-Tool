// 职级模块测试：直接测真实实现（src/shared/ranks.ts），不再是本地复制一份逻辑
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RANKS,
  displayRank,
  formatRank,
  isMaxRank,
  isSubOverflow,
  maxSubLevel,
  parseRank,
  rankByCode,
  rankToScore,
  subLevelGain
} from '../src/shared/ranks.ts'

test('官方档数表：A0-2=3 / A3=5 / A4=7 / A5-7=9 / A8=20', () => {
  const expected = { A0: 3, A1: 3, A2: 3, A3: 5, A4: 7, A5: 9, A6: 9, A7: 9, A8: 20 }
  for (const [code, cap] of Object.entries(expected)) {
    assert.equal(maxSubLevel(code), cap, `${code} 应有 ${cap} 档`)
    assert.equal(rankByCode(code)?.maxSub, cap)
  }
  // 不认识的大段不限制（避免卡住未来新增档位）
  assert.equal(maxSubLevel('A9'), Number.POSITIVE_INFINITY)
  assert.equal(RANKS.length, 9)
})

test('格式与展示：formatRank 带前缀，displayRank 去掉前缀', () => {
  assert.equal(formatRank({ code: 'A5', sub: 3 }), 'A5 紫金3')
  assert.equal(formatRank({ code: 'A8', sub: 20 }), 'A8 财富造物主20')
  assert.equal(formatRank({ code: 'A8', sub: 0 }), 'A8 财富造物主')
  assert.equal(displayRank('A7 资本帝王2'), '资本帝王2')
  assert.equal(displayRank('资本帝王2'), '资本帝王2')
  assert.equal(displayRank('A8 财富造物主20'), '财富造物主20')
  assert.equal(displayRank(''), '')
})

test('解析：保留原始小段位，不再静默夹断', () => {
  assert.deepEqual(parseRank('A5 紫金3'), { code: 'A5', sub: 3 })
  assert.deepEqual(parseRank('紫金3'), { code: 'A5', sub: 3 })
  assert.deepEqual(parseRank('A3 钴银5'), { code: 'A3', sub: 5 })
  // 旧赛季遗留的 50 档：保留 50，交给 isSubOverflow 去发现
  assert.deepEqual(parseRank('财富造物主50'), { code: 'A8', sub: 50 })
  // 没写小段位 → 0（表示未填，不是第 0 档）
  assert.deepEqual(parseRank('A7 资本帝王'), { code: 'A7', sub: 0 })
  assert.equal(parseRank(''), null)
  assert.equal(parseRank('不存在'), null)
})

test('isSubOverflow 能发现超出该档档数的记录', () => {
  assert.equal(isSubOverflow({ code: 'A8', sub: 20 }), false)
  assert.equal(isSubOverflow({ code: 'A8', sub: 21 }), true)
  assert.equal(isSubOverflow({ code: 'A8', sub: 50 }), true)
  assert.equal(isSubOverflow({ code: 'A0', sub: 3 }), false)
  assert.equal(isSubOverflow({ code: 'A0', sub: 4 }), true)
  assert.equal(isSubOverflow({ code: 'A5', sub: 9 }), false)
  assert.equal(isSubOverflow({ code: 'A5', sub: 10 }), true)
})

test('isMaxRank 只认「正好满档」，避免把脏数据当满级', () => {
  assert.equal(isMaxRank({ code: 'A8', sub: 20 }), true)
  assert.equal(isMaxRank({ code: 'A8', sub: 19 }), false)
  assert.equal(isMaxRank({ code: 'A8', sub: 0 }), false)
  // 旧数据里的 50 档不是合法满级（以前 >= 会误判，弹出假满级贺卡）
  assert.equal(isMaxRank({ code: 'A8', sub: 50 }), false)
  assert.equal(isMaxRank({ code: 'A7', sub: 9 }), false)
  assert.equal(isMaxRank(null), false)
})

test('rankToScore 夹到该档上限，保证排序不越过阶梯', () => {
  assert.equal(rankToScore('A0 黑铁1'), 1)
  assert.equal(rankToScore('A5 紫金3'), 5003)
  assert.equal(rankToScore('A8 财富造物主20'), 8020)
  // 超限值按上限参与排序：50 档不会排到满级之上
  assert.equal(rankToScore('财富造物主50'), 8020)
  // 未填小段位按 0 排（仍能体现大段先后）
  assert.equal(rankToScore('A7 资本帝王'), 7000)
  assert.equal(rankToScore('A7 资本帝王1'), 7001)
  assert.equal(rankToScore('不是段位'), null)
})

test('subLevelGain：同档相减，跨档补满旧档再加新档', () => {
  // 同一大段
  assert.equal(subLevelGain({ code: 'A6', sub: 1 }, { code: 'A6', sub: 4 }), 3)
  assert.equal(subLevelGain({ code: 'A8', sub: 18 }, { code: 'A8', sub: 20 }), 2)
  // 跨大段：资本帝王9 → 财富造物主3 = (9−9)+3 = +3
  assert.equal(subLevelGain({ code: 'A7', sub: 9 }, { code: 'A8', sub: 3 }), 3)
  // 紫金1 → 投资大师1 = (9−1)+1 = +9
  assert.equal(subLevelGain({ code: 'A5', sub: 1 }, { code: 'A6', sub: 1 }), 9)
  // 黑铁1 → 青铜1 = (3−1)+1 = +3（A0 只有 3 档）
  assert.equal(subLevelGain({ code: 'A0', sub: 1 }, { code: 'A1', sub: 1 }), 3)
  // 没涨
  assert.equal(subLevelGain({ code: 'A7', sub: 2 }, { code: 'A7', sub: 2 }), 0)
  // 数据不足时返回 null（不猜数字）
  assert.equal(subLevelGain({ code: 'A7', sub: 0 }, { code: 'A8', sub: 3 }), null)
  assert.equal(subLevelGain({ code: 'A7', sub: 9 }, { code: 'A8', sub: 0 }), null)
  assert.equal(subLevelGain(null, { code: 'A8', sub: 3 }), null)
})

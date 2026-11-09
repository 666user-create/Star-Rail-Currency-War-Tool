// 版本比较逻辑测试：决定「有没有新版本」，错了会让用户反复收到提示或永远收不到
import test from 'node:test'
import assert from 'node:assert/strict'

/** 从 updateCheck.ts 抽出的纯逻辑（同一份实现，避免依赖 electron 运行时） */
function parseVersion(input) {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec((input ?? '').trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)]
}

function compareVersion(a, b) {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (!left || !right) return 0
  for (let i = 0; i < 3; i++) {
    if (left[i] > right[i]) return 1
    if (left[i] < right[i]) return -1
  }
  return 0
}

test('parseVersion 解析常见格式', () => {
  assert.deepEqual(parseVersion('1.2.3'), [1, 2, 3])
  assert.deepEqual(parseVersion('v1.2.3'), [1, 2, 3])
  assert.deepEqual(parseVersion('0.1.1'), [0, 1, 1])
  assert.deepEqual(parseVersion('2.0'), [2, 0, 0])
  assert.deepEqual(parseVersion('3'), [3, 0, 0])
})

test('parseVersion 拒绝无效输入', () => {
  assert.equal(parseVersion(''), null)
  assert.equal(parseVersion('abc'), null)
  assert.equal(parseVersion(null), null)
})

test('compareVersion 识别新版本', () => {
  assert.equal(compareVersion('0.1.2', '0.1.1'), 1, '0.1.2 比 0.1.1 新')
  assert.equal(compareVersion('0.2.0', '0.1.9'), 1, '次要版本优先于补丁版本')
  assert.equal(compareVersion('1.0.0', '0.9.9'), 1, '主版本优先')
})

test('compareVersion 识别旧版本与相同版本', () => {
  assert.equal(compareVersion('0.1.0', '0.1.1'), -1)
  assert.equal(compareVersion('0.1.1', '0.1.1'), 0)
  assert.equal(compareVersion('v0.1.1', '0.1.1'), 0, 'v 前缀不影响比较')
})

test('compareVersion 位数不同时按 0 补齐', () => {
  assert.equal(compareVersion('1.0', '1.0.0'), 0)
  assert.equal(compareVersion('1.1', '1.0.9'), 1)
})

test('compareVersion 遇到无法解析时视为相等（不误报更新）', () => {
  assert.equal(compareVersion('abc', '0.1.1'), 0, '解析失败不能谎报有新版本')
  assert.equal(compareVersion('0.1.1', ''), 0)
})

test('边界：大版本号不溢出', () => {
  assert.equal(compareVersion('99.99.99', '99.99.98'), 1)
  assert.equal(compareVersion('0.0.1', '0.0.0'), 1)
})

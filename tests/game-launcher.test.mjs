// 「货币战争启动!」的启动方式解析测试 —— 统一走官方启动器（米哈游启动器 HYP.exe）
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveGameLauncher } from '../src/main/gameLauncher.ts'

/** 造一个临时的游戏目录，模拟官方布局 */
function makeGameTree(t, withGame = true, withLauncher = true, withHyp = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'star-rail-launch-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  if (withGame) {
    const gameDir = path.join(root, 'Game')
    fs.mkdirSync(gameDir, { recursive: true })
    fs.writeFileSync(path.join(gameDir, 'StarRail.exe'), '')
  }
  if (withLauncher) fs.writeFileSync(path.join(root, 'launcher.exe'), '')
  if (withHyp) fs.writeFileSync(path.join(root, 'HYP.exe'), '')
  return root
}

test('统一：优先米哈游启动器 HYP.exe（即便 launcher.exe 和游戏 exe 也在）', (t) => {
  const root = makeGameTree(t, true, true, true)
  const resolved = resolveGameLauncher(root)
  assert.ok(resolved)
  assert.equal(resolved.viaLauncher, true)
  assert.equal(resolved.exe, path.join(root, 'HYP.exe'))
})

test('没有 HYP.exe 时退回游戏根下的 launcher.exe', (t) => {
  const root = makeGameTree(t, true, true, false)
  const resolved = resolveGameLauncher(root)
  assert.ok(resolved)
  assert.equal(resolved.viaLauncher, true)
  assert.equal(resolved.exe, path.join(root, 'launcher.exe'))
})

test('连 launcher.exe 都没有时，才回退到游戏 exe', (t) => {
  const root = makeGameTree(t, true, false, false)
  const resolved = resolveGameLauncher(root)
  assert.ok(resolved)
  assert.equal(resolved.viaLauncher, false)
  assert.equal(resolved.exe, path.join(root, 'Game', 'StarRail.exe'))
})

test('填 Game 目录也能定位到上级的启动器', (t) => {
  const root = makeGameTree(t, true, true, false)
  const resolved = resolveGameLauncher(path.join(root, 'Game'))
  assert.ok(resolved)
  assert.equal(resolved.viaLauncher, true)
  assert.equal(resolved.exe, path.join(root, 'launcher.exe'))
})

test('填 exe 完整路径也能定位', (t) => {
  const root = makeGameTree(t, true, true, false)
  const resolved = resolveGameLauncher(path.join(root, 'launcher.exe'))
  assert.ok(resolved)
  assert.equal(resolved.viaLauncher, true)
  assert.equal(resolved.exe, path.join(root, 'launcher.exe'))
})

test('路径无效/为空返回 null', () => {
  assert.equal(resolveGameLauncher(''), null)
  assert.equal(resolveGameLauncher('   '), null)
  assert.equal(resolveGameLauncher('/不存在/的路径'), null)
})

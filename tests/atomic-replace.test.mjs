import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { atomicReplace } from '../src/main/atomicReplace.ts'

test('Windows目标短暂被占用后仍原子替换，旧文件不会先被删除', { skip: process.platform !== 'win32' }, t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'currency-atomic-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const target = path.join(directory, 'data.json'), temporary = path.join(directory, 'data.tmp')
  fs.writeFileSync(target, 'old'); fs.writeFileSync(temporary, 'new')
  const rename = fs.renameSync
  let attempts = 0
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (attempts++ === 0) { assert.equal(fs.readFileSync(target, 'utf8'), 'old'); throw Object.assign(new Error('busy'), { code: 'EPERM' }) }
    return rename(from, to)
  })
  atomicReplace(temporary, target)
  assert.equal(fs.readFileSync(target, 'utf8'), 'new')
  assert.equal(attempts, 2)
})

test('持续写盘失败有重试上限，目标内容保持完整，其他错误立即返回', t => {
  let attempts = 0
  t.mock.method(fs, 'renameSync', () => { attempts++; throw Object.assign(new Error('denied'), { code: 'EACCES' }) })
  assert.throws(() => atomicReplace('temporary', 'destination'), /denied/)
  assert.equal(attempts, process.platform === 'win32' ? 4 : 1)
  attempts = 0
  t.mock.method(fs, 'renameSync', () => { attempts++; throw Object.assign(new Error('invalid'), { code: 'EINVAL' }) })
  assert.throws(() => atomicReplace('temporary', 'destination'), /invalid/)
  assert.equal(attempts, 1)
})

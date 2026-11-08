const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { EventEmitter } = require('node:events')
const { createShotLogger } = require('../scripts/shot-logger.cjs')

function logFile(t) {
  const file = path.join(os.tmpdir(), 'currency-war-shot-' + randomUUID() + '.log')
  t.after(() => { if (fs.existsSync(file)) fs.unlinkSync(file) })
  return file
}

class Stream extends EventEmitter {
  lines = []
  write(line) { this.lines.push(line); return true }
}

test('终端已断开时，同步 EPIPE 不会使截图日志抛出异常', (t) => {
  const file = logFile(t)
  const stdout = new Stream()
  stdout.write = () => { throw Object.assign(new Error('broken pipe'), { code: 'EPIPE' }) }
  const log = createShotLogger(file, { stdout, stderr: new Stream() })
  assert.doesNotThrow(() => { log('SAVED:', 'first.png'); log('SAVED:', 'second.png') })
  assert.match(fs.readFileSync(file, 'utf8'), /SAVED: first.png[\s\S]*SAVED: second.png/)
})

test('标准输出和错误输出的异步断管事件都有处理，不触发未捕获异常', (t) => {
  const file = logFile(t)
  const stdout = new Stream(), stderr = new Stream()
  const log = createShotLogger(file, { stdout, stderr })
  assert.doesNotThrow(() => {
    stdout.emit('error', Object.assign(new Error('broken pipe'), { code: 'EPIPE' }))
    stderr.emit('error', Object.assign(new Error('broken pipe'), { code: 'EPIPE' }))
    log('SAVED:', 'frame.png')
  })
  assert.equal(stdout.lines.length, 0)
  assert.match(fs.readFileSync(file, 'utf8'), /SAVED: frame.png/)
})

test('正常终端与文件均能收到日志，错误保留堆栈', (t) => {
  const file = logFile(t)
  const stdout = new Stream()
  const log = createShotLogger(file, { stdout, stderr: new Stream() })
  const failure = new Error('capture failed')
  log('SHOT_FAILED', failure)
  assert.equal(stdout.lines.length, 1)
  assert.ok(stdout.lines[0].includes(failure.stack))
  assert.equal(fs.readFileSync(file, 'utf8'), stdout.lines[0])
})

test('日志文件不可写时仍能报告到终端，不会遮蔽截图自身的错误处理', () => {
  const stdout = new Stream()
  const log = createShotLogger(path.join(os.tmpdir(), randomUUID(), 'missing.log'), { stdout, stderr: new Stream() })
  assert.doesNotThrow(() => log('SHOT_FAILED', new Error('original capture failure')))
  assert.match(stdout.lines[0], /original capture failure/)
})

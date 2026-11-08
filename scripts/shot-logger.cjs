const fs = require('node:fs')

/** 截图工具可能脱离启动终端；日志管道断开不能中断截图或触发 Electron 错误弹窗。 */
function createShotLogger(file, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const unavailable = new Set()
  const save = (line) => {
    try { fs.appendFileSync(file, line + '\n', 'utf8') } catch { /* 日志不可写不影响截图的退出状态。 */ }
  }
  for (const stream of new Set([stdout, stderr])) {
    if (!stream) continue
    stream.on('error', (error) => {
      unavailable.add(stream)
      save('[log stream] ' + (error.code || error.message))
    })
  }
  return (...values) => {
    const line = values.map((value) => value instanceof Error ? value.stack || value.message : String(value)).join(' ')
    save(line)
    if (!stdout || unavailable.has(stdout)) return
    try { stdout.write(line + '\n') } catch (error) {
      unavailable.add(stdout)
      save('[log stream] ' + (error.code || error.message))
    }
  }
}

module.exports = { createShotLogger }

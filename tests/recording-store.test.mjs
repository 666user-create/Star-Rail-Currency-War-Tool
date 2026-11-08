import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { RecordingStore } from '../src/main/recordingStore.ts'

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'currency-war-recording-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const file = path.join(directory, 'recording.json')
  return { directory, file, store: new RecordingStore(file) }
}

function failRename(t, file) {
  const original = fs.renameSync
  return t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === file) throw new Error('模拟文件被占用')
    return original(from, to)
  })
}

test('开始时间持久化，重复开始和重启都不会重置计时', (t) => {
  const { store, file } = fixture(t)
  assert.equal(store.getStartedAt(), null)
  assert.equal(store.start(1000), 1000)
  assert.equal(store.start(8000), 1000)
  const restarted = new RecordingStore(file)
  assert.equal(restarted.getStartedAt(), 1000)
  assert.deepEqual(restarted.list(), [])
})

test('新对局赛季随结束草稿一起落盘，历史导入不套用新对局赛季', (t) => {
  const { store, file } = fixture(t)
  store.start(1000)
  const draft = store.end(5000, ' 零和博弈 ')
  assert.equal(draft.fields.season, '零和博弈')
  assert.equal(new RecordingStore(file).get(draft.id).fields.season, '零和博弈')
  assert.equal(store.createImport(6000).fields.season, '')
})

test('结束原子冻结时间并生成一份待粘贴草稿，没有30秒下限或随机胜负', (t) => {
  const { store, file } = fixture(t)
  store.start(1000)
  const draft = store.end(3100)
  assert.equal(draft.durationSec, 2)
  assert.equal(draft.startedAt, 1000)
  assert.equal(draft.endedAt, 3100)
  // 自助截图模式：结束不再自动截屏，直接进入核对状态
  assert.equal(draft.status, 'review')
  assert.equal(draft.screenshotPath, null)
  assert(draft.warnings.some((warning) => warning.includes('粘贴')), '应提示用户自行截图后粘贴')
  assert.equal(draft.fields.result, 'suspected')
  assert.deepEqual(draft.fields.lineup, [])
  assert.equal(store.getStartedAt(), null)
  assert.equal(store.end(999999), null)
  assert.equal(store.list().length, 1)
  const disk = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.equal(disk.startedAt, null)
  assert.equal(disk.drafts[0].endedAt, 3100)
})

test('识别更新及外部对象修改不能覆盖冻结时间、身份或库内草稿', (t) => {
  const { store } = fixture(t)
  store.start(1000)
  const draft = store.end(5000)
  draft.fields.lineup.push('外部修改')
  const updated = store.update(draft.id, {
    id: 'wrong-id', createdAt: 1, startedAt: 2, endedAt: 9999, durationSec: 999,
    status: 'review', fields: { ...draft.fields, result: 'win', lineup: ['追击'] },
    screenshotPath: 'original.png', ocrText: '胜利', pageKind: 'settlement'
  })
  assert.equal(updated.id, draft.id)
  assert.equal(updated.createdAt, 5000)
  assert.equal(updated.startedAt, 1000)
  assert.equal(updated.endedAt, 5000)
  assert.equal(updated.durationSec, 4)
  updated.fields.lineup.push('再改一次')
  assert.deepEqual(store.get(draft.id).fields.lineup, ['追击'])
  // 新建草稿自带"请自行截图粘贴"提示，外部修改仍不能污染它
  const baseWarnings = store.get(draft.id).warnings
  const listed = store.list()
  listed[0].warnings.push('外部警告')
  assert.deepEqual(store.get(draft.id).warnings, baseWarnings)
})

test('导入截图不伪造时长，也不结束正在进行的计时', (t) => {
  const { store } = fixture(t)
  store.start(1000)
  const imported = store.createImport(5000)
  assert.equal(imported.startedAt, null)
  assert.equal(imported.durationSec, null)
  assert.equal(imported.status, 'review')
  assert.equal(imported.endedAt, 5000)
  assert.equal(store.getStartedAt(), 1000)
})

test('重启恢复中断截图/识别为待确认，保留原图且可继续手动填写', (t) => {
  const { store, file, directory } = fixture(t)
  const original = path.join(directory, 'original.png')
  fs.writeFileSync(original, '保留原图字节')
  // 模拟"识别中断"的草稿：直接构造非 review 状态，验证重启后能恢复到待确认
  const recognizing = store.createImport(5000)
  store.update(recognizing.id, { status: 'recognizing', screenshotPath: original })
  const capturing = store.createImport(6000)
  store.update(capturing.id, { status: 'capturing', screenshotPath: original })
  const restarted = new RecordingStore(file)
  assert.equal(restarted.list().length, 2)
  for (const draft of restarted.list()) {
    assert.equal(draft.status, 'review')
    assert.match(draft.error, /未完成/)
    assert(draft.warnings.some((warning) => warning.includes('未完成')))
    assert.equal(draft.screenshotPath, original)
  }
  restarted.remove(recognizing.id)
  restarted.remove(recognizing.id)
  assert.equal(restarted.list().length, 1)
  assert.equal(fs.readFileSync(original, 'utf8'), '保留原图字节')
})

test('开始写盘失败不进入虚假计时，结束失败保留原计时供重试', (t) => {
  const { store, file, directory } = fixture(t)
  let blocked = failRename(t, file)
  assert.throws(() => store.start(1000), /模拟文件被占用/)
  assert.equal(store.getStartedAt(), null)
  assert.equal(fs.existsSync(file), false)
  blocked.mock.restore()
  store.start(1000)
  const previous = fs.readFileSync(file)
  blocked = failRename(t, file)
  assert.throws(() => store.end(5000), /模拟文件被占用/)
  assert.equal(store.getStartedAt(), 1000)
  assert.deepEqual(store.list(), [])
  assert.deepEqual(fs.readFileSync(file), previous)
  blocked.mock.restore()
  assert.equal(store.end(5000).durationSec, 4)
  assert.equal(store.list().length, 1)
  assert.deepEqual(fs.readdirSync(directory), ['recording.json'])
})

test('更新和删除写盘失败不丢草稿，恢复后可安全重试', (t) => {
  const { store, file } = fixture(t)
  const draft = store.createImport(1000)
  const previous = fs.readFileSync(file)
  const blocked = failRename(t, file)
  assert.throws(() => store.update(draft.id, { error: '新的识别错误' }), /模拟文件被占用/)
  assert.equal(store.get(draft.id).error, null)
  assert.throws(() => store.remove(draft.id), /模拟文件被占用/)
  assert.deepEqual(fs.readFileSync(file), previous)
  assert.equal(store.list().length, 1)
  blocked.mock.restore()
  store.remove(draft.id)
  assert.deepEqual(store.list(), [])
})

test('草稿损坏或状态不兼容时上抛错误，绝不清空原文件', (t) => {
  const { file } = fixture(t)
  for (const contents of ['{not-json', JSON.stringify({ version: 99, startedAt: null, drafts: [] })]) {
    fs.writeFileSync(file, contents)
    assert.throws(() => new RecordingStore(file), /原文件未改动/)
    assert.equal(fs.readFileSync(file, 'utf8'), contents)
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import initSqlJs from 'sql.js'
import { Repository } from '../src/main/repository.ts'

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'currency-war-repository-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return { directory, file: path.join(directory, 'matches.db') }
}

const match = (patch = {}) => ({
  startedAt: 1000, endedAt: 601000, durationSec: 600, result: 'win', lineup: ['追击'], bonds: ['燃血×2'],
  rankChange: 1, season: '零和博弈', source: 'manual', screenshotPath: 'original.png',
  confidence: null, note: null, mode: 'standard', rankBefore: '财富造物主19',
  rankAfter: '财富造物主20', rating: 'B', squadHp: 21, ...patch
})

async function legacyDatabase(file) {
  const SQL = await initSqlJs()
  const database = new SQL.Database()
  database.run(`CREATE TABLE matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT, started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL,
    duration_sec INTEGER NOT NULL, result TEXT NOT NULL, lineup_json TEXT, rank_change INTEGER,
    season TEXT NOT NULL, source TEXT NOT NULL, screenshot_path TEXT, confidence REAL, note TEXT
  )`)
  database.run(`INSERT INTO matches VALUES
    (7,1000,101000,100,'win','["演示羁绊"]',99,'旧赛季','demo',NULL,NULL,'旧演示'),
    (9,2000,202000,200,'loss','["追击"]',0,'旧赛季','manual','old.png',NULL,'保留真实记录')`)
  database.run("UPDATE sqlite_sequence SET seq=40 WHERE name='matches'")
  fs.writeFileSync(file, database.export())
  database.close()
}

test('新库不自动灌演示记录，重启仍为空库', async (t) => {
  const { file } = fixture(t)
  let repository = await Repository.create(file)
  assert.equal(repository.count(true), 0)
  assert.deepEqual(repository.list(), [])
  assert.equal(repository.overview().avgDurationSec, null)
  repository.close()
  repository = await Repository.create(file)
  assert.equal(repository.count(true), 0)
  repository.close()
})

test('迁移旧NOT NULL库保留demo、真实记录、ID和自增序号，并支持未知时长', async (t) => {
  const { file } = fixture(t)
  await legacyDatabase(file)
  let repository = await Repository.create(file)
  assert.equal(repository.count(), 1)
  assert.equal(repository.count(true), 2)
  assert.deepEqual(repository.list().map((item) => item.id), [9])
  assert.equal(repository.byId(7).source, 'demo')
  assert.equal(repository.byId(9).note, '保留真实记录')
  assert.equal(repository.byId(9).mode, null)
  const imported = repository.insert(match({ startedAt: null, durationSec: null }), 'imported-draft')
  assert(imported.id > 40)
  repository.close()
  repository = await Repository.create(file)
  const saved = repository.byDraftId('imported-draft')
  assert.equal(saved.startedAt, null)
  assert.equal(saved.durationSec, null)
  assert.equal(saved.mode, 'standard')
  assert.equal(saved.rankAfter, '财富造物主20')
  assert.equal(saved.squadHp, 21)
  assert.equal(repository.count(true), 3)
  repository.close()
})

test('所有统计排除演示，未知时长不当0计平均/直方图，未知开局时间不计活跃时段', async (t) => {
  const { file } = fixture(t)
  const repository = await Repository.create(file)
  repository.insert(match({ source: 'demo', durationSec: 9000, rankChange: 99, lineup: ['演示'] }))
  repository.insert(match({ startedAt: new Date(2026, 9, 28, 8).getTime(), rankChange: 3 }))
  repository.insert(match({ startedAt: null, endedAt: 602000, durationSec: null, result: 'loss', rankChange: null }))
  repository.insert(match({ startedAt: new Date(2026, 9, 28, 9).getTime(), endedAt: 603000, durationSec: 120, result: 'interrupted', rankChange: null }))
  const overview = repository.overview()
  assert.equal(overview.total, 3)
  assert.equal(overview.wins, 1)
  assert.equal(overview.losses, 1)
  assert.equal(overview.interrupted, 1)
  assert.equal(overview.winRate, 0.5)
  assert.equal(overview.totalDurationSec, 720)
  assert.equal(overview.avgDurationSec, 600)
  assert.equal(overview.knownDurationGames, 2)
  assert.equal(overview.unknownDurationGames, 1)
  assert.equal(overview.bestWinStreak, 1)
  assert.equal(overview.bestLossStreak, 1)
  assert.deepEqual(repository.lineupStats(), [{ lineup: '追击', games: 2, wins: 1, winRate: 0.5 }])
  assert.deepEqual(repository.rankCurve(), [{ time: 601000, cumulative: 3 }])
  assert.deepEqual(repository.durationHistogram().map((bucket) => bucket.count), [0, 1, 0, 0, 0, 0])
  const hours = repository.hourHistogram()
  assert.equal(hours.reduce((sum, bucket) => sum + bucket.count, 0), 2)
  assert.equal(hours[8].count, 1)
  assert.equal(hours[9].count, 1)
  repository.close()
})

test('同一草稿重复确认及重启后重试只保留一条，数据库同时有唯一约束', async (t) => {
  const { file } = fixture(t)
  let repository = await Repository.create(file)
  const first = repository.insert(match(), 'draft-once')
  const repeated = repository.insert(match({ result: 'loss', durationSec: null }), 'draft-once')
  assert.equal(repeated.id, first.id)
  assert.equal(repeated.result, 'win')
  assert.equal(repository.count(), 1)
  repository.close()
  repository = await Repository.create(file)
  assert.equal(repository.insert(match(), 'draft-once').id, first.id)
  repository.close()
  const SQL = await initSqlJs()
  const database = new SQL.Database(fs.readFileSync(file))
  assert.throws(() => database.run("INSERT INTO matches (started_at,ended_at,duration_sec,result,season,source,draft_id) VALUES (1,2,1,'win','赛季','manual','draft-once')"), /UNIQUE/)
  database.close()
})

test('只有未知胜负时长或中断/待核实局时，平均单局显示未知而不是0', async (t) => {
  const { file } = fixture(t)
  const repository = await Repository.create(file)
  repository.insert(match({ result: 'win', durationSec: null }))
  repository.insert(match({ result: 'interrupted', durationSec: 120 }))
  repository.insert(match({ result: 'suspected', durationSec: 240 }))
  const overview = repository.overview()
  assert.equal(overview.avgDurationSec, null)
  assert.equal(overview.knownDurationGames, 2)
  assert.equal(overview.unknownDurationGames, 1)
  assert.equal(overview.totalDurationSec, 360)
  assert.equal(repository.durationHistogram().reduce((sum, item) => sum + item.count, 0), 0)
  repository.close()
})

test('段位曲线只累计最近有已知段位变化的赛季，不混入旧赛季或demo', async (t) => {
  const { file } = fixture(t)
  const repository = await Repository.create(file)
  repository.insert(match({ season: '旧赛季', endedAt: 1000, rankChange: 30 }))
  repository.insert(match({ season: '新赛季', endedAt: 2000, rankChange: 1 }))
  repository.insert(match({ season: '新赛季', endedAt: 3000, rankChange: 2 }))
  repository.insert(match({ season: '', endedAt: 4000, rankChange: 99 }))
  repository.insert(match({ season: '   ', endedAt: 4100, rankChange: 99 }))
  repository.insert(match({ season: '未标注', endedAt: 4200, rankChange: 99 }))
  repository.insert(match({ season: ' 未标注 ', endedAt: 4300, rankChange: 99 }))
  repository.insert(match({ season: '未来赛季', endedAt: 5000, rankChange: null }))
  repository.insert(match({ source: 'demo', season: '演示赛季', endedAt: 6000, rankChange: 99 }))
  assert.deepEqual(repository.rankCurve(), [{ time: 2000, cumulative: 1 }, { time: 3000, cumulative: 3 }])
  repository.close()
})

test('待核实和中断局打断连胜连败，不把未证明连续的胜负合并', async (t) => {
  const { file } = fixture(t)
  const repository = await Repository.create(file)
  const results = ['win', 'suspected', 'win', 'interrupted', 'win', 'loss', 'loss', 'suspected', 'loss']
  results.forEach((result, index) => repository.insert(match({ result, endedAt: (index + 1) * 1000 })))
  const overview = repository.overview()
  assert.equal(overview.bestWinStreak, 1)
  assert.equal(overview.bestLossStreak, 2)
  assert.equal(overview.wins, 3)
  assert.equal(overview.losses, 3)
  assert.equal(overview.winRate, 0.5)
  repository.close()
})

test('原子替换失败不改磁盘或内存，恢复后重试只插入一次', async (t) => {
  const { file, directory } = fixture(t)
  const repository = await Repository.create(file)
  const previous = fs.readFileSync(file)
  const original = fs.renameSync
  const blocked = t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === file) throw new Error('模拟写盘失败')
    return original(from, to)
  })
  assert.throws(() => repository.insert(match(), 'retry-draft'), /模拟写盘失败/)
  assert.equal(repository.count(), 0)
  assert.equal(repository.byDraftId('retry-draft'), null)
  assert.deepEqual(fs.readFileSync(file), previous)
  blocked.mock.restore()
  repository.insert(match(), 'retry-draft')
  assert.equal(repository.count(), 1)
  assert.deepEqual(fs.readdirSync(directory), ['matches.db'])
  repository.close()
  const restarted = await Repository.create(file)
  assert.equal(restarted.count(), 1)
  restarted.close()
})

test('旧库迁移写盘失败保留原字节，可恢复后重试迁移', async (t) => {
  const { file } = fixture(t)
  await legacyDatabase(file)
  const previous = fs.readFileSync(file)
  const original = fs.renameSync
  const blocked = t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === file) throw new Error('模拟迁移写盘失败')
    return original(from, to)
  })
  await assert.rejects(Repository.create(file), /模拟迁移写盘失败/)
  assert.deepEqual(fs.readFileSync(file), previous)
  blocked.mock.restore()
  const repository = await Repository.create(file)
  assert.equal(repository.count(true), 2)
  assert.equal(repository.byId(7).note, '旧演示')
  repository.close()
})

test('损坏的旧数据库不会被空库静默覆盖', async (t) => {
  const { file } = fixture(t)
  const original = Buffer.from('这不是SQLite文件')
  fs.writeFileSync(file, original)
  await assert.rejects(Repository.create(file))
  assert.deepEqual(fs.readFileSync(file), original)
})

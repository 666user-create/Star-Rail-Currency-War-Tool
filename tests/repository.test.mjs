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
  // 段位曲线改为读「玩家实际填写的段位」（rank_after），不按血量推导。
  // 本测试三条记录都用 match() 的默认 rankAfter='财富造物主20' → A8 = 80 分。
  // （A8 无小段位，尾部数字被忽略）
  assert.deepEqual(repository.rankCurve(), [
    { time: 601000, cumulative: 80, label: '财富造物主20' },
    { time: 602000, cumulative: 80, label: '财富造物主20' },
    { time: 603000, cumulative: 80, label: '财富造物主20' }
  ])
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

test('段位曲线只取最近有段位数据的赛季，且按实际填写的段位绘制', async (t) => {
  const { file } = fixture(t)
  const repository = await Repository.create(file)
  // 曲线改为读 rank_after（玩家实际段位），不再按血量推导
  repository.insert(match({ season: '旧赛季', endedAt: 1000, rankAfter: 'A8 财富造物主' }))
  repository.insert(match({ season: '新赛季', endedAt: 2000, rankAfter: 'A5 紫金1' }))
  repository.insert(match({ season: '新赛季', endedAt: 3000, rankAfter: 'A5 紫金3' }))
  repository.insert(match({ season: '', endedAt: 4000, rankAfter: 'A8 财富造物主' }))
  repository.insert(match({ season: '   ', endedAt: 4100, rankAfter: 'A8 财富造物主' }))
  repository.insert(match({ season: '未标注', endedAt: 4200, rankAfter: 'A8 财富造物主' }))
  repository.insert(match({ season: ' 未标注 ', endedAt: 4300, rankAfter: 'A8 财富造物主' }))
  // 未来赛季这条没有段位 → 曲线里不出现
  repository.insert(match({ season: '未来赛季', endedAt: 5000, rankAfter: null }))
  repository.insert(match({ source: 'demo', season: '演示赛季', endedAt: 6000, rankAfter: 'A8 财富造物主' }))
  assert.deepEqual(repository.rankCurve(), [
    { time: 2000, cumulative: 51, label: 'A5 紫金1' },
    { time: 3000, cumulative: 53, label: 'A5 紫金3' }
  ])
  repository.close()
})

test('段位曲线：按玩家实际填写的结算后段位绘制（大段序号×10+小段）', async (t) => {
  const { file } = fixture(t)
  const repository = await Repository.create(file)
  const season = '零和博弈'
  // 实测真实进度：A6投资大师1 → 4 → 7 → A6投资大师9
  repository.insert(match({ season, endedAt: 1000, rankAfter: 'A6 投资大师1' }))
  repository.insert(match({ season, endedAt: 2000, rankAfter: 'A6 投资大师4' }))
  repository.insert(match({ season, endedAt: 3000, rankAfter: '投资大师7' }))
  repository.insert(match({ season, endedAt: 4000, rankAfter: 'A6 投资大师9' }))
  const curve = repository.rankCurve(season)
  assert.deepEqual(curve.map((p) => p.cumulative), [61, 64, 67, 69], '直接反映真实段位位置')
  assert.deepEqual(curve.map((p) => p.label), ['A6 投资大师1', 'A6 投资大师4', '投资大师7', 'A6 投资大师9'])
  repository.close()
})

test('段位曲线：跨大段时数值跨越（晋级赛也体现在跳变里）', async (t) => {
  const { file } = fixture(t)
  const repository = await Repository.create(file)
  const season = '零和博弈'
  repository.insert(match({ season, endedAt: 1000, rankAfter: 'A5 紫金3' }))   // 53
  repository.insert(match({ season, endedAt: 2000, rankAfter: 'A6 投资大师1' })) // 61，跨大段跳 8
  repository.insert(match({ season, endedAt: 3000, rankAfter: 'A7 资本帝王1' })) // 71
  const curve = repository.rankCurve(season)
  assert.deepEqual(curve.map((p) => p.cumulative), [53, 61, 71])
  // 关键：A5 任意小段都必须低于 A6 任意小段
  assert.ok(curve[0].cumulative < curve[1].cumulative)
  repository.close()
})

test('段位曲线：没填段位的记录被跳过，不瞎画', async (t) => {
  const { file } = fixture(t)
  const repository = await Repository.create(file)
  const season = '零和博弈'
  repository.insert(match({ season, endedAt: 1000, rankAfter: 'A5 紫金1', rankBefore: null }))
  // 显式清空两种段位字段，模拟「都没填」
  repository.insert(match({ season, endedAt: 2000, rankAfter: null, rankBefore: null }))
  repository.insert(match({ season, endedAt: 3000, rankAfter: '', rankBefore: '' }))
  repository.insert(match({ season, endedAt: 4000, rankAfter: 'A5 紫金2', rankBefore: null }))
  const curve = repository.rankCurve(season)
  assert.equal(curve.length, 2, '没填段位的点不出现')
  assert.deepEqual(curve.map((p) => p.cumulative), [51, 52])
  repository.close()
})

test('段位曲线：结算后没填时回落到结算前段位', async (t) => {
  const { file } = fixture(t)
  const repository = await Repository.create(file)
  const season = '零和博弈'
  repository.insert(match({ season, endedAt: 1000, rankAfter: 'A5 紫金1' }))
  repository.insert(match({ season, endedAt: 2000, rankAfter: null, rankBefore: 'A5 紫金2' }))
  const curve = repository.rankCurve(season)
  assert.deepEqual(curve.map((p) => p.cumulative), [51, 52], '用结算前位置补上')
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

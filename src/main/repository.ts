import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { atomicReplace } from './atomicReplace.ts'
import initSqlJs from 'sql.js'
import type { DurationBucket, HourBucket, LineupStat, Match, OverviewStats, RankPoint } from '@shared/types'

type Database = import('sql.js').Database & { close?: () => void }
type SqlRuntime = Awaited<ReturnType<typeof initSqlJs>>
const COLUMNS = ['id', 'started_at', 'ended_at', 'duration_sec', 'result', 'lineup_json', 'rank_change', 'season', 'source', 'screenshot_path', 'confidence', 'note', 'mode', 'rank_before', 'rank_after', 'rating', 'squad_hp', 'draft_id'] as const

function schema(table: string): string {
  return `CREATE TABLE ${table} (
    id INTEGER PRIMARY KEY AUTOINCREMENT, started_at INTEGER, ended_at INTEGER NOT NULL,
    duration_sec INTEGER, result TEXT NOT NULL, lineup_json TEXT, rank_change INTEGER,
    season TEXT NOT NULL, source TEXT NOT NULL, screenshot_path TEXT, confidence REAL, note TEXT,
    mode TEXT, rank_before TEXT, rank_after TEXT, rating TEXT, squad_hp INTEGER, draft_id TEXT
  )`
}

/** 同目录写临时文件并刷盘，原子替换失败时保留原库。 */
function atomicWrite(filePath: string, data: Uint8Array): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${randomUUID()}.tmp`
  let descriptor: number | undefined
  try {
    descriptor = fs.openSync(temporary, 'wx')
    fs.writeFileSync(descriptor, data)
    fs.fsyncSync(descriptor)
    fs.closeSync(descriptor)
    descriptor = undefined
    atomicReplace(temporary, filePath)
  } catch (error) {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor) } catch { /* 保留最初的写入错误。 */ }
    }
    try { fs.unlinkSync(temporary) } catch { /* 临时文件可能尚未生成。 */ }
    throw error
  }
}

/** 正式战绩的唯一读写口；草稿确认后才写这里。 */
export class Repository {
  private db!: Database
  private sql!: SqlRuntime
  private dbPath: string

  private constructor(dbPath: string) { this.dbPath = dbPath }

  /** 显式路径用于临时库测试，应用默认仍取 Electron userData。 */
  static async create(dbPath?: string): Promise<Repository> {
    const resolvedPath = dbPath ?? path.join((await import('electron')).app.getPath('userData'), 'matches.db')
    const repo = new Repository(resolvedPath)
    repo.sql = await initSqlJs()
    // 不吞读取错误，避免用空库覆盖损坏或暂时不可读的用户数据。
    repo.db = fs.existsSync(resolvedPath) ? new repo.sql.Database(fs.readFileSync(resolvedPath)) : new repo.sql.Database()
    try { repo.migrate(); return repo }
    catch (error) { repo.db.close?.(); throw error }
  }

  private rows(sql: string, params: unknown[] = [], database = this.db): Record<string, unknown>[] {
    const stmt = database.prepare(sql)
    try {
      stmt.bind(params as never[])
      const out: Record<string, unknown>[] = []
      while (stmt.step()) out.push(stmt.getAsObject())
      return out
    } finally { stmt.free() }
  }

  /** 候选库写盘成功才切换内存，失败后重试不会重复插入。 */
  private commit<T>(change: (database: Database) => T): T {
    const candidate: Database = new this.sql.Database(this.db.export())
    try {
      const result = change(candidate)
      atomicWrite(this.dbPath, candidate.export())
      const previous = this.db
      this.db = candidate
      try { previous.close?.() } catch { /* 写盘已完成，不因资源回收误报失败。 */ }
      return result
    } catch (error) {
      try { candidate.close?.() } catch { /* 保留最初的写入错误。 */ }
      throw error
    }
  }

  private migrate(): void {
    const columns = this.rows('PRAGMA table_info(matches)')
    if (!columns.length) {
      this.commit((database) => {
        database.run(schema('matches'))
        database.run('CREATE UNIQUE INDEX matches_draft_id ON matches(draft_id)')
      })
      return
    }
    const names = new Set(columns.map((column) => String(column.name)))
    if (COLUMNS.slice(0, 12).some((name) => !names.has(name))) throw new Error('战绩数据库结构无法识别，原文件未改动。')
    const rebuild = COLUMNS.some((name) => !names.has(name)) || columns.some((column) => ['started_at', 'duration_sec'].includes(String(column.name)) && column.notnull === 1)
    const indexed = this.rows('PRAGMA index_list(matches)').some((index) => index.name === 'matches_draft_id' && index.unique === 1)
    if (!rebuild && indexed) return
    this.commit((database) => {
      if (rebuild) {
        const sequence = this.rows("SELECT seq FROM sqlite_sequence WHERE name='matches'", [], database)[0]?.seq
        database.run(schema('matches_migrating'))
        database.run(`INSERT INTO matches_migrating (${COLUMNS.join(',')}) SELECT ${COLUMNS.map((name) => names.has(name) ? name : 'NULL').join(',')} FROM matches`)
        database.run('DROP TABLE matches')
        database.run('ALTER TABLE matches_migrating RENAME TO matches')
        if (typeof sequence === 'number') database.run("UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='matches'", [sequence])
      }
      database.run('CREATE UNIQUE INDEX IF NOT EXISTS matches_draft_id ON matches(draft_id)')
    })
  }

  private static toMatch(r: Record<string, unknown>): Match {
    return {
      id: r.id as number, startedAt: (r.started_at as number) ?? null, endedAt: r.ended_at as number,
      durationSec: (r.duration_sec as number) ?? null, result: r.result as Match['result'],
      lineup: JSON.parse((r.lineup_json as string) ?? '[]'), rankChange: (r.rank_change as number) ?? null,
      season: r.season as string, source: r.source as Match['source'], screenshotPath: (r.screenshot_path as string) ?? null,
      confidence: (r.confidence as number) ?? null, note: (r.note as string) ?? null,
      mode: (r.mode as Match['mode']) ?? null, rankBefore: (r.rank_before as string) ?? null,
      rankAfter: (r.rank_after as string) ?? null, rating: (r.rating as string) ?? null, squadHp: (r.squad_hp as number) ?? null
    }
  }

  count(includeDemo = false): number {
    return (this.rows(`SELECT COUNT(*) AS n FROM matches${includeDemo ? '' : " WHERE source!='demo'"}`)[0]?.n as number) ?? 0
  }

  list(limit = 500, includeDemo = false): Match[] {
    const boundedLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 500
    return this.rows(`SELECT * FROM matches${includeDemo ? '' : " WHERE source!='demo'"} ORDER BY ended_at DESC,id DESC LIMIT ?`, [boundedLimit]).map(Repository.toMatch)
  }

  byId(id: number): Match | null {
    const row = this.rows('SELECT * FROM matches WHERE id=?', [id])[0]
    return row ? Repository.toMatch(row) : null
  }

  byDraftId(id: string): Match | null {
    const row = this.rows('SELECT * FROM matches WHERE draft_id=?', [id])[0]
    return row ? Repository.toMatch(row) : null
  }

  insert(match: Omit<Match, 'id'>, draftId?: string): Match {
    if (draftId !== undefined) {
      if (!draftId) throw new Error('草稿标识不能为空。')
      const existing = this.byDraftId(draftId)
      if (existing) return existing
    }
    if (!Number.isFinite(match.endedAt) || (match.startedAt !== null && !Number.isFinite(match.startedAt)) ||
      (match.durationSec !== null && (!Number.isFinite(match.durationSec) || match.durationSec < 0))) throw new Error('记录时间无效。')
    return this.commit((database) => {
      database.run(`INSERT INTO matches (${COLUMNS.slice(1).join(',')}) VALUES (${COLUMNS.slice(1).map(() => '?').join(',')})`, [
        match.startedAt, match.endedAt, match.durationSec, match.result, JSON.stringify(match.lineup), match.rankChange,
        match.season, match.source, match.screenshotPath, match.confidence, match.note, match.mode, match.rankBefore,
        match.rankAfter, match.rating, match.squadHp, draftId ?? null
      ])
      const id = this.rows('SELECT last_insert_rowid() AS id', [], database)[0].id as number
      return { ...match, lineup: [...match.lineup], id }
    })
  }

  overview(): OverviewStats {
    const r = this.rows(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN result='loss' THEN 1 ELSE 0 END) AS losses,
      SUM(CASE WHEN result='interrupted' THEN 1 ELSE 0 END) AS interrupted,
      COALESCE(SUM(duration_sec),0) AS totalDur,
      COALESCE(SUM(CASE WHEN result IN ('win','loss') AND duration_sec IS NOT NULL THEN duration_sec END),0) AS validDur,
      SUM(CASE WHEN result IN ('win','loss') AND duration_sec IS NOT NULL THEN 1 ELSE 0 END) AS validN,
      COALESCE(SUM(CASE WHEN rank_change>0 THEN duration_sec END),0) AS rankDur,
      SUM(CASE WHEN rank_change>0 THEN 1 ELSE 0 END) AS rankGames,
      SUM(CASE WHEN duration_sec IS NOT NULL THEN 1 ELSE 0 END) AS knownDurationGames,
      SUM(CASE WHEN duration_sec IS NULL THEN 1 ELSE 0 END) AS unknownDurationGames
      FROM matches WHERE source!='demo'`)[0]
    const sequence = this.rows("SELECT result FROM matches WHERE source!='demo' ORDER BY ended_at ASC,id ASC")
    let win = 0, loss = 0, bestWin = 0, bestLoss = 0
    for (const row of sequence) {
      if (row.result === 'win') { win++; loss = 0; bestWin = Math.max(bestWin, win) }
      else if (row.result === 'loss') { loss++; win = 0; bestLoss = Math.max(bestLoss, loss) }
      else { win = 0; loss = 0 } // 中断或待核实局不能证明两侧胜负是连续的。
    }
    const wins = (r.wins as number) ?? 0, losses = (r.losses as number) ?? 0
    return {
      total: (r.total as number) ?? 0, wins, losses, interrupted: (r.interrupted as number) ?? 0,
      winRate: wins + losses > 0 ? wins / (wins + losses) : 0, totalDurationSec: (r.totalDur as number) ?? 0,
      avgDurationSec: (r.validN as number) > 0 ? (r.validDur as number) / (r.validN as number) : null,
      bestWinStreak: bestWin, bestLossStreak: bestLoss, maxRankHours: ((r.rankDur as number) ?? 0) / 3600,
      maxRankGames: (r.rankGames as number) ?? 0, knownDurationGames: (r.knownDurationGames as number) ?? 0,
      unknownDurationGames: (r.unknownDurationGames as number) ?? 0
    }
  }

  lineupStats(): LineupStat[] {
    const totals = new Map<string, LineupStat>()
    for (const row of this.rows("SELECT lineup_json,result FROM matches WHERE source!='demo' AND result IN ('win','loss')")) {
      const lineup: string[] = JSON.parse((row.lineup_json as string) ?? '[]')
      for (const name of new Set(lineup)) {
        const stat = totals.get(name) ?? { lineup: name, games: 0, wins: 0, winRate: 0 }
        stat.games++
        if (row.result === 'win') stat.wins++
        stat.winRate = stat.wins / stat.games
        totals.set(name, stat)
      }
    }
    return [...totals.values()].sort((a, b) => b.games - a.games)
  }

  rankCurve(): RankPoint[] {
    const season = this.rows("SELECT season FROM matches WHERE source!='demo' AND rank_change IS NOT NULL AND TRIM(season) NOT IN ('','未标注') ORDER BY ended_at DESC,id DESC LIMIT 1")[0]?.season
    if (typeof season !== 'string') return []
    let cumulative = 0
    return this.rows("SELECT ended_at,rank_change FROM matches WHERE source!='demo' AND rank_change IS NOT NULL AND season=? ORDER BY ended_at ASC,id ASC", [season]).map((row) => {
      cumulative += row.rank_change as number
      return { time: row.ended_at as number, cumulative }
    })
  }

  durationHistogram(): DurationBucket[] {
    const buckets: DurationBucket[] = [
      { label: '<10分', count: 0 }, { label: '10-15', count: 0 }, { label: '15-20', count: 0 },
      { label: '20-30', count: 0 }, { label: '30-45', count: 0 }, { label: '>45分', count: 0 }
    ]
    for (const row of this.rows("SELECT duration_sec AS d FROM matches WHERE source!='demo' AND result IN ('win','loss') AND duration_sec IS NOT NULL")) {
      const minutes = (row.d as number) / 60
      const index = minutes < 10 ? 0 : minutes < 15 ? 1 : minutes < 20 ? 2 : minutes < 30 ? 3 : minutes < 45 ? 4 : 5
      buckets[index].count++
    }
    return buckets
  }

  hourHistogram(): HourBucket[] {
    const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }))
    for (const row of this.rows("SELECT started_at AS t FROM matches WHERE source!='demo' AND started_at IS NOT NULL")) buckets[new Date(row.t as number).getHours()].count++
    return buckets
  }

  close(): void { this.db.close?.() }
}

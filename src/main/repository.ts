import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { atomicReplace } from './atomicReplace.ts'
import initSqlJs from 'sql.js'
import type { BondStat, DurationBucket, HourBucket, LineupStat, Match, OverviewStats, RankPoint } from '@shared/types'

type Database = import('sql.js').Database & { close?: () => void }
type SqlRuntime = Awaited<ReturnType<typeof initSqlJs>>
const COLUMNS = ['id', 'started_at', 'ended_at', 'duration_sec', 'result', 'lineup_json', 'bonds_json', 'rank_change', 'season', 'source', 'screenshot_path', 'confidence', 'note', 'mode', 'rank_before', 'rank_after', 'rating', 'squad_hp', 'draft_id'] as const

function schema(table: string): string {
  return `CREATE TABLE ${table} (
    id INTEGER PRIMARY KEY AUTOINCREMENT, started_at INTEGER, ended_at INTEGER NOT NULL,
    duration_sec INTEGER, result TEXT NOT NULL, lineup_json TEXT, bonds_json TEXT, rank_change INTEGER,
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
    // 基础列必须存在（bonds_json 是有默认空数组的后续新增列，老库缺它属于可迁移情况）
    const REQUIRED = COLUMNS.filter((name) => name !== 'bonds_json').slice(0, 12)
    if (REQUIRED.some((name) => !names.has(name))) throw new Error('战绩数据库结构无法识别，原文件未改动。')
    const rebuild = COLUMNS.some((name) => !names.has(name)) || columns.some((column) => ['started_at', 'duration_sec'].includes(String(column.name)) && column.notnull === 1)
    const indexed = this.rows('PRAGMA index_list(matches)').some((index) => index.name === 'matches_draft_id' && index.unique === 1)
    if (!rebuild && indexed) return
    this.commit((database) => {
      if (rebuild) {
        const sequence = this.rows("SELECT seq FROM sqlite_sequence WHERE name='matches'", [], database)[0]?.seq
        database.run(schema('matches_migrating'))
        database.run(`INSERT INTO matches_migrating (${COLUMNS.join(',')}) SELECT ${COLUMNS.map((name) => names.has(name) ? name : (name === 'bonds_json' ? "'[]'" : 'NULL')).join(',')} FROM matches`)
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
      lineup: JSON.parse((r.lineup_json as string) ?? '[]'), bonds: JSON.parse((r.bonds_json as string) ?? '[]'),
      rankChange: (r.rank_change as number) ?? null,
      season: r.season as string, source: r.source as Match['source'], screenshotPath: (r.screenshot_path as string) ?? null,
      confidence: (r.confidence as number) ?? null, note: (r.note as string) ?? null,
      mode: (r.mode as Match['mode']) ?? null, rankBefore: (r.rank_before as string) ?? null,
      rankAfter: (r.rank_after as string) ?? null, rating: (r.rating as string) ?? null, squadHp: (r.squad_hp as number) ?? null
    }
  }

  /**
   * 构造「排除演示数据 + 可选赛季过滤」的 WHERE 子句。
   * 赛季隔离：面板切换赛季后，列表和所有统计都只看该赛季，
   * 否则「上赛季的胜率」会混进「本赛季」，段位走势也会跨赛季串线。
   */
  private where(season?: string | null, extra?: { clause: string; params: unknown[] }): { sql: string; params: unknown[] } {
    const parts: string[] = ["source!='demo'"]
    const params: unknown[] = []
    if (season != null && String(season).trim() !== '') {
      parts.push('season=?')
      params.push(String(season).trim())
    }
    if (extra) { parts.push(extra.clause); params.push(...extra.params) }
    return { sql: ` WHERE ${parts.join(' AND ')}`, params }
  }

  count(includeDemo = false, season?: string | null): number {
    if (includeDemo && season == null) {
      return (this.rows('SELECT COUNT(*) AS n FROM matches')[0]?.n as number) ?? 0
    }
    const w = this.where(season, includeDemo ? { clause: '1=1', params: [] } : undefined)
    return (this.rows(`SELECT COUNT(*) AS n FROM matches${w.sql}`, w.params)[0]?.n as number) ?? 0
  }

  list(limit = 500, includeDemo = false, season?: string | null): Match[] {
    const boundedLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 500
    if (includeDemo && season == null) {
      return this.rows('SELECT * FROM matches ORDER BY ended_at DESC,id DESC LIMIT ?', [boundedLimit]).map(Repository.toMatch)
    }
    const w = this.where(season, includeDemo ? { clause: '1=1', params: [] } : undefined)
    return this.rows(`SELECT * FROM matches${w.sql} ORDER BY ended_at DESC,id DESC LIMIT ?`, [...w.params, boundedLimit]).map(Repository.toMatch)
  }

  /** 库里出现过的赛季（含空值归一后的默认名），供界面提示用。 */
  seasons(): string[] {
    const rows = this.rows("SELECT DISTINCT season FROM matches WHERE source!='demo' AND season IS NOT NULL AND season!='' ORDER BY season")
    return rows.map((row) => String(row.season))
  }

  byId(id: number): Match | null {
    const row = this.rows('SELECT * FROM matches WHERE id=?', [id])[0]
    return row ? Repository.toMatch(row) : null
  }

  byDraftId(id: string): Match | null {
    const row = this.rows('SELECT * FROM matches WHERE draft_id=?', [id])[0]
    return row ? Repository.toMatch(row) : null
  }

  /** 截图目录迁移后，重写指向旧目录的记录；返回更新条数。 */
  rewriteScreenshotPaths(fromDirectory: string, toDirectory: string): number {
    const rows = this.rows('SELECT id,screenshot_path FROM matches WHERE screenshot_path IS NOT NULL')
    const updates: Array<{ id: number; next: string }> = []
    for (const row of rows) {
      const current = String(row.screenshot_path)
      if (!path.isAbsolute(current)) continue
      const directory = path.dirname(current)
      if (path.resolve(directory) !== path.resolve(fromDirectory)) continue
      updates.push({ id: row.id as number, next: path.join(toDirectory, path.basename(current)) })
    }
    if (!updates.length) return 0
    this.commit((database) => {
      for (const item of updates) database.run('UPDATE matches SET screenshot_path=? WHERE id=?', [item.next, item.id])
    })
    return updates.length
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
        match.startedAt, match.endedAt, match.durationSec, match.result, JSON.stringify(match.lineup), JSON.stringify(match.bonds), match.rankChange,
        match.season, match.source, match.screenshotPath, match.confidence, match.note, match.mode, match.rankBefore,
        match.rankAfter, match.rating, match.squadHp, draftId ?? null
      ])
      const id = this.rows('SELECT last_insert_rowid() AS id', [], database)[0].id as number
      return { ...match, lineup: [...match.lineup], bonds: [...match.bonds], id }
    })
  }

  /** 更新已有战绩的可编辑字段（不新增、不改 id）。截图与来源保持不变。 */
  update(id: number, match: Omit<Match, 'id' | 'screenshotPath' | 'source' | 'confidence' | 'draftId'> & { source?: Match['source'] }): Match {
    const existing = this.byId(id)
    if (!existing) throw new Error('这条战绩不存在，可能已被删除。')
    if (!Number.isFinite(match.endedAt) || (match.startedAt !== null && !Number.isFinite(match.startedAt)) ||
      (match.durationSec !== null && (!Number.isFinite(match.durationSec) || match.durationSec < 0))) throw new Error('记录时间无效。')
    return this.commit((database) => {
      database.run(`UPDATE matches SET started_at=?, ended_at=?, duration_sec=?, result=?, lineup_json=?, bonds_json=?,
        rank_change=?, season=?, note=?, mode=?, rank_before=?, rank_after=?, rating=?, squad_hp=? WHERE id=?`, [
        match.startedAt, match.endedAt, match.durationSec, match.result, JSON.stringify(match.lineup), JSON.stringify(match.bonds),
        match.rankChange, match.season, match.note, match.mode, match.rankBefore, match.rankAfter, match.rating, match.squadHp, id
      ])
      return { ...existing, ...match, lineup: [...match.lineup], bonds: [...match.bonds], id }
    })
  }

  overview(season?: string | null): OverviewStats {
    const w = this.where(season)
    const r = this.rows(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN result='loss' THEN 1 ELSE 0 END) AS losses,
      SUM(CASE WHEN result='interrupted' THEN 1 ELSE 0 END) AS interrupted,
      COALESCE(SUM(duration_sec),0) AS totalDur,
      COALESCE(SUM(CASE WHEN result IN ('win','loss') AND duration_sec IS NOT NULL THEN duration_sec END),0) AS validDur,
      SUM(CASE WHEN result IN ('win','loss') AND duration_sec IS NOT NULL THEN 1 ELSE 0 END) AS validN,
      SUM(CASE WHEN duration_sec IS NOT NULL THEN 1 ELSE 0 END) AS knownDurationGames,
      SUM(CASE WHEN duration_sec IS NULL THEN 1 ELSE 0 END) AS unknownDurationGames,
      SUM(CASE WHEN squad_hp IS NOT NULL THEN squad_hp END) AS hpSum,
      SUM(CASE WHEN squad_hp IS NOT NULL THEN 1 ELSE 0 END) AS hpN
      FROM matches${w.sql}`, w.params)[0]
    const sequence = this.rows(`SELECT result FROM matches${w.sql} ORDER BY ended_at ASC,id ASC`, w.params)
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
      bestWinStreak: bestWin, bestLossStreak: bestLoss,
      knownDurationGames: (r.knownDurationGames as number) ?? 0,
      unknownDurationGames: (r.unknownDurationGames as number) ?? 0,
      avgSquadHp: (r.hpN as number) > 0 ? (r.hpSum as number) / (r.hpN as number) : null,
      knownSquadHpGames: (r.hpN as number) ?? 0
    }
  }

  /** 羁绊统计：与阵容分开计数。 */
  bondStats(season?: string | null): BondStat[] {
    const totals = new Map<string, BondStat>()
    const w = this.where(season, { clause: "result IN ('win','loss')", params: [] })
    for (const row of this.rows(`SELECT bonds_json,result FROM matches${w.sql}`, w.params)) {
      const bonds: string[] = JSON.parse((row.bonds_json as string) ?? '[]')
      for (const name of new Set(bonds)) {
        const stat = totals.get(name) ?? { bond: name, games: 0, wins: 0, winRate: 0 }
        stat.games += 1
        if (row.result === 'win') stat.wins += 1
        totals.set(name, stat)
      }
    }
    return [...totals.values()].map((stat) => ({ ...stat, winRate: stat.games > 0 ? stat.wins / stat.games : 0 }))
      .sort((a, b) => b.games - a.games)
  }

  lineupStats(season?: string | null): LineupStat[] {
    const totals = new Map<string, LineupStat>()
    const w = this.where(season, { clause: "result IN ('win','loss')", params: [] })
    for (const row of this.rows(`SELECT lineup_json,result FROM matches${w.sql}`, w.params)) {
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

  /**
   * 段位走势。
   * 传入 season 时只看该赛季；不传时回落到「最近一条有段位变化的记录所属赛季」，
   * 保持原有行为（否则跨赛季会把不同职级体系串成一条线）。
   */
  rankCurve(season?: string | null): RankPoint[] {
    const target = season != null && String(season).trim() !== ''
      ? String(season).trim()
      : this.rows("SELECT season FROM matches WHERE source!='demo' AND rank_change IS NOT NULL AND TRIM(season) NOT IN ('','未标注') ORDER BY ended_at DESC,id DESC LIMIT 1")[0]?.season
    if (typeof target !== 'string') return []
    let cumulative = 0
    return this.rows("SELECT ended_at,rank_change FROM matches WHERE source!='demo' AND rank_change IS NOT NULL AND season=? ORDER BY ended_at ASC,id ASC", [target]).map((row) => {
      cumulative += row.rank_change as number
      return { time: row.ended_at as number, cumulative }
    })
  }

  durationHistogram(season?: string | null): DurationBucket[] {
    const buckets: DurationBucket[] = [
      { label: '<10分', count: 0 }, { label: '10-15', count: 0 }, { label: '15-20', count: 0 },
      { label: '20-30', count: 0 }, { label: '30-45', count: 0 }, { label: '>45分', count: 0 }
    ]
    const w = this.where(season, { clause: "result IN ('win','loss') AND duration_sec IS NOT NULL", params: [] })
    for (const row of this.rows(`SELECT duration_sec AS d FROM matches${w.sql}`, w.params)) {
      const minutes = (row.d as number) / 60
      const index = minutes < 10 ? 0 : minutes < 15 ? 1 : minutes < 20 ? 2 : minutes < 30 ? 3 : minutes < 45 ? 4 : 5
      buckets[index].count++
    }
    return buckets
  }

  hourHistogram(season?: string | null): HourBucket[] {
    const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }))
    const w = this.where(season, { clause: 'started_at IS NOT NULL', params: [] })
    for (const row of this.rows(`SELECT started_at AS t FROM matches${w.sql}`, w.params)) buckets[new Date(row.t as number).getHours()].count++
    return buckets
  }

  close(): void { this.db.close?.() }
}

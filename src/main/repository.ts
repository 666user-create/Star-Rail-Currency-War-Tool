import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import initSqlJs from 'sql.js'
import type {
  DurationBucket, HourBucket, LineupStat, Match, OverviewStats, RankPoint
} from '@shared/types'

/**
 * record-store：对局记录唯一读写口（阶段2 OCR 只是新增写入方，接口不变）。
 * 用 sql.js（WASM SQLite）避免原生模块在 Windows 上的编译/ABI 摩擦；
 * 每次写入后整库落盘（数据量级：深度玩家一年也就几千行，完全够用）。
 */
export class Repository {
  private db!: import('sql.js').Database
  private dbPath: string

  private constructor(dbPath: string) {
    this.dbPath = dbPath
  }

  static async create(): Promise<Repository> {
    const dbPath = path.join(app.getPath('userData'), 'matches.db')
    const repo = new Repository(dbPath)
    const SQL = await initSqlJs({
      locateFile: (f: string) => path.join(path.dirname(require.resolve('sql.js')), f)
    })
    repo.db = fs.existsSync(dbPath)
      ? new SQL.Database(fs.readFileSync(dbPath))
      : new SQL.Database()
    repo.db.run(`CREATE TABLE IF NOT EXISTS matches (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at      INTEGER NOT NULL,
      ended_at        INTEGER NOT NULL,
      duration_sec    INTEGER NOT NULL,
      result          TEXT NOT NULL,
      lineup_json     TEXT,
      rank_change     INTEGER,
      season          TEXT NOT NULL,
      source          TEXT NOT NULL,
      screenshot_path TEXT,
      confidence      REAL,
      note            TEXT
    )`)
    if (repo.count() === 0) repo.seedDemo()
    return repo
  }

  private persist(): void {
    fs.writeFileSync(this.dbPath, Buffer.from(this.db.export()))
  }

  private rows(sql: string, params: unknown[] = []): Record<string, unknown>[] {
    const stmt = this.db.prepare(sql)
    stmt.bind(params as never[])
    const out: Record<string, unknown>[] = []
    while (stmt.step()) out.push(stmt.getAsObject())
    stmt.free()
    return out
  }

  private static toMatch(r: Record<string, unknown>): Match {
    return {
      id: r.id as number,
      startedAt: r.started_at as number,
      endedAt: r.ended_at as number,
      durationSec: r.duration_sec as number,
      result: r.result as Match['result'],
      lineup: JSON.parse((r.lineup_json as string) ?? '[]'),
      rankChange: (r.rank_change as number) ?? null,
      season: r.season as string,
      source: r.source as Match['source'],
      screenshotPath: (r.screenshot_path as string) ?? null,
      confidence: (r.confidence as number) ?? null,
      note: (r.note as string) ?? null
    }
  }

  count(): number {
    return (this.rows('SELECT COUNT(*) AS n FROM matches')[0]?.n as number) ?? 0
  }

  list(limit = 500): Match[] {
    return this.rows(
      'SELECT * FROM matches ORDER BY ended_at DESC LIMIT ?', [limit]
    ).map(Repository.toMatch)
  }

  byId(id: number): Match | null {
    const r = this.rows('SELECT * FROM matches WHERE id = ?', [id])[0]
    return r ? Repository.toMatch(r) : null
  }

  insert(m: Omit<Match, 'id'>): Match {
    this.db.run(
      `INSERT INTO matches (started_at, ended_at, duration_sec, result, lineup_json, rank_change, season, source, screenshot_path, confidence, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [m.startedAt, m.endedAt, m.durationSec, m.result, JSON.stringify(m.lineup),
       m.rankChange, m.season, m.source, m.screenshotPath, m.confidence, m.note] as never[]
    )
    const id = (this.rows('SELECT last_insert_rowid() AS id')[0]?.id as number) ?? 0
    this.persist()
    return { ...m, id }
  }

  overview(): OverviewStats {
    const r = this.rows(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) AS wins,
              SUM(CASE WHEN result='loss' THEN 1 ELSE 0 END) AS losses,
              SUM(CASE WHEN result='interrupted' THEN 1 ELSE 0 END) AS interrupted,
              COALESCE(SUM(duration_sec),0) AS totalDur,
              COALESCE(SUM(CASE WHEN result IN ('win','loss') THEN duration_sec END),0) AS validDur,
              SUM(CASE WHEN result IN ('win','loss') THEN 1 ELSE 0 END) AS validN,
              COALESCE(SUM(CASE WHEN rank_change > 0 THEN duration_sec ELSE 0 END),0) AS rankDur,
              SUM(CASE WHEN rank_change > 0 THEN 1 ELSE 0 END) AS rankGames
       FROM matches`
    )[0]
    // 胜/负序列由 JS 计算（SQL 窗口函数能做，但数据量小，简单优先）
    const seq = this.rows(
      "SELECT result FROM matches WHERE result IN ('win','loss') ORDER BY ended_at ASC"
    ).map((x) => x.result as string)
    let win = 0, loss = 0, bw = 0, bl = 0
    for (const s of seq) {
      if (s === 'win') { win++; loss = 0; bw = Math.max(bw, win) }
      else { loss++; win = 0; bl = Math.max(bl, loss) }
    }
    const total = (r.total as number) ?? 0
    const wins = (r.wins as number) ?? 0
    const losses = (r.losses as number) ?? 0
    return {
      total, wins, losses,
      interrupted: (r.interrupted as number) ?? 0,
      winRate: wins + losses > 0 ? wins / (wins + losses) : 0,
      totalDurationSec: (r.totalDur as number) ?? 0,
      avgDurationSec: (r.validN as number) > 0 ? ((r.validDur as number) / (r.validN as number)) : 0,
      bestWinStreak: bw,
      bestLossStreak: bl,
      maxRankHours: ((r.rankDur as number) ?? 0) / 3600,
      maxRankGames: (r.rankGames as number) ?? 0
    }
  }

  lineupStats(): LineupStat[] {
    return this.rows(
      `SELECT lineup_json, COUNT(*) AS games,
              SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) AS wins
       FROM matches WHERE result IN ('win','loss') GROUP BY lineup_json ORDER BY games DESC`
    ).flatMap((r) => {
      const lineup: string[] = JSON.parse(r.lineup_json as string)
      const games = r.games as number
      const wins = (r.wins as number) ?? 0
      return lineup.map((l) => ({ lineup: l, games, wins, winRate: wins / games }))
    })
      .reduce<LineupStat[]>((acc, cur) => {
        const existing = acc.find((x) => x.lineup === cur.lineup)
        if (existing) {
          existing.games += cur.games
          existing.wins += cur.wins
          existing.winRate = existing.wins / existing.games
        } else acc.push({ ...cur })
        return acc
      }, [])
      .sort((a, b) => b.games - a.games)
  }

  rankCurve(): RankPoint[] {
    const rows = this.rows(
      'SELECT ended_at, COALESCE(rank_change,0) AS rc FROM matches ORDER BY ended_at ASC'
    )
    let cum = 0
    return rows.map((r) => {
      cum += r.rc as number
      return { time: r.ended_at as number, cumulative: cum }
    })
  }

  durationHistogram(): DurationBucket[] {
    const buckets: DurationBucket[] = [
      { label: '<10分', count: 0 }, { label: '10-15', count: 0 },
      { label: '15-20', count: 0 }, { label: '20-30', count: 0 },
      { label: '30-45', count: 0 }, { label: '>45分', count: 0 }
    ]
    for (const r of this.rows(
      "SELECT duration_sec AS d FROM matches WHERE result IN ('win','loss')"
    )) {
      const m = (r.d as number) / 60
      const i = m < 10 ? 0 : m < 15 ? 1 : m < 20 ? 2 : m < 30 ? 3 : m < 45 ? 4 : 5
      buckets[i].count++
    }
    return buckets
  }

  hourHistogram(): HourBucket[] {
    const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }))
    for (const r of this.rows('SELECT started_at AS t FROM matches')) {
      buckets[new Date(r.t as number).getHours()].count++
    }
    return buckets
  }

  /** 首次启动灌入演示数据（source='demo'，真实写入路径，随时可被真实数据替代） */
  private seedDemo(): void {
    const lineups = [
      ['仙舟', '追击'], ['狼狩', '燃血'], ['战技点', '银河学者'],
      ['星核猎手', '追击'], ['仙舟', '狼狩', '燃血'], ['燃血', '战技点'],
      ['银河学者', '星核猎手'], ['仙舟', '战技点']
    ]
    const season = '零和博弈'
    const now = Date.now()
    const day = 86400_000
    for (let d = 12; d >= 1; d--) {
      const games = 2 + Math.floor(Math.random() * 5)
      for (let g = 0; g < games; g++) {
        const start = now - d * day + Math.floor(Math.random() * 8 * 3600_000) + g * 1800_000
        const r = Math.random()
        const result = r < 0.06 ? 'interrupted' : r < 0.68 ? 'win' : 'loss'
        const durationSec = result === 'interrupted'
          ? 60 + Math.floor(Math.random() * 240)
          : 480 + Math.floor(Math.random() * 1500)
        // 模拟"深度玩家赛季初冲满段位"：前段有积分，后段归零
        const rankChange = d > 6 && Math.random() < 0.5 ? 10 + Math.floor(Math.random() * 20) : 0
        this.insert({
          startedAt: start,
          endedAt: start + durationSec * 1000,
          durationSec,
          result: result as Match['result'],
          lineup: lineups[Math.floor(Math.random() * lineups.length)],
          rankChange,
          season,
          source: 'demo',
          screenshotPath: null,
          confidence: null,
          note: null
        })
      }
    }
  }
}

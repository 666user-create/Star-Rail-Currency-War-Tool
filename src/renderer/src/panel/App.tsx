import React, { useEffect, useState } from 'react'
import type { DurationBucket, HourBucket, LineupStat, Match, OverviewStats, RankPoint } from '@shared/types'

const RESULT_LABEL: Record<Match['result'], string> = {
  win: '胜', loss: '负', interrupted: '中断', suspected: '待确认'
}

function fmtDur(sec: number): string {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m}分`
  return `${Math.floor(m / 60)}时${m % 60}分`
}

function fmtTime(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/* ————— 迷你图表（纯 SVG） ————— */

function LineChart({ points }: { points: RankPoint[] }) {
  if (points.length < 2) return <div className="chart-empty">数据还不够画曲线~</div>
  const w = 380, h = 150, pad = 24
  const xs = points.map((p) => p.time)
  const ys = points.map((p) => p.cumulative)
  const x0 = Math.min(...xs), x1 = Math.max(...xs)
  const y0 = Math.min(...ys, 0), y1 = Math.max(...ys, 1)
  const sx = (t: number) => pad + ((t - x0) / Math.max(1, x1 - x0)) * (w - pad * 2)
  const sy = (v: number) => h - pad - ((v - y0) / Math.max(1, y1 - y0)) * (h - pad * 2)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.time).toFixed(1)} ${sy(p.cumulative).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart">
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="rgba(255,255,255,0.15)" />
      <path d={path} fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx={sx(points[points.length - 1].time)} cy={sy(points[points.length - 1].cumulative)} r="4" fill="var(--gold)" />
      <text x={pad} y={16} className="chart-note">累计段位分 · {y1 >= 0 ? '+' : ''}{Math.round(y1)}</text>
    </svg>
  )
}

function WinrateBars({ stats }: { stats: LineupStat[] }) {
  if (!stats.length) return <div className="chart-empty">还没有对局数据~</div>
  const top = stats.slice(0, 8)
  return (
    <div className="hbars">
      {top.map((s) => (
        <div key={s.lineup} className="hbar-row">
          <span className="hbar-label">{s.lineup}</span>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${Math.round(s.winRate * 100)}%` }} />
            <span className="hbar-value">{Math.round(s.winRate * 100)}% · {s.games}局</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function VBars({ buckets, unit }: { buckets: (DurationBucket | HourBucket)[]; unit: string }) {
  const max = Math.max(1, ...buckets.map((b) => b.count))
  return (
    <div className="vbars">
      {buckets.map((b, i) => (
        <div key={i} className="vbar-col" title={`${'label' in b ? b.label : (b as HourBucket).hour + '时'}：${b.count}${unit}`}>
          <div className="vbar-fill" style={{ height: `${(b.count / max) * 100}%` }} />
          <span className="vbar-label">{'label' in b ? b.label : (b as HourBucket).hour}</span>
        </div>
      ))}
    </div>
  )
}

/* ————— 主面板 ————— */

export default function App() {
  const [overview, setOverview] = useState<OverviewStats>()
  const [matches, setMatches] = useState<Match[]>([])
  const [lineups, setLineups] = useState<LineupStat[]>([])
  const [rank, setRank] = useState<RankPoint[]>([])
  const [durations, setDurations] = useState<DurationBucket[]>([])
  const [hours, setHours] = useState<HourBucket[]>([])
  const [tab, setTab] = useState<'lineup' | 'rank' | 'duration' | 'hour'>('lineup')
  const [detail, setDetail] = useState<Match | null>(null)

  const reload = () => {
    void window.api.overview().then(setOverview)
    void window.api.listMatches(300).then(setMatches)
    void window.api.lineupStats().then(setLineups)
    void window.api.rankCurve().then(setRank)
    void window.api.durationHistogram().then(setDurations)
    void window.api.hourHistogram().then(setHours)
  }
  useEffect(reload, [])

  const winRate = overview ? Math.round(overview.winRate * 100) : 0

  return (
    <div className="panel-root">
      {/* 标题栏（可拖动窗口） */}
      <div className="titlebar">
        <div className="title">
          货币战争作战记录
          <span className="season-chip">赛季 · 零和博弈</span>
        </div>
        <div className="title-actions">
          <button className="tb-btn" onClick={reload}>刷新</button>
          <button className="tb-btn close" onClick={() => window.close()}>✕</button>
        </div>
      </div>

      {/* 总览统计 */}
      <div className="tiles">
        <div className="tile"><div className="tile-num">{overview?.total ?? '—'}</div><div className="tile-label">总局数</div></div>
        <div className="tile"><div className="tile-num gold">{winRate}%</div><div className="tile-label">胜率</div></div>
        <div className="tile"><div className="tile-num">{overview ? (overview.totalDurationSec / 3600).toFixed(1) : '—'}</div><div className="tile-label">总时长(小时)</div></div>
        <div className="tile"><div className="tile-num">{overview ? Math.round(overview.avgDurationSec / 60) : '—'}</div><div className="tile-label">平均单局(分)</div></div>
        <div className="tile"><div className="tile-num win">{overview?.bestWinStreak ?? '—'}</div><div className="tile-label">最长连胜</div></div>
        <div className="tile"><div className="tile-num loss">{overview?.bestLossStreak ?? '—'}</div><div className="tile-label">最长连败</div></div>
        <div className="tile highlight">
          <div className="tile-num gold">{overview ? overview.maxRankHours.toFixed(1) : '—'}<small>时 / {overview?.maxRankGames ?? '—'}局</small></div>
          <div className="tile-label">赛季冲满段位消耗</div>
        </div>
      </div>

      <div className="main-grid">
        {/* 对局列表 */}
        <div className="card list-card">
          <div className="card-title">对局列表 <span className="muted">（点行看详情 · 不受官方10条限制）</span></div>
          <div className="match-list">
            {matches.map((m) => (
              <div key={m.id} className={`match-row r-${m.result}`} onClick={() => setDetail(m)}>
                <span className="m-time">{fmtTime(m.startedAt)}</span>
                <span className={`m-badge b-${m.result}`}>{RESULT_LABEL[m.result]}</span>
                <span className="m-dur">{fmtDur(m.durationSec)}</span>
                <span className="m-lineup">{m.lineup.join('·')}</span>
                {m.source !== 'ocr' && <span className="m-src">{m.source}</span>}
              </div>
            ))}
            {!matches.length && <div className="chart-empty">还没有记录，点桌宠的小秒表试试~</div>}
          </div>
        </div>

        {/* 分析页签 */}
        <div className="card analysis-card">
          <div className="tabs">
            <button className={tab === 'lineup' ? 'on' : ''} onClick={() => setTab('lineup')}>羁绊胜率</button>
            <button className={tab === 'rank' ? 'on' : ''} onClick={() => setTab('rank')}>段位走势</button>
            <button className={tab === 'duration' ? 'on' : ''} onClick={() => setTab('duration')}>时长分布</button>
            <button className={tab === 'hour' ? 'on' : ''} onClick={() => setTab('hour')}>活跃时段</button>
          </div>
          <div className="tab-body">
            {tab === 'lineup' && <WinrateBars stats={lineups} />}
            {tab === 'rank' && <LineChart points={rank} />}
            {tab === 'duration' && <VBars buckets={durations} unit="局" />}
            {tab === 'hour' && <VBars buckets={hours} unit="局" />}
          </div>
        </div>
      </div>

      <div className="footer">
        © 米哈游版权所有 · 本工具为非官方同人作品，与 miHoYo / HoYoverse 无关联 · 数据仅存本地
      </div>

      {/* 单局详情 */}
      {detail && (
        <div className="modal-mask" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              第 {detail.id} 局 · {fmtTime(detail.startedAt)}
              <button className="tb-btn close" onClick={() => setDetail(null)}>✕</button>
            </div>
            <div className="modal-grid">
              <div><label>结果</label><span className={`b-${detail.result}`}>{RESULT_LABEL[detail.result]}</span></div>
              <div><label>时长</label>{fmtDur(detail.durationSec)}</div>
              <div><label>段位变化</label>{detail.rankChange ?? '—'}</div>
              <div><label>数据来源</label>{detail.source}</div>
              <div className="span2"><label>阵容/羁绊</label>{detail.lineup.join(' · ') || '—'}</div>
              <div className="span2"><label>结算截图</label>{detail.screenshotPath ?? '（演示数据无截图）'}</div>
              <div className="span2"><label>备注</label>{detail.note ?? '—'}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

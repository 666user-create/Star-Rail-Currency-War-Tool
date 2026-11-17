import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { BondStat, CelebrationData, DurationBucket, HourBucket, LineupStat, Match, OverviewStats, RankPoint, RatingBucket, RecordingDraft } from '@shared/types'
import ReviewDraft, { errorText, RESULT_LABEL, ScreenshotPreview } from './ReviewDraft'
import { SEASONS, defaultSeason, formatStartDate, parseStartDate, resolvedSeasons, seasonStartAt } from '@shared/seasons'
import EditMatch from './EditMatch'
import { CelebrationCard } from './CelebrationCard'
// 段位展示统一去掉 A 前缀（历史数据写法不一，混着显示会忽有忽无）
import { displayRank, isSubOverflow, maxSubLevel, parseRank } from '@shared/ranks'
import { RankRibbon } from './RankRibbon'

/**
 * 段位数据体检：列出不符合官方档数表的记录。
 *
 * 检查两类问题：
 * 1. 小段位超出该大段档数（例如 A8 只有 20 档却填了 50）
 * 2. 没填小段位（sub=0）—— 涨幅会算不出来，显示「—」
 *
 * 每行可点击跳到该局详情去改。没有问题时整块不渲染，不占版面。
 */
function RankHealth({ matches, onOpen }: { matches: Match[]; onOpen: (match: Match) => void }): React.JSX.Element | null {
  const issues: Array<{ match: Match; field: string; raw: string; reason: string }> = []
  for (const m of matches) {
    const fields: Array<[string, string | null]> = [['结算前段位', m.rankBefore], ['结算后段位', m.rankAfter]]
    for (const [field, raw] of fields) {
      const text = String(raw ?? '').trim()
      if (!text) continue
      const value = parseRank(text)
      if (!value) { issues.push({ match: m, field, raw: text, reason: '无法识别' }); continue }
      // 统一用 isSubOverflow，避免这里和 ranks.ts 各判一遍
      if (isSubOverflow(value)) {
        const cap = maxSubLevel(value.code)
        issues.push({ match: m, field, raw: text, reason: value.code + ' 最多 ' + cap + ' 档' })
      } else if (value.sub === 0) {
        issues.push({ match: m, field, raw: text, reason: '没填小段位' })
      }
    }
  }
  if (!issues.length) return null

  const shown = issues.slice(0, 6)
  return (
    <div className="rank-health">
      <div className="rank-health-head">
        <b>段位数据体检</b>
        <span>{issues.length} 处需要确认（小段位超出该档档数或没填）</span>
      </div>
      <div className="rank-health-list">
        {shown.map((item, i) => (
          <button key={i} type="button" className="rank-health-row" onClick={() => onOpen(item.match)}>
            <span className="rank-health-date">{fmtTime(item.match.endedAt)}</span>
            <span className="rank-health-field">{item.field}</span>
            <span className="rank-health-raw">{item.raw}</span>
            <span className="rank-health-reason">{item.reason}</span>
          </button>
        ))}
        {issues.length > shown.length && <span className="rank-health-more">还有 {issues.length - shown.length} 处…</span>}
      </div>
    </div>
  )
}

// 复用贺图的官方 A8 徽章素材
import rankBadgeUrl from '../../../../assets/rank/rank-a8.png'

/** 评级筛选/分布用的固定顺序（从高到低） */
const RATING_ORDER = ['SSS', 'SS', 'S', 'A', 'B', 'C']

function fmtDur(sec: number | null): string {
  if (sec == null) return '未知'
  const m = Math.round(sec / 60)
  if (m < 60) return `${m}分`
  return `${Math.floor(m / 60)}时${m % 60}分`
}

function fmtTime(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * 详情里展示段位 + 本档进度：如「资本帝王9（9/9）」「财富造物主3（3/20）」。
 *
 * 各档档数不同（A0-2=3 / A3=5 / A4=7 / A5-7=9 / A8=20），
 * 只写「资本帝王9」看不出这是该档最后一档，补上分母才直观。
 */
function rankWithProgress(raw: string | null | undefined): string {
  const text = displayRank(raw) || '未知'
  const value = raw ? parseRank(raw) : null
  if (!value || value.sub <= 0) return text
  const cap = maxSubLevel(value.code)
  return Number.isFinite(cap) ? `${text}（${value.sub}/${cap}）` : text
}

/* ————— 迷你图表（纯 SVG） ————— */

/**
 * 评级分布：横向条形图。
 *
 * 只统计填了评级的对局 —— 分母是「有评级的局数」，不是总对局数。
 * 没填评级的局若计入分母会把各档比例稀释，看起来像自己评级很差。
 *
 * 固定列出常见档位（SSS/SS/S/A/B/C），没有数据的档位也保留一行空条，
 * 这样一眼能看出"我从来没拿过 B"，而不是让档位悄悄消失。
 */
function RatingBars({ stats }: { stats: RatingBucket[] }): React.JSX.Element {
  if (!stats.length) return <div className="chart-empty">还没有填写过评级的对局~</div>

  const total = stats.reduce((sum, item) => sum + item.count, 0)
  const max = Math.max(...stats.map((item) => item.count), 1)
  const byLabel = new Map(stats.map((item) => [item.label, item]))

  // 固定档位顺序（游戏内只有这六档，无 D 档）；数据里出现的额外档位追加在后面
  const ORDER = ['SSS', 'SS', 'S', 'A', 'B', 'C']
  const extra = stats.map((item) => item.label).filter((label) => !ORDER.includes(label))
  const labels = [...ORDER, ...extra]

  const toneOf = (label: string): { bar: string; text: string; empty: string } => {
    if (label === 'SSS') return { bar: 'linear-gradient(90deg, rgba(232,196,118,.35), #fff3cf)', text: '#fff3cf', empty: 'rgba(232,196,118,.10)' }
    if (label === 'SS') return { bar: 'linear-gradient(90deg, rgba(232,196,118,.28), #ffe9a8)', text: '#ffe9a8', empty: 'rgba(232,196,118,.09)' }
    if (label === 'S') return { bar: 'linear-gradient(90deg, rgba(232,196,118,.22), #f0d69c)', text: '#f0d69c', empty: 'rgba(232,196,118,.08)' }
    if (label === 'A') return { bar: 'linear-gradient(90deg, rgba(159,180,216,.25), #9fb4d8)', text: '#9fb4d8', empty: 'rgba(159,180,216,.09)' }
    if (label === 'B') return { bar: 'linear-gradient(90deg, rgba(138,147,166,.25), #8a93a6)', text: '#8a93a6', empty: 'rgba(138,147,166,.08)' }
    return { bar: 'linear-gradient(90deg, rgba(122,106,114,.25), #7a6a72)', text: '#7a6a72', empty: 'rgba(122,106,114,.08)' }
  }

  return (
    <div className="hbars-chart">
      <div className="hbars-caption">横轴：评级档位 · 共 {total} 局有评级</div>
      <div className="hbars hbars-dense">
        {labels.map((label) => {
          const item = byLabel.get(label)
          const count = item?.count ?? 0
          const ratio = item?.ratio ?? 0
          const tone = toneOf(label)
          const isEmpty = count === 0
          return (
            <div key={label} className={`hbar-row hbar-row-narrow${isEmpty ? ' hbar-row-empty' : ''}`}>
              <span className="hbar-label" style={{ color: isEmpty ? undefined : tone.text }}>{label}</span>
              <div className="hbar-track">
                {!isEmpty && (
                  <div
                    className="hbar-fill"
                    style={{ width: `${Math.max(3, (count / max) * 100)}%`, background: tone.bar }}
                  />
                )}
              </div>
              <span className="hbar-value">{isEmpty ? '—' : `${count}局 ${Math.round(ratio * 100)}%`}</span>
            </div>
          )
        })}
      </div>
    </div>
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

/**
 * 日历热力图：按天统计对局数，布局同 GitHub 贡献图。
 *
 * 数据量很小（一天一格，一年 365 格），用 SVG rect 渲染，
 * DOM 节点不到 400 个，内存开销可以忽略 —— 不需要 Canvas。
 *
 * 配色按当天局数分档：0 局空、1-2 局浅、3-4 局中、5+ 局深。
 * 鼠标悬停显示「X月X日：N 局」。
 */
function CalendarHeatmap({ matches }: { matches: Match[] }): React.JSX.Element {
  /** 选中某天后显示当天对局 */
  const [pickedDay, setPickedDay] = React.useState<string | null>(null)
  /** 热力图分页：数据超过一屏时按 18 周/页 切分 */
  const [page, setPage] = React.useState(0)

  if (!matches.length) return <div className="chart-empty">还没有对局记录~</div>

  /** 按本地日期聚合成 Map<'YYYY-MM-DD', Match[]> */
  const byDay = new Map<string, Match[]>()
  for (const m of matches) {
    if (!m.endedAt) continue
    const d = new Date(m.endedAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const list = byDay.get(key) ?? []
    list.push(m)
    byDay.set(key, list)
  }
  if (!byDay.size) return <div className="chart-empty">还没有对局记录~</div>

  /*
   * 时间范围跟着实际数据走：
   * 只画「第一局那天 → 今天」，不补前面几个月空白。
   * 刚用几天就显示几列，攒久了自然变长 —— 而不是一上来就铺满 52 周空格子。
   */
  const times = matches.filter((m) => m.endedAt).map((m) => m.endedAt as number)
  const first = new Date(Math.min(...times))
  first.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  /*
   * 时间范围：从第一局那周开始，往后铺够 8 周（约 2 个月）。
   *
   * 两个约束在打架：
   * ① 起点不能早于第一局 —— 否则左边一大片空白（用户抱怨"起始日期太早"）
   * ② 又不能只画 1~2 周 —— 那样只有一列，格子再大也是根竖条
   *
   * 折中：起点锁在第一局所在周，往后至少铺 8 周形成完整的日历块。
   * 右边那些未来格子不画（保留空间），看起来是个规整的月历形状。
   */
  const MIN_WEEKS = 8
  const start = new Date(first)
  start.setDate(start.getDate() - start.getDay())   // 退回本周周日
  const end = new Date(start)
  end.setDate(end.getDate() + MIN_WEEKS * 7 - 1)    // 往后铺 8 周

  // 若数据本身超过 8 周，就铺到本周周六
  const thisWeekEnd = new Date(today)
  thisWeekEnd.setDate(thisWeekEnd.getDate() + (6 - thisWeekEnd.getDay()))
  if (end < thisWeekEnd) end.setTime(thisWeekEnd.getTime())

  const days: Array<{ date: Date; key: string; count: number; week: number; weekday: number; future: boolean }> = []
  const cursor = new Date(start)
  let week = 0
  while (cursor <= end) {
    const weekday = cursor.getDay()
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    days.push({
      date: new Date(cursor),
      key,
      count: byDay.get(key)?.length ?? 0,
      week,
      weekday,
      future: cursor > today
    })
    if (weekday === 6) week++
    cursor.setDate(cursor.getDate() + 1)
  }

  /*
   * 格子尺寸自适应（保持原布局，只调格子大小）：
   * 目标是整体宽度约 470px。
   *
   * 上下限都收紧过：之前放到 44px 会变成一块块大色块，格子边缘太抢眼。
   * 26px 是兼顾"格子够大能点"和"整体像日历"的尺寸。
   */
  const TARGET_W = 470
  const baseCell = Math.floor((TARGET_W - 24 + 4) / Math.max(1, Math.ceil(days.length / 7)) - 4)
  const CELL = Math.max(16, Math.min(26, baseCell))
  const GAP = 3
  const LEFT = 24
  const TOP = 18
  /*
   * 分页：一页最多 18 周（约 4 个月）。
   * 再多就超出容器宽度了 —— 与其把格子压小到看不清，
   * 不如分页，每页保持固定的格子尺寸。
   */
  const WEEKS_PER_PAGE = 18
  const totalWeeks = Math.ceil(days.length / 7)
  const pageCount = Math.max(1, Math.ceil(totalWeeks / WEEKS_PER_PAGE))
  const safePage = Math.min(page, pageCount - 1)
  const firstWeek = safePage * WEEKS_PER_PAGE
  const lastWeek = Math.min(totalWeeks, firstWeek + WEEKS_PER_PAGE) - 1
  const visibleDays = days.filter((d) => d.week >= firstWeek && d.week <= lastWeek)
  const pageWeeks = lastWeek - firstWeek + 1
  const W = LEFT + pageWeeks * (CELL + GAP) - GAP
  const H = TOP + 7 * (CELL + GAP) - GAP

  const colorOf = (count: number): string => {
    if (count === 0) return 'rgba(255,255,255,.055)'
    if (count <= 2) return 'rgba(232,196,118,.50)'
    if (count <= 4) return 'rgba(232,196,118,.72)'
    if (count <= 7) return 'rgba(244,217,148,.90)'
    return '#fff3cf'
  }

  // 月份标签
  const monthLabels: Array<{ label: string; x: number }> = []
  let lastMonth = -1
  for (const d of days) {
    if (d.weekday === 0 && d.date.getMonth() !== lastMonth) {
      lastMonth = d.date.getMonth()
      monthLabels.push({ label: `${lastMonth + 1}月`, x: LEFT + d.week * (CELL + GAP) })
    }
  }

  const maxDay = Math.max(...days.map((d) => d.count))
  const activeDays = days.filter((d) => d.count > 0).length
  const picked = pickedDay ? byDay.get(pickedDay) ?? [] : []
  const pickedDate = pickedDay ? pickedDay.split('-').map(Number) : null

  /*
   * 宽度自适应：列数少时按固定格宽铺开（字大好看），
   * 列数多时（超过容器）让外层滚动，不压缩格子。
   */
  const minCellTotal = LEFT + totalWeeks * (CELL + GAP)

  return (
    <div className="heatmap-wrap">
      <div className="heatmap-caption">
        {activeDays} 天有对局 · 单日最多 {maxDay} 局
      </div>

      <div className="heatmap-scroll">
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="heatmap-svg"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* 星期标签 */}
          {[{ i: 1, t: '一' }, { i: 3, t: '三' }, { i: 5, t: '五' }].map(({ i, t }) => (
            <text key={t} x={LEFT - 7} y={TOP + i * (CELL + GAP) + CELL - 8} className="heatmap-weekday" textAnchor="end">{t}</text>
          ))}

          {/* 月份标签（只显示本页范围内的） */}
          {monthLabels
            .filter((m, i, arr) => {
              // 按 x 换算成周数，判断是否落在本页
              const wk = Math.round((m.x - LEFT) / (CELL + GAP))
              return wk >= firstWeek && wk <= lastWeek
            })
            .map((m) => (
              <text key={m.label + m.x} x={m.x - firstWeek * (CELL + GAP)} y={TOP - 7} className="heatmap-month">{m.label}</text>
            ))}

          {/* 每天一格：未来的日期也画（淡色占位），保证网格是完整的 8 周块 */}
          {visibleDays.map((d) => (
            <rect
              key={d.key}
              x={LEFT + (d.week - firstWeek) * (CELL + GAP)}
              y={TOP + d.weekday * (CELL + GAP)}
              width={CELL}
              height={CELL}
              rx={4}
              fill={d.future ? 'rgba(255, 255, 255, .022)' : colorOf(d.count)}
              stroke={pickedDay === d.key ? '#fff3cf' : 'none'}
              strokeWidth={pickedDay === d.key ? 2 : 0}
              style={{ cursor: d.count > 0 ? 'pointer' : 'default' }}
              onClick={() => { if (!d.future) setPickedDay((prev) => (prev === d.key ? null : d.key)) }}
            >
              <title>{d.future ? '' : `${d.date.getMonth() + 1}月${d.date.getDate()}日：${d.count} 局`}</title>
            </rect>
          ))}
        </svg>
      </div>

      {/* 点击后显示当天详情 */}
      {pickedDay && pickedDate && (
        <div className="heatmap-detail">
          <div className="heatmap-detail-head">
            <b>{pickedDate[1]}月{pickedDate[2]}日</b>
            <span>{picked.length} 局</span>
            <button type="button" className="heatmap-detail-close" aria-label="关闭" onClick={() => setPickedDay(null)}>✕</button>
          </div>
          <div className="heatmap-detail-list">
            {picked.length === 0 && <span className="muted">这天没有对局</span>}
            {picked.map((m) => {
              const t = new Date(m.endedAt as number)
              const hh = String(t.getHours()).padStart(2, '0')
              const mm = String(t.getMinutes()).padStart(2, '0')
              const isWin = m.result === 'win'
              const isLoss = m.result === 'loss'
              return (
                <div key={m.id} className="heatmap-game-row">
                  <span className="heatmap-game-time">{hh}:{mm}</span>
                  <span className={`heatmap-game-result ${isWin ? 'win' : isLoss ? 'loss' : ''}`}>
                    {isWin ? '胜' : isLoss ? '负' : '?'}
                  </span>
                  <span className="heatmap-game-rank">{displayRank(m.rankAfter) || '—'}</span>
                  <span className="heatmap-game-rating">{m.rating || '—'}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="heatmap-footer">
        <div className="heatmap-legend">
          <span>少</span>
          {[0, 2, 4, 7, 9].map((n) => (
            <i key={n} style={{ background: colorOf(n) }} />
          ))}
          <span>多</span>
        </div>
        {/* 数据超过一屏时按 4 个月一页翻 */}
        {pageCount > 1 && (
          <div className="heatmap-pager">
            <button
              type="button"
              className="heatmap-page-btn"
              disabled={safePage <= 0}
              aria-label="上一页"
              onClick={() => setPage((v) => Math.max(0, v - 1))}
            >‹</button>
            <span className="heatmap-page-info">{safePage + 1} / {pageCount}</span>
            <button
              type="button"
              className="heatmap-page-btn"
              disabled={safePage >= pageCount - 1}
              aria-label="下一页"
              onClick={() => setPage((v) => Math.min(pageCount - 1, v + 1))}
            >›</button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * 活跃时段：24 小时时钟径向图。
 *
 * 24 个时段用柱状图怎么排都别扭（竖着窄、横着长且一半是空行），
 * 而「一天中的活跃分布」本质是周期性数据 —— 摊成环形最直观：
 * 每个时刻占 15°，扇区越长表示那小时打的局数越多，
 * 0 局的时刻只留一小截刻度，能看出「这个点从没打过」。
 */
function HourClock({ buckets }: { buckets: HourBucket[] }): React.JSX.Element {
  const byHour = new Map(buckets.map((b) => [b.hour, b.count]))
  const counts = buckets.map((b) => b.count)
  const max = Math.max(1, ...counts)
  const total = counts.reduce((sum, n) => sum + n, 0)

  /*
   * 极坐标玫瑰图（wind rose / polar area）。
   *
   * 24 个时刻按 15° 均分，扇区半径表示该小时的对局数。
   * 比柱状图更能体现"一天之内"的周期感 —— 一眼看出活动集中在哪个时段，
   * 而不是在 24 根细柱或 24 行条形之间上下扫。
   *
   * 尺寸固定、居中显示：SVG 有固有宽高，外面用 flex 居中，
   * 不随容器拉伸变形。
   */
  const SIZE = 340
  const cx = SIZE / 2
  const cy = SIZE / 2
  const R_OUTER = 132         // 最外圈（最大值）半径
  const R_GRID = [0.25, 0.5, 0.75, 1].map((r) => R_OUTER * r)

  const angleOf = (hour: number): number => (hour / 24) * Math.PI * 2 - Math.PI / 2

  /** 一个扇区（从圆心出发，半径按比例） */
  const sectorPath = (hour: number, ratio: number): string => {
    const half = (Math.PI * 2 / 24) * 0.40
    const a0 = angleOf(hour) - half
    const a1 = angleOf(hour) + half
    // 0 局的时段留一点最小半径，看得出"这个时刻存在但没有对局"
    const r = Math.max(8, R_OUTER * ratio)
    const pt = (radius: number, a: number): string =>
      `${(cx + radius * Math.cos(a)).toFixed(2)},${(cy + radius * Math.sin(a)).toFixed(2)}`
    return [
      `M${cx},${cy}`,
      `L${pt(r, a0)}`,
      `A${r.toFixed(2)},${r.toFixed(2)} 0 0 1 ${pt(r, a1)}`,
      'Z'
    ].join(' ')
  }

  /** 局数 → 颜色（参考图的紫→橙→黄渐变，但贴合本项目的金色系） */
  const colorOf = (count: number): string => {
    if (count === 0) return 'rgba(255,255,255,.07)'
    const t = count / max
    if (t <= 0.25) return 'rgba(120, 100, 200, .55)'   // 少：冷紫
    if (t <= 0.5) return 'rgba(200, 130, 160, .65)'    // 中：粉紫
    if (t <= 0.75) return 'rgba(232, 170, 120, .78)'   // 多：橙
    return 'rgba(244, 217, 148, .95)'                  // 最多：金
  }

  const peakHour = buckets.reduce((best, b) => (b.count > (byHour.get(best) ?? 0) ? b.hour : best), 0)

  return (
    <div className="rose-wrap">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="rose-svg">
        {/* 同心网格圈 */}
        {R_GRID.map((r) => (
          <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="1" />
        ))}
        {/* 24 条放射网格线 */}
        {Array.from({ length: 24 }, (_, h) => {
          const a = angleOf(h)
          return (
            <line
              key={h}
              x1={cx} y1={cy}
              x2={cx + R_OUTER * Math.cos(a)}
              y2={cy + R_OUTER * Math.sin(a)}
              stroke="rgba(255,255,255,.05)"
              strokeWidth="1"
            />
          )
        })}

        {/* 24 个扇区 */}
        {Array.from({ length: 24 }, (_, hour) => {
          const count = byHour.get(hour) ?? 0
          const isPeak = count > 0 && hour === peakHour
          return (
            <path
              key={hour}
              d={sectorPath(hour, count / max)}
              fill={colorOf(count)}
              stroke={isPeak ? 'rgba(255,243,207,.85)' : 'none'}
              strokeWidth={isPeak ? 1.4 : 0}
              style={{ cursor: count > 0 ? 'pointer' : 'default' }}
            >
              <title>{`${hour} 时：${count} 局`}</title>
            </path>
          )
        })}

        {/* 时刻标签：每 3 小时标一个，避免拥挤 */}
        {[0, 3, 6, 9, 12, 15, 18, 21].map((hour) => {
          const a = angleOf(hour)
          const r = R_OUTER + 20
          return (
            <text
              key={hour}
              x={cx + r * Math.cos(a)}
              y={cy + r * Math.sin(a)}
              textAnchor="middle"
              dominantBaseline="middle"
              className="rose-tick"
            >{hour}时</text>
          )
        })}

      </svg>

      <div className="rose-foot">
        共 {total} 局 · 最活跃 <b>{peakHour} 时</b>
        <span>（{byHour.get(peakHour) ?? 0} 局）</span>
      </div>
    </div>
  )
}

function VBars({ buckets, unit, axisCaption, hideZero = false }: { buckets: (DurationBucket | HourBucket)[]; unit: string; axisCaption?: string; hideZero?: boolean }) {
  if (!buckets.some((bucket) => bucket.count > 0)) return <div className="chart-empty">暂无可统计的记录</div>
  const max = Math.max(1, ...buckets.map((b) => b.count))

  const rows = buckets
    .map((b, i) => ({
      label: 'label' in b ? b.label : String((b as HourBucket).hour),
      count: b.count,
      index: i
    }))
    .filter((row) => !hideZero || row.count > 0)

  return (
    <div className="hbars-chart">
      {axisCaption && <div className="hbars-caption">横轴：{axisCaption}</div>}
      <div className="hbars hbars-dense">
        {rows.map((row) => {
          const isEmpty = row.count === 0
          return (
            <div key={row.index} className={`hbar-row hbar-row-narrow${isEmpty ? ' hbar-row-empty' : ''}`}>
              <span className="hbar-label">{row.label}</span>
              <div className="hbar-track">
                {!isEmpty && (
                  <div
                    className="hbar-fill"
                    style={{ width: `${Math.max(3, (row.count / max) * 100)}%` }}
                  />
                )}
              </div>
              <span className="hbar-value">{isEmpty ? '—' : `${row.count}${unit}`}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ————— 主面板 ————— */

export default function App() {
  const [overview, setOverview] = useState<OverviewStats>()
  const [matches, setMatches] = useState<Match[]>([])
  const [lineups, setLineups] = useState<LineupStat[]>([])
  const [bonds, setBonds] = useState<BondStat[]>([])
  const [rank, setRank] = useState<RankPoint[]>([])
  /** 满级贺图数据；null 表示本赛季还没到 A8 满级 */
  const [celebration, setCelebration] = useState<CelebrationData | null>(null)
  /** 是否正在展示贺图 */
  const [showCelebration, setShowCelebration] = useState(false)
  const [durations, setDurations] = useState<DurationBucket[]>([])
  const [hours, setHours] = useState<HourBucket[]>([])
  /** 评级分布（只含有评级的对局） */
  const [ratings, setRatings] = useState<RatingBucket[]>([])
  const [tab, setTab] = useState<'lineup' | 'bond' | 'rank' | 'duration' | 'hour' | 'rating' | 'calendar'>('lineup')
  /** 面板是否处于最大化（无边框窗口靠自定义按钮切换，需要跟踪状态改图标） */
  const [maximized, setMaximized] = useState(false)
  const [detail, setDetail] = useState<Match | null>(null)
  const [editing, setEditing] = useState(false)
  /** 删除中：防止重复点击 */
  const [deleting, setDeleting] = useState(false)
  /** 导出中：防止重复点击 */
  const [exporting, setExporting] = useState(false)
  const [currentSeason, setCurrentSeason] = useState<string>(() => defaultSeason())
  // 用户填写的赛季时间（覆盖代码内置值）
  const [seasonStarts, setSeasonStarts] = useState<Record<string, number>>({})
  const [seasonEnds, setSeasonEnds] = useState<Record<string, number>>({})
  // 待补开始时间的赛季：点该赛季时若还没登记开始日期，就地让用户填
  const [seasonDatePrompt, setSeasonDatePrompt] = useState<{ seasonId: string; label: string; value: string } | null>(null)
  const [drafts, setDrafts] = useState<RecordingDraft[]>([])
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null)
  /** 记录列表的评级筛选：空串 = 全部 */
  const [ratingFilter, setRatingFilter] = useState<string>('')
  const [importing, setImporting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const reloadVersion = useRef(0)

  const reload = useCallback(async () => {
    const version = ++reloadVersion.current
    try {
      // 先确定当前赛季，再按赛季拉数据 —— 否则会把所有赛季的记录和统计混在一起。
      // 赛季：优先用设置里保存的；为空则用按时间推测的当前赛季，并写回设置，
      // 保证秒表结束时读到的是面板上正在显示的这一季。
      let season: string
      let starts: Record<string, number> = {}
      let ends: Record<string, number> = {}
      try {
        const s = await window.api.getSettings()
        starts = s.seasonStarts ?? {}
        ends = s.seasonEnds ?? {}
        season = (s.recordSeason ?? '').trim() || defaultSeason(Date.now(), { starts, ends })
        if (!s.recordSeason) void window.api.setSettings({ recordSeason: season }).catch(() => {})
      } catch {
        season = defaultSeason(Date.now())
      }
      if (version !== reloadVersion.current) return
      setSeasonStarts(starts)
      setSeasonEnds(ends)
      setCurrentSeason(season)

      const [nextOverview, nextMatches, nextLineups, nextBonds, nextRank, nextDurations, nextHours, nextDrafts, nextCelebration, nextRatings] = await Promise.all([
        window.api.overview(season), window.api.listMatches(300, season), window.api.lineupStats(season),
        window.api.bondStats(season), window.api.rankCurve(season),
        window.api.durationHistogram(season), window.api.hourHistogram(season), window.api.listDrafts(),
        window.api.celebrationData(season).catch(() => null),
        window.api.ratingStats(season).catch(() => [])
      ])
      if (version !== reloadVersion.current) return
      setOverview(nextOverview)
      setMatches(nextMatches.filter((match) => match.source !== 'demo'))
      setLineups(nextLineups)
      setBonds(nextBonds)
      setRank(nextRank)
      setDurations(nextDurations)
      setHours(nextHours)
      setDrafts(nextDrafts)
      setCelebration(nextCelebration)
      setRatings(nextRatings)
      setError('')
    } catch (reason) {
      if (version === reloadVersion.current) setError(errorText(reason, '读取记录失败，请重试。'))
    } finally { if (version === reloadVersion.current) setLoading(false) }
  }, [])
  useEffect(() => {
    const unsubscribe = window.api.onRecordsChanged(() => { void reload() })
    // 结束计时后主进程会打开面板并指定草稿：自动选中，直接进入导入/粘贴
    const unsubscribeFocus = window.api.onDraftFocus((id) => {
      void reload().then(() => setSelectedDraftId(id))
    })
    const focus = () => { void reload() }
    window.addEventListener('focus', focus)
    void reload()
    return () => { unsubscribe(); unsubscribeFocus(); window.removeEventListener('focus', focus) }
  }, [reload])

  const updateDraft = (draft: RecordingDraft) => setDrafts((current) => [draft, ...current.filter((item) => item.id !== draft.id)])
  /**
   * 切换赛季。
   * 规则：只要该赛季的开赛时间已到（现在 >= startAt），就直接切换；
   * 只有确实还没开赛的赛季才弹说明，避免像 4.7 开服后仍然点不进去。
   */
  const switchSeason = async (season: string) => {
    const startAt = seasonStartAt(season, { starts: seasonStarts, ends: seasonEnds })
    const notStarted = startAt != null && Date.now() < startAt
    if (notStarted) {
      const label = SEASONS.find((item) => item.id === season)?.label ?? season
      setSeasonDatePrompt({ seasonId: season, label, value: '' })
      return
    }
    setSeasonDatePrompt(null)
    setCurrentSeason(season)
    try { await window.api.setSettings({ recordSeason: season }) } catch { /* 设置写失败不影响当前会话内切换 */ }
    // 赛季隔离：切换后必须按新赛季重新拉列表和统计，否则仍显示上一季的数据
    setLoading(true)
    void reload()
  }
  const importScreenshot = async () => {
    if (importing) return
    setImporting(true)
    setError('')
    setNotice('')
    try {
      const draft = await window.api.importScreenshot()
      if (draft) { updateDraft(draft); setSelectedDraftId(draft.id) }
    } catch (reason) { setError(errorText(reason, '导入截图失败，请重试。')) }
    finally { setImporting(false) }
  }
  // 剪贴板粘贴导入：Win+Shift+S 截好结算图 → 面板 Ctrl+V / 点"粘贴截图"直达草稿
  /**
   * 删除一条战绩。
   *
   * 不可恢复，所以带二次确认；确认文案带上具体时间和结果，
   * 避免用户在列表里点错了才发现删的是另一局。
   */
  /**
   * 某局在本赛季里的「第几局」（从 1 开始，按结束时间正序）。
   *
   * 不能用数据库自增 id：删过记录后 id 会留空洞（55,56,57…90,91…），
   * 用户看到"第 55 局"会以为自己打了 55 把。这里按时间重新编号，
   * 删掉中间某局后，后面的序号会自动往前补。
   */
  const sequenceOf = (match: Match): number => {
    const ordered = [...matches].sort((a, b) => a.endedAt - b.endedAt || a.id - b.id)
    const index = ordered.findIndex((m) => m.id === match.id)
    return index < 0 ? 0 : index + 1
  }

  const removeMatch = async (match: Match): Promise<void> => {
    if (deleting) return
    const when = new Date(match.endedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    const res = match.result === 'win' ? '胜利' : match.result === 'loss' ? '失败' : '待核实'
    if (!window.confirm(`确定删除这一局吗？\n\n${when} · ${res}\n\n删除后无法恢复，相关统计和走势图都会更新。`)) return
    setDeleting(true)
    setError('')
    try {
      await window.api.removeMatch(match.id)
      setDetail(null)
      setEditing(false)
      setNotice('已删除该局，统计已更新。')
      await reload()
    } catch (reason) {
      setError(errorText(reason, '删除失败，请重试。'))
    } finally {
      setDeleting(false)
    }
  }

  /** 导出全部战绩为 CSV（弹系统保存框） */
  const exportCsv = async (): Promise<void> => {
    if (exporting) return
    setExporting(true)
    setError('')
    try {
      const res = await window.api.exportCsv()
      if (res.ok) setNotice(`已导出 ${res.count ?? 0} 局到 ${res.path ?? '指定位置'}。`)
      else if (!res.canceled) setError(res.error ?? '导出失败。')
    } catch (reason) {
      setError(errorText(reason, '导出失败。'))
    } finally {
      setExporting(false)
    }
  }

  const pasteClipboard = async () => {
    if (importing) return
    setImporting(true)
    setError('')
    setNotice('')
    try {
      const draft = await window.api.importClipboardImage()
      if (draft) { updateDraft(draft); setSelectedDraftId(draft.id); setNotice('已从剪贴板导入截图，请核对后确认。') }
      else setError('剪贴板里没有图片。请先用截图工具（如 Win+Shift+S）截好结算画面。')
    } catch (reason) { setError(errorText(reason, '粘贴导入失败，请重试。')) }
    finally { setImporting(false) }
  }
  useEffect(() => {
    // 同步初始最大化状态，并监听窗口尺寸变化（最大化/还原都会触发）
    void window.api.panelIsMaximized().then(setMaximized).catch(() => undefined)
    const sync = (): void => { void window.api.panelIsMaximized().then(setMaximized).catch(() => undefined) }
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [])

  /** 切换最大化，并同步按钮图标 */
  const toggleMaximize = async (): Promise<void> => {
    try {
      setMaximized(await window.api.panelToggleMaximize())
    } catch {
      // 忽略切换失败
    }
  }

  useEffect(() => {
    const onPaste = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return
        event.preventDefault()
        void pasteClipboard()
      }
    }
    window.addEventListener('keydown', onPaste)
    return () => window.removeEventListener('keydown', onPaste)
  }, [])

  const selectedDraft = drafts.find((draft) => draft.id === selectedDraftId)
  const winRate = overview && overview.wins + overview.losses > 0 ? `${Math.round(overview.winRate * 100)}%` : '—'

  return (
    <div className="panel-root">
      {/* 标题栏（可拖动窗口） */}
      <div className="titlebar">
        <div className="title">
          {/* 统一图标：金色圆角方框 + 中心菱形 */}
          <svg className="title-logo" viewBox="0 0 100 100" role="img" aria-label="货币战争桌宠">
            <rect x="8" y="8" width="84" height="84" rx="22" fill="none" stroke="currentColor" strokeWidth="8" />
            <path d="M50 28 L66 50 L50 72 L34 50 Z" fill="currentColor" />
          </svg>
          货币战争作战记录
          <span className="season-chip">本地记录</span>
        </div>
        {/* 赛季切换：顶部按钮，不用在表单里手填；未登记开始日期的赛季点了就地补填 */}
        <div className="season-switch-wrap">
          <div className="season-switch" role="group" aria-label="当前赛季">
            <span className="season-switch-label">赛季</span>
            {resolvedSeasons({ starts: seasonStarts, ends: seasonEnds }).map((season) => (
              <button
                key={season.id}
                type="button"
                className={`season-btn ${currentSeason === season.id ? 'on' : ''} ${seasonDatePrompt?.seasonId === season.id ? 'editing' : ''}`}
                title={season.startAt
                  ? `${new Date(season.startAt).toLocaleDateString()} 起${season.endAt ? ` · ${new Date(season.endAt).toLocaleDateString()} 结束` : ' · 进行中'}`
                  : '还没确认开赛时间'}
                onClick={() => void switchSeason(season.id)}
              >{season.label}</button>
            ))}
          </div>
          {/* 紧贴按钮下方出现：填该赛季开始日期（官方公布时间），不必改代码 */}
          {seasonDatePrompt && (
            <div className="season-inline-prompt" role="dialog" aria-label="赛季还没开赛">
              <div className="season-inline-head">
                <span>「{seasonDatePrompt.label}」还没开赛</span>
                <button type="button" className="season-inline-close" aria-label="关闭" onClick={() => { setSeasonDatePrompt(null); setError('') }}>✕</button>
              </div>
              <div className="season-inline-when">
                <span className="season-inline-date">{formatStartDate(seasonStartAt(seasonDatePrompt.seasonId, { starts: seasonStarts, ends: seasonEnds }))}</span>
                <span className="season-inline-after">开服，开服后点上方按钮即可切换</span>
              </div>
              <label className="season-inline-edit">
                实际开服日期
                <input
                  type="date"
                  value={seasonDatePrompt.value || formatStartDate(seasonStartAt(seasonDatePrompt.seasonId, { starts: seasonStarts, ends: seasonEnds }))}
                  onChange={(event) => {
                    const value = event.target.value
                    setSeasonDatePrompt((prev) => (prev ? { ...prev, value } : prev))
                    const parsed = parseStartDate(value)
                    if (parsed == null) return
                    void (async () => {
                      setSeasonStarts((prev) => ({ ...prev, [seasonDatePrompt.seasonId]: parsed }))
                      try { await window.api.setSettings({ seasonStarts: { [seasonDatePrompt.seasonId]: parsed } }) } catch { /* 忽略 */ }
                    })()
                  }}
                />
              </label>
              {error && <div className="inline-error" role="alert">{error}</div>}
            </div>
          )}
        </div>
        <div className="title-actions">
          <button className="tb-btn" title="重新读取记录与统计" onClick={() => void reload()}>刷新</button>
          {/* 无边框窗口需要自定义窗口按钮；用 SVG 而非字符，避免字体差异和"看起来像汉字"的问题 */}
          <button className="tb-btn win-btn" title="最小化" aria-label="最小化" onClick={() => window.api.panelMinimize()}>
            <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
              <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
          <button className="tb-btn win-btn" title={maximized ? '还原' : '最大化'} aria-label={maximized ? '还原' : '最大化'} onClick={() => void toggleMaximize()}>
            {maximized ? (
              <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
                <rect x="2.6" y="2.6" width="6.8" height="6.8" fill="none" stroke="currentColor" strokeWidth="1.2" />
                <path d="M4.4 2.6 V0.9 H10.3 V6.8 H8.6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
                <rect x="2.2" y="2.2" width="7.6" height="7.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            )}
          </button>
          <button className="tb-btn close" aria-label="关闭面板" onClick={() => window.close()}>✕</button>
        </div>
      </div>

      <p className="capture-hint">自助添加：<b>优先截「对局记录」页面</b>（文字清晰、字段全），用 Win+Shift+S 截图后回到面板 Ctrl+V（或点「粘贴截图」）即进入核对。</p>
      <p className="capture-hint">即时结算画面经常有遮挡、容易识别不全，不建议作为截图来源。</p>
      <p className="capture-hint">Ctrl+Shift+F8 开始/结束计时（若快捷键未被占用）。结束后截图会进入待确认草稿。</p>

      {/* 总览统计 */}
      <div className="tiles">
        <div className="tile"><div className="tile-num">{overview?.total ?? '—'}</div><div className="tile-label">总局数</div></div>
        <div className="tile"><div className="tile-num gold">{winRate}</div><div className="tile-label">胜率</div></div>
        <div className="tile"><div className="tile-num">{overview?.knownDurationGames ? (overview.totalDurationSec / 3600).toFixed(1) : '—'}</div><div className="tile-label">总时长(小时)</div></div>
        <div className="tile"><div className="tile-num">{overview?.avgDurationSec != null ? Math.round(overview.avgDurationSec / 60) : '—'}</div><div className="tile-label">平均时长(分钟)</div></div>
        <div className="tile"><div className="tile-num">{overview?.avgSquadHp != null ? Math.round(overview.avgSquadHp) : '—'}</div><div className="tile-label">平均血量</div></div>
        <div className="tile"><div className="tile-num win">{overview?.bestWinStreak ?? '—'}</div><div className="tile-label">最长连胜</div></div>
        <div className="tile"><div className="tile-num loss">{overview?.bestLossStreak ?? '—'}</div><div className="tile-label">最长连败</div></div>
      </div>
      {error && <div className="inline-error panel-message" role="alert">{error}</div>}
      {notice && <div className="inline-success panel-message" role="status">{notice}</div>}

      <section className="draft-card" aria-label="待确认草稿">
        <div className="draft-heading">
          <strong>待确认草稿 <span className="draft-count">{drafts.length}</span></strong>
          <span className="muted">先核对，再计入统计</span>
          {/* 导入/粘贴直接产出草稿，放在这里比标题栏更顺手 */}
          <div className="draft-actions">
            <button className="primary-btn" disabled={importing} onClick={() => void importScreenshot()}>{importing ? '正在导入…' : '导入截图'}</button>
            <button className="primary-btn ghost" disabled={importing} title="从剪贴板粘贴截图（Ctrl+V）" onClick={() => void pasteClipboard()}>粘贴截图</button>
          </div>
        </div>
        {drafts.length ? <div className="draft-list">{drafts.map((draft) => <button className="draft-item" key={draft.id} onClick={() => setSelectedDraftId(draft.id)}><span>{fmtTime(draft.endedAt)}</span><span className="draft-status">{draft.status === 'capturing' ? '正在截图' : draft.status === 'recognizing' ? '正在识别' : draft.error ? '需手动核对' : '待核对'}</span><span className="muted">{draft.fields.result === 'suspected' ? '结果待核实' : RESULT_LABEL[draft.fields.result]} · {fmtDur(draft.durationSec)}</span></button>)}</div> : <p className="draft-empty">{loading ? '正在读取草稿…' : '暂无草稿。导入一张结算截图，或在结算界面结束本局计时。'}</p>}
      </section>

      <div className="main-grid">
        {/* 对局列表 */}
        <div className="card list-card">
          <div className="card-title">正式记录 <span className="muted">（点行查看详情与原图）</span></div>
          {/* 工具条：评级筛选 + 导出，和列表标题同行，不占额外大块空间 */}
          <div className="list-toolbar">
            <label className="filter-label" htmlFor="rating-filter">评级</label>
            <select
              id="rating-filter"
              className="filter-select"
              value={ratingFilter}
              onChange={(e) => setRatingFilter(e.target.value)}
            >
              <option value="">全部</option>
              {RATING_ORDER.map((r) => <option key={r} value={r}>{r}</option>)}
              {/* 未评级单独一项：方便把缺评级的记录捞出来补 */}
              <option value="__none__">未评级</option>
            </select>
            <button type="button" className="tb-btn" disabled={exporting || !matches.length} onClick={() => void exportCsv()}>
              {exporting ? '正在导出…' : '导出 CSV'}
            </button>
          </div>
          <div className="match-list">
            {matches.filter((m) => {
              if (!ratingFilter) return true
              const rating = (m.rating ?? '').trim()
              // 「未评级」筛选：rating 为空或只有空白的记录
              if (ratingFilter === '__none__') return rating === ''
              return rating === ratingFilter
            }).map((m) => (
              <button type="button" key={m.id} className={`match-row r-${m.result}`} onClick={() => { setDetail(m); setEditing(false) }}>
                <span className="m-time">{fmtTime(m.startedAt ?? m.endedAt)}</span>
                <span className={`m-badge b-${m.result}`}>{RESULT_LABEL[m.result]}</span>
                <span className="m-dur">{fmtDur(m.durationSec)}</span>
                {/* 评级标记：未评级显示灰色「未评」，方便一眼找出要补的 */}
                {(m.rating ?? '').trim()
                  ? <span className="m-rating">{m.rating}</span>
                  : <span className="m-rating m-rating-none">未评</span>}
                <span className="m-lineup">{[...m.lineup, ...m.bonds].join('·') || '阵容未填写'}</span>
              </button>
            ))}
            {!matches.length && <div className="list-empty"><strong>{loading ? '正在读取记录…' : '还没有正式记录'}</strong><p>结算截图先存为草稿，核对后确认保存。</p>{!loading && <button className="tb-btn" disabled={importing} onClick={() => void importScreenshot()}>导入第一张截图</button>}</div>}
          </div>
        </div>

        {/* 分析页签 */}
        <div className="card analysis-card">
          <div className="tabs">
            <button className={tab === 'lineup' ? 'on' : ''} onClick={() => setTab('lineup')}>阵容</button>
            <button className={tab === 'bond' ? 'on' : ''} onClick={() => setTab('bond')}>羁绊</button>
            <button className={tab === 'rank' ? 'on' : ''} onClick={() => setTab('rank')}>段位走势</button>
            <button className={tab === 'duration' ? 'on' : ''} onClick={() => setTab('duration')}>时长分布</button>
            <button className={tab === 'hour' ? 'on' : ''} onClick={() => setTab('hour')}>活跃时段</button>
            <button className={tab === 'rating' ? 'on' : ''} onClick={() => setTab('rating')}>评级分布</button>
            <button className={tab === 'calendar' ? 'on' : ''} onClick={() => setTab('calendar')}>日历热力图</button>
          </div>
          <div className="tab-body">
            {tab === 'lineup' && <WinrateBars stats={lineups} />}
            {tab === 'bond' && <WinrateBars stats={bonds.map((b) => ({ lineup: b.bond, games: b.games, wins: b.wins, winRate: b.winRate }))} />}
            {tab === 'rank' && (
              <div className="rank-tab">
                <RankHealth matches={matches} onOpen={(m) => { setDetail(m); setEditing(false) }} />
                <div className="rank-tab-main">
              {celebration ? (
                /*
                 * 已满级（A8 财富造物主 20 段）：走势图不再记录后续对局，
                 * 改成「满级战绩卡」—— 徽章 + 关键数据 + 走势缩略 + 贺卡入口。
                 * 段位已封顶，再画一条水平尾巴没有意义。
                 */
                <div className="rank-max-panel">
                  {/* 徽章区：复用贺图的官方 A8 徽章 + 放射光 + 光环 */}
                  <div className="rank-max-hero">
                    <div className="rank-max-rays">
                      {Array.from({ length: 14 }, (_, i) => (
                        <span key={i} style={{ transform: `rotate(${(180 / 14) * i}deg)`, opacity: i % 2 ? 0.4 : 0.16 }} />
                      ))}
                    </div>
                    <div className="rank-max-halo" />
                    <img className="rank-max-badge-img" src={rankBadgeUrl} alt="" />
                  </div>

                  <div className="rank-max-title">{celebration.rankLabel} {celebration.subLevel}</div>
                  <div className="rank-max-sub">已 达 最 高 段 位 · 段 位 已 封 顶</div>

                  <div className="rank-max-stats">
                    <div className="rank-max-stat"><b>{celebration.total}</b><span>总对局</span></div>
                    <div className="rank-max-stat"><b>{Math.round(celebration.winRate * 100)}%</b><span>胜率</span></div>
                    <div className="rank-max-stat"><b>{Math.round(celebration.totalDurationSec / 3600)}h</b><span>总时长</span></div>
                    <div className="rank-max-stat"><b>{celebration.bestWinStreak}</b><span>最长连胜</span></div>
                    <div className="rank-max-stat"><b>{celebration.seasonDays}</b><span>历时(天)</span></div>
                  </div>

                  {/*
                    封顶前的完整走势。
                    满级后不继续画折线，但走过的路要保留 ——
                    之前删掉这里导致"从 A5 打上来"的过程完全看不到。
                  */}
                  <div className="rank-max-curve">
                    <div className="rank-max-curve-head">
                      <span>封顶前走势</span>
                      {/* curve[0] 是合成起点，不是一局 → 局数要减 1，否则和实际条数对不上 */}
                      <em>{Math.max(0, celebration.curve.length - 1)} 局</em>
                    </div>
                    <RankRibbon points={celebration.curve} compact />
                  </div>

                  <button type="button" className="rank-max-entry" onClick={() => setShowCelebration(true)}>
                    查看满段战绩贺卡
                  </button>
                </div>
              ) : (
                <RankRibbon points={rank} />
              )}
                </div>
              </div>
            )}
            {tab === 'duration' && <VBars buckets={durations} unit="局" axisCaption="对局时长（分钟）" />}
            {tab === 'hour' && <HourClock buckets={hours} />}
            {tab === 'rating' && <RatingBars stats={ratings} />}
            {tab === 'calendar' && <CalendarHeatmap matches={matches} />}
          </div>
        </div>
      </div>

      <div className="footer">
        © 米哈游版权所有 · 本工具为非官方同人作品，与 miHoYo / HoYoverse 无关联 · 数据仅存本地
      </div>

      {/* 单局详情 */}
      {detail && (
        <div className="modal-mask" onClick={() => { setDetail(null); setEditing(false) }}>
          <div className="modal detail-modal" role="dialog" aria-modal="true" aria-label="对局详情" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              第 {sequenceOf(detail)} 局 · {fmtTime(detail.endedAt)}
              <div className="title-actions">
                <button className="tb-btn" onClick={() => setEditing(true)} disabled={editing}>修改</button>
                <button className="tb-btn danger" onClick={() => void removeMatch(detail)} disabled={editing || deleting}>删除</button>
                <button className="tb-btn close" onClick={() => setDetail(null)}>✕</button>
              </div>
            </div>
            {editing ? (
              <div className="detail-body">
                <EditMatch match={detail} onCancel={() => setEditing(false)} onSaved={async (saved) => { setEditing(false); setDetail(saved); setNotice('修改已保存。'); await reload() }} />
              </div>
            ) : (
            <div className="detail-body"><div className="modal-grid">
              <div><label>结果</label><span className={`b-${detail.result}`}>{RESULT_LABEL[detail.result]}</span></div>
              <div><label>时长</label>{fmtDur(detail.durationSec)}</div>
              <div><label>段位变化</label>{detail.rankChange ?? '—'}</div>
              <div><label>玩法模式</label>{detail.mode === 'standard' ? '标准博弈' : detail.mode === 'overclock' ? '超频博弈' : '未知'}</div>
              <div><label>结算前段位</label>{rankWithProgress(detail.rankBefore)}</div>
              <div><label>结算后段位</label>{rankWithProgress(detail.rankAfter)}</div>
              <div><label>结算评级</label>{detail.rating || '未知'}</div>
              <div><label>队伍生命</label>{detail.squadHp ?? '未知'}</div>
              <div><label>赛季</label>{detail.season || '未标注'}</div>
              <div><label>数据来源</label>{detail.source === 'ocr' ? '截图识别后人工确认' : '手动确认'}</div>
              <div className="span2"><label>阵容</label>{detail.lineup.join(' · ') || '—'}</div>
              <div className="span2"><label>羁绊</label>{detail.bonds.join(' · ') || '—'}</div>
              <div className="span2"><label>备注</label>{detail.note ?? '—'}</div>
            </div><ScreenshotPreview key={detail.id} matchId={detail.id} /></div>
            )}
          </div>
        </div>
      )}
      {selectedDraft && <ReviewDraft key={selectedDraft.id} draft={selectedDraft} onClose={() => setSelectedDraftId(null)} onUpdate={updateDraft} onSaved={async () => { setSelectedDraftId(null); setNotice('已确认保存，本局已计入正式记录。'); await reload() }} onDiscarded={async () => { setSelectedDraftId(null); setNotice('草稿已丢弃，未计入统计。'); await reload() }} />}
      {showCelebration && celebration && <CelebrationCard data={celebration} onClose={() => setShowCelebration(false)} />}
    </div>
  )
}

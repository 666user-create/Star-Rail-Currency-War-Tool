import type { RankPoint } from '@shared/types'
import { displayRank, rankValue, subLevelGain } from '@shared/ranks'

/**
 * 段位走势：每局色带（GitHub 贡献条思路）。
 *
 * 一局一根竖条，条的颜色 = 该局结束时的段位；
 * 升大段 = 颜色跳变 + 「↑升A7」+ 该把涨的小段数；
 * 顶部数字 = 每把涨了几小段（跨大段也能算，见 subLevelGain）；
 * 负局 = 斜纹红底；首次满级 = 金色虚线圆环。
 *
 * 两种布局：
 * - 默认（面板内）：单行 + 横向滚动。交互场景可以滚，条永远不变窄。
 * - wrap（贺卡导出）：固定列数换行成多行。静态 PNG 不能滚，
 *   单行会被裁掉，必须换行让所有局都出现在图里，卡片高度相应变高。
 */
export const RIBBON_BAND_COLORS = [
  '#55555f', '#7a6a4a', '#4a7a5f', '#5f7a8a', '#8a7a7a',
  '#7a6fc0', '#4f7fd0', '#d08a4a', '#e8c476'
]

export function RankRibbon({
  points,
  compact = false,
  wrap = false
}: {
  points: RankPoint[]
  compact?: boolean
  /** 贺卡导出用：换行成多行，不依赖滚动 */
  wrap?: boolean
}): React.JSX.Element {
  if (points.length < 2) return <div className="chart-empty">数据还不够画曲线~</div>

  // 第一个点是「结算前起点」，不算一局
  const start = points[0]
  const games = points.slice(1)

  const bandOf = (score: number): number => Math.max(0, Math.min(8, Math.floor(score / 1000)))
  const isMax = (score: number): boolean => score >= 8020

  /*
   * 尺寸：字和条都放大过一轮 —— 用户明确接受滚动，不需要为了塞进
   * 小格子而缩小。横向滚动负责局数多的情况。
   * 起点条与对局条同宽（之前是 24px 的细条，比其他条窄一半，看着很突兀）。
   */
  const CELL_W = compact ? 54 : 60
  const BAR_H = compact ? 132 : 190
  const TOP = compact ? 36 : 38
  const GAP_X = 8
  const LABEL_H = 32

  /*
   * 每局涨幅的基准：优先用这一局自己填的「结算前段位」(before)，
   * 没填（或明显不合理）时才回落到上一局的结算后段位。
   *
   * 为什么不能只用上一局：玩家会补录/修正段位，两者可能不一致。
   * 实例：某局 before=A8财富造物主3(8003)、after=财富造物主6(8006)，
   * 上一局结算后是 8000 —— 用上一局算会把 +3 算成 +6。
   *
   * 合理性校验：before 必须 ≤ 本局结算后段位（本作战败不降段）。
   * 历史数据里有 before 填错的情况（比 after 还高），
   * 那种直接忽略，否则会画出负涨幅。
   */
  const prevOf = (i: number): number => {
    const own = games[i].before
    if (typeof own === 'number' && own > 0 && own <= games[i].cumulative) return own
    return i === 0 ? start.cumulative : games[i - 1].cumulative
  }
  const crossOf = (i: number): boolean => bandOf(games[i].cumulative) > bandOf(prevOf(i))

  /** 分数 → RankValue（用于按官方档数表算涨幅） */
  const asRank = (score: number) => rankValue('A' + bandOf(score), score % 1000)

  /**
   * 这一局涨了几个小段。null = 数据不足（有一侧没填小段位）→ 显示「—」。
   *
   * 跨大段也能量化：subLevelGain 会先补满旧档再加新档，
   * 例如 资本帝王9 → 财富造物主3 = (9−9)+3 = +3。
   */
  const gainOf = (i: number): number | null => subLevelGain(asRank(prevOf(i)), asRank(games[i].cumulative))

  /** 涨幅文本：+N / ±0 / —（数据不足） */
  const gainText = (i: number): string => {
    const g = gainOf(i)
    if (g === null) return '—'
    return g > 0 ? '+' + g : '±0'
  }

  const bandsPresent = [...new Set([bandOf(start.cumulative), ...games.map((g) => bandOf(g.cumulative))])].sort((a, b) => a - b)
  const showAllNums = games.length <= 40

  /** 一根条（含标注）。x/y 是条左上角 */
  const renderBar = (
    key: string,
    x: number,
    y: number,
    opts: {
      band: number
      /** 涨幅文本（+3 / ±0 / —），由调用方用 gainText 生成 */
      gainLabel: string
      isLoss: boolean
      cross: boolean
      maxed: boolean
      /** 起点标记：同宽但用虚线描边 + 半透明，并标注起始段位 */
      isStart?: boolean
      /** 起点条顶部显示的段位文本（如「紫金1」） */
      startText?: string
      num?: number
      title: string
      width?: number
    }
  ): React.JSX.Element => {
    const w = opts.width ?? CELL_W
    const cx = x + w / 2
    const color = RIBBON_BAND_COLORS[opts.band]
    return (
      <g key={key}>
        <rect x={x} y={y} width={w} height={BAR_H} rx={5} fill={color} opacity={opts.isStart ? 0.34 : 1} />
        {/*
          起点条：虚线描边 + 半透明填充。
          它代表「第一局开打前所在的位置」，不是一局战绩 ——
          用描边把它和实心对局条区分开，但保持同样的宽度和配色，不突兀。
        */}
        {opts.isStart && (
          <rect
            x={x + 0.75} y={y + 0.75} width={w - 1.5} height={BAR_H - 1.5} rx={5}
            fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="6 5"
          />
        )}
        {opts.isLoss && (
          <g>
            <rect x={x} y={y} width={w} height={BAR_H} rx={5} fill="rgba(208,80,80,.55)" />
            {[0, 1, 2, 3, 4, 5].map((k) => (
              <line key={k} x1={x + k * 7} y1={y} x2={x + k * 7 + w} y2={y + BAR_H} stroke="rgba(255,255,255,.22)" strokeWidth={1.6} />
            ))}
          </g>
        )}
        {opts.maxed && (
          <rect x={x + 4} y={y + 9} width={w - 8} height={BAR_H - 18} rx={4} fill="none" stroke="#fff3cf" strokeWidth={2} strokeDasharray="6 5" />
        )}
        {/* 顶部标注 */}
        {opts.isStart ? (
          <text x={cx} y={y - 8} textAnchor="middle" className="rb-start-rank">{opts.startText}</text>
        ) : opts.cross ? (
          /*
            跨大段：原来只有一个三角旗帜、没有数值，导致「这一把涨了几小段」
            完全看不到（玩家会以为某局没画进图里）。
            现在两行：↑升A8 + 本把涨幅。
          */
          <g>
            <text x={cx} y={y - 22} textAnchor="middle" className="rb-flag">{'↑升A' + opts.band}</text>
            <text x={cx} y={y - 5} textAnchor="middle" className="rb-gain-cross">{opts.gainLabel}</text>
          </g>
        ) : opts.isLoss ? (
          <text x={cx} y={y - 6} textAnchor="middle" className="rb-loss">败{opts.gainLabel}</text>
        ) : (
          <text x={cx} y={y - 6} textAnchor="middle" className="rb-gain">{opts.gainLabel}</text>
        )}
        {/* 底部标注 */}
        {opts.isStart ? (
          <text x={cx} y={y + BAR_H + 17} textAnchor="middle" className="rb-start">起点</text>
        ) : opts.maxed ? (
          <text x={cx} y={y + BAR_H + 17} textAnchor="middle" className="rb-max">满级</text>
        ) : showAllNums || (opts.num !== undefined && opts.num % 5 === 0) ? (
          <text x={cx} y={y + BAR_H + 17} textAnchor="middle" className="rb-num">{opts.num}</text>
        ) : null}
        <title>{opts.title}</title>
      </g>
    )
  }

  // ── wrap 模式：固定列数换行（贺卡导出，静态图不能滚） ──
  if (wrap) {
    const PER_ROW = compact ? 12 : 10
    // 起点也占一格，保证网格整齐
    const cells: Array<{ kind: 'start' } | { kind: 'game'; index: number }> = [
      { kind: 'start' },
      ...games.map((_, i) => ({ kind: 'game' as const, index: i }))
    ]
    const rowCount = Math.ceil(cells.length / PER_ROW)
    const SVGPAD = 6
    const ROW_H = TOP + BAR_H + LABEL_H
    const W = SVGPAD * 2 + PER_ROW * (CELL_W + GAP_X) - GAP_X
    const H = SVGPAD * 2 + rowCount * ROW_H

    return (
      <div className="rank-ribbon rank-ribbon-wrapped">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="rank-ribbon-svg">
          {cells.map((cell, i) => {
            const row = Math.floor(i / PER_ROW)
            const col = i % PER_ROW
            const x = SVGPAD + col * (CELL_W + GAP_X)
            const y = SVGPAD + row * ROW_H + TOP
            if (cell.kind === 'start') {
              return renderBar('start', x, y, {
                band: bandOf(start.cumulative),
                gainLabel: '',
                isLoss: false,
                cross: false,
                maxed: false,
                isStart: true,
                startText: displayRank(start.label),
                title: '起点 ' + displayRank(start.label)
              })
            }
            const idx = cell.index
            const g = games[idx]
            const gainLabel = gainText(idx)
            const isLoss = g.result === 'loss'
            return renderBar('g' + idx, x, y, {
              band: bandOf(g.cumulative),
              gainLabel,
              isLoss,
              cross: crossOf(idx),
              maxed: isMax(g.cumulative) && !isMax(prevOf(idx)),
              num: idx + 1,
              title: displayRank(g.label) + ' · 第 ' + (idx + 1) + ' 局' + (gainLabel !== '±0' && gainLabel !== '—' ? ' · ' + gainLabel : '') + (isLoss ? ' · 败' : '')
            })
          })}
        </svg>
      </div>
    )
  }

  // ── 默认模式：单行 + 横向滚动（面板内交互） ──
  // 起点占一格（与对局条同宽），所以总宽按 games.length + 1 格算
  const W = 4 + (games.length + 1) * (CELL_W + GAP_X)
  const H = TOP + BAR_H + LABEL_H

  return (
    <div className="rank-ribbon">
      {!compact && (
        <div className="rank-ribbon-head">
          <span className="rank-ribbon-title">段位走势 · 共 {games.length} 局</span>
          <span className="rank-ribbon-hint">颜色 = 结束段位 · ↑升Ax = 跨大段 · 数字 = 每把涨幅</span>
        </div>
      )}
      <div className="rank-ribbon-legend">
        {bandsPresent.map((b) => (
          <span key={b} className="rank-ribbon-legend-item">
            <i style={{ background: RIBBON_BAND_COLORS[b] }} />
            {'A' + b}
          </span>
        ))}
        <span className="rank-ribbon-legend-item"><i className="loss" />败局</span>
        <span className="rank-ribbon-legend-item"><i className="max" />满级</span>
        {games.length > 10 && !compact && <span className="rank-ribbon-hint">← 可横向滚动 →</span>}
      </div>
      <div className="rank-ribbon-scroll">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="rank-ribbon-svg">
          {renderBar('start', 4, TOP, {
            band: bandOf(start.cumulative),
            gainLabel: '',
            isLoss: false,
            cross: false,
            maxed: false,
            isStart: true,
            startText: displayRank(start.label),
            title: '起点 ' + displayRank(start.label)
          })}
          {games.map((g, i) => {
            const x = 4 + (i + 1) * (CELL_W + GAP_X)
            const gainLabel = gainText(i)
            const isLoss = g.result === 'loss'
            return renderBar('g' + i, x, TOP, {
              band: bandOf(g.cumulative),
              gainLabel,
              isLoss,
              cross: crossOf(i),
              maxed: isMax(g.cumulative) && !isMax(prevOf(i)),
              num: i + 1,
              title: displayRank(g.label) + ' · 第 ' + (i + 1) + ' 局' + (gainLabel !== '±0' && gainLabel !== '—' ? ' · ' + gainLabel : '') + (isLoss ? ' · 败' : '')
            })
          })}
        </svg>
      </div>
    </div>
  )
}

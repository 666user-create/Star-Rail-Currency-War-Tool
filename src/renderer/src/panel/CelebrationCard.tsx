import { useEffect, useRef, useState } from 'react'
import type { CelebrationData } from '@shared/types'
// 官方 A8 职级徽章（从游戏内截图裁出）。走 vite 资源导入，构建时会被内联/打包进产物，
// 不依赖 publicDir（本项目为了不把模型素材打进包里，显式关掉了 publicDir）。
import rankBadgeUrl from '../../../../assets/rank/rank-a8.png'
import './celebration.css'

/**
 * 满级贺图。
 *
 * 触发条件：某赛季的最高段位达到 A8 财富造物主并填满 20 小段。
 * 由调用方判断（celebrationData() 返回非 null）后挂载。
 *
 * 徽章显示策略：
 * 1. 优先用官方职级徽章图片（assets/official/rank-a8.png，从游戏内截图裁切）
 * 2. 图片不存在时回落到内置 SVG 手绘版，保证不空白
 */
export function CelebrationCard({
  data,
  onClose,
  standalone = false
}: {
  data: CelebrationData
  onClose: () => void
  /** 离屏导出模式：不显示操作按钮、不自动缩放、只渲染卡片本体 */
  standalone?: boolean
}): React.JSX.Element {
  const cardRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')

  const winRatePct = Math.round(data.winRate * 100)
  const hours = (data.totalDurationSec / 3600).toFixed(1)
  const achievedDate = new Date(data.achievedAt)
  const dateText = `${achievedDate.getFullYear()}.${String(achievedDate.getMonth() + 1).padStart(2, '0')}.${String(achievedDate.getDate()).padStart(2, '0')}`

  // 把走势图数据映射到 SVG 坐标（宽 720，高 232）
  const W = 720, H = 232, PAD_L = 46, PAD_R = 30, PAD_T = 30, PAD_B = 46
  const points = data.curve
  const RANK_CODES = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8']

  /**
   * 把分数压成「连续职级序号」，每个大段占 1.0。
   *
   * 为什么不能直接用分数：分数是「大段×1000+小段位」，
   * A6-1→A6-9 只差 8 分，而 A6-9→A7-2 差 93 分，
   * 直接线性映射会让段内进步几乎不可见、段间跳变拉成长斜线。
   *
   * 改成：大段占 1.0，段内小段位按该段实际档数等比展开
   * （A0–A7 按 10 档算，A8 按 20 档算），这样每局都有可见的上升。
   * 例：A6-1=6.1、A6-9=6.9、A7-2=7.2、A8-20=9.0
   */
  const ordinalOf = (score: number): number => {
    const band = Math.max(0, Math.min(8, Math.floor(score / 1000)))
    const sub = Math.max(0, score % 1000)
    const maxSub = band === 8 ? 20 : 10
    return band + Math.min(sub, maxSub) / maxSub
  }

  const ordinals = points.map((p) => ordinalOf(p.cumulative))
  const oMin = ordinals.length ? Math.min(...ordinals) : 0
  const oMax = ordinals.length ? Math.max(...ordinals) : 1
  const oSpan = Math.max(0.001, oMax - oMin)

  /** 职级序号 → Y 坐标（越大越高；SVG y 向下所以要翻转） */
  const syOrd = (ord: number): number => H - PAD_B - ((ord - oMin) / oSpan) * (H - PAD_T - PAD_B)
  const sy = (score: number): number => syOrd(ordinalOf(score))

  /**
   * X 轴按「第几局」均匀分布，不按真实时间。
   * 用真实时间的话两局间隔可能从几分钟到几小时，点会疏密不均。
   */
  const sx = (index: number): number =>
    points.length <= 1
      ? PAD_L + (W - PAD_L - PAD_R) / 2
      : PAD_L + (index / (points.length - 1)) * (W - PAD_L - PAD_R)
  const linePath = points.map((p, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)} ${sy(p.cumulative).toFixed(1)}`).join(' ')
  const areaPath = points.length
    ? `${linePath} L${sx(points.length - 1).toFixed(1)} ${H - PAD_B} L${sx(0).toFixed(1)} ${H - PAD_B} Z`
    : ''

  // 段位刻度：按各段在序号轴上的位置画横线
  const minBand = points.length ? Math.min(...points.map((p) => Math.floor(p.cumulative / 1000))) : 0
  const maxBand = points.length ? Math.max(...points.map((p) => Math.floor(p.cumulative / 1000))) : 8
  const rankTicks: Array<{ label: string; y: number }> = []
  for (let band = minBand; band <= maxBand; band++) {
    const code = RANK_CODES[band] ?? ''
    if (!code) continue
    const y = syOrd(band)
    // 只画落在绘图区内的刻度线
    if (y >= PAD_T - 1 && y <= H - PAD_B + 1) rankTicks.push({ label: code, y })
  }

  const exportPng = async (): Promise<void> => {
    if (saving) return
    setSaving(true)
    try {
      // 不再在面板窗口里截（面板高度受屏幕限制，卡片 1144px 装不下）。
      // 把数据交给主进程，由它开一个隐藏窗口单独渲染后截图导出。
      const saved = await window.api.saveCelebrationCapture(
        JSON.stringify(data),
        `货币战争-${data.rankLabel}${data.subLevel}-满段贺图.png`
      )
      setSaved(saved ? '已保存' : '已取消')
      setTimeout(() => setSaved(''), 3000)
    } catch {
      setSaved('导出失败')
      setTimeout(() => setSaved(''), 3000)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /**
   * 缩放策略：面板窗口高度通常装不下完整贺图（1123px vs ~760px 可用）。
   * 用 scale 等比缩到合适高度，但限制最小 0.62（再小文字就看不清了），
   * 缩不够的部分靠 overlay 滚动查看。导出时按原始尺寸渲染，不影响清晰度。
   */
  const [scale, setScale] = useState(1)
  useEffect(() => {
    // 离屏导出模式：不缩放，按原始 900px 渲染
    if (standalone) { setScale(1); return }
    const compute = (): void => {
      const node = cardRef.current
      if (!node) return
      const overlay = node.closest('.celebration-overlay') as HTMLElement | null
      const availH = (overlay?.clientHeight ?? window.innerHeight) - 24 - 56 - 30
      // 用 offsetHeight（未被 transform 影响）
      const cardH = node.offsetHeight || 1123
      const next = Math.min(1, Math.max(0.62, availH / cardH))
      setScale(next)
    }
    compute()
    window.addEventListener('resize', compute)
    const timer = window.setTimeout(compute, 120)
    return () => {
      window.removeEventListener('resize', compute)
      window.clearTimeout(timer)
    }
  }, [data])

  return (
    <div className="celebration-overlay" role="dialog" aria-modal="true" aria-label="满级贺图">
      {!standalone && (
        <div className="celebration-actions">
          <button type="button" className="celebration-btn" onClick={() => void exportPng()} disabled={saving}>
            {saving ? '导出中…' : '保存图片'}
          </button>
          <button type="button" className="celebration-btn ghost" onClick={onClose}>关闭</button>
          {saved && <span className="celebration-saved">{saved}</span>}
        </div>
      )}

      <div className="celebration-card" ref={cardRef} style={{ transform: `scale(${scale})` }}>
        <div className="cel-frame"><i /><i /><i /><i /></div>

        <div className="cel-head">
          <div className="cel-eyebrow">{data.rankLabel}</div>
          <div className="cel-season">货币战争 · {data.season}</div>
        </div>

        {/* 徽章 */}
        <div className="cel-badge-stage">
          <div className="cel-rays">
            {Array.from({ length: 16 }, (_, i) => (
              <span key={i} style={{ transform: `rotate(${(180 / 16) * i}deg)`, opacity: i % 2 ? 0.5 : 0.22, height: i % 2 ? 470 : 380 }} />
            ))}
          </div>
          <div className="cel-halo" />
          <div className="cel-halo2" />
          {/* 优先用官方职级徽章图；没有图/加载失败时回落到内置 SVG */}
          <img className="cel-badge-img" src={rankBadgeUrl} alt="" />
        </div>

        <div className="cel-rank-line">
          <span className="cel-rank-name">{data.rankLabel}</span>
          <span className="cel-lvl">
            <span className="cel-lvl-num">{data.subLevel}</span>
            <span className="cel-lvl-tag">满级</span>
          </span>
        </div>
        <div className="cel-max-line">已 达 最 高 段 位</div>
        <div className="cel-date">{dateText} 达成 · 历时 {data.seasonDays} 天</div>

        <div className="cel-stats">
          <div className="cel-stat"><div className="cel-stat-num">{data.total}</div><div className="cel-stat-label">总对局</div></div>
          <div className="cel-stat"><div className="cel-stat-num">{winRatePct}%</div><div className="cel-stat-label">胜率</div></div>
          <div className="cel-stat"><div className="cel-stat-num">{hours}h</div><div className="cel-stat-label">总时长</div></div>
          <div className="cel-stat"><div className="cel-stat-num">{data.bestWinStreak}</div><div className="cel-stat-label">最长连胜</div></div>
        </div>

        <div className="cel-chart-box">
          <div className="cel-chart-head">
            <span>段位走势</span>
            <em>共 {data.curve.length} 局 · 每局节点</em>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
            <defs>
              <linearGradient id="celLineGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#6f5320" /><stop offset="60%" stopColor="#e8c476" /><stop offset="100%" stopColor="#fff8e0" />
              </linearGradient>
              <linearGradient id="celAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(232,196,118,.26)" /><stop offset="100%" stopColor="rgba(232,196,118,0)" />
              </linearGradient>
            </defs>
            {rankTicks.map((tick) => (
              <g key={tick.label}>
                <line x1={PAD_L} y1={tick.y} x2={W - PAD_R} y2={tick.y} stroke="rgba(255,255,255,.06)" />
                <text x={10} y={tick.y + 5} fill="rgba(232,196,118,.45)" fontSize="10">{tick.label}</text>
              </g>
            ))}
            <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="rgba(255,255,255,.10)" />
            {areaPath && <path d={areaPath} fill="url(#celAreaGrad)" />}
            {linePath && <path d={linePath} fill="none" stroke="url(#celLineGrad)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
            {points.map((p, i) => (
              <circle key={i} cx={sx(i)} cy={sy(p.cumulative)} r={i === points.length - 1 ? 5 : 3}
                fill={i === points.length - 1 ? '#fffdf4' : '#0a1024'}
                stroke={i === points.length - 1 ? '#e8c476' : 'rgba(232,196,118,.75)'}
                strokeWidth={i === points.length - 1 ? 2.2 : 1.7} />
            ))}
            {points.length > 0 && (
              <text x={sx(points.length - 1) - 68} y={sy(points[points.length - 1].cumulative) - 12}
                fill="#fff8e0" fontSize="11" fontWeight="800">{data.rankCode}·{data.subLevel}</text>
            )}
          </svg>
        </div>

        <div className="cel-footer">
          <div className="cel-f-line" />
          <div className="cel-f-main">货 币 战 争 桌 宠</div>
          <div className="cel-f-sub">数据仅存本地 · 非米哈游官方作品</div>
        </div>
      </div>
    </div>
  )
}

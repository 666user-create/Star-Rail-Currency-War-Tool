import { useEffect, useRef, useState } from 'react'
import type { CelebrationData } from '@shared/types'
// 官方 A8 职级徽章（从游戏内截图裁出）。走 vite 资源导入，构建时会被内联/打包进产物，
// 不依赖 publicDir（本项目为了不把模型素材打进包里，显式关掉了 publicDir）。
import rankBadgeUrl from '../../../../assets/rank/rank-a8.png'
import { RankRibbon } from './RankRibbon'
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

  // 走势图数据由 RankRibbon 组件渲染（每局色带）

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
   * 缩放策略：优先按「宽度」铺满面板，其次才受高度约束。
   *
   * 之前只按高度算：1123px 高的贺图在 ~760px 高的面板里被缩到 0.62，
   * 900px 宽只剩 560px，看起来又窄又小。
   * 改成「宽度优先」：面板多宽贺图就尽量多宽（上限原始尺寸），
   * 高度装不下的部分由 overlay 竖向滚动，不影响清晰度。
   */
  const [scale, setScale] = useState(1)
  useEffect(() => {
    // 离屏导出模式：不缩放，按原始 900px 渲染
    if (standalone) { setScale(1); return }
    const compute = (): void => {
      const node = cardRef.current
      if (!node) return
      const overlay = node.closest('.celebration-overlay') as HTMLElement | null
      const availW = (overlay?.clientWidth ?? window.innerWidth) - 48
      const availH = (overlay?.clientHeight ?? window.innerHeight) - 24 - 56 - 30
      // 用 offsetHeight（未被 transform 影响）
      const cardW = node.offsetWidth || 900
      const cardH = node.offsetHeight || 1123
      const byW = availW / cardW
      const byH = availH / cardH
      // 宽度优先（取两者较大值），但绝不放大超过原始尺寸
      const next = Math.min(1, Math.max(0.62, Math.max(byW, byH)))
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
            {/* curve[0] 是合成起点，不是一局 → 局数要减 1 */}
            <em>封顶前 {Math.max(0, data.curve.length - 1)} 局 · 每局一根</em>
          </div>
          {/* 静态导出用 wrap：换行成多行，局数多了也不会被裁掉 */}
          <RankRibbon points={data.curve} compact wrap />
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

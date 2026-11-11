import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { BondStat, DurationBucket, HourBucket, LineupStat, Match, OverviewStats, RankPoint, RecordingDraft } from '@shared/types'
import ReviewDraft, { errorText, RESULT_LABEL, ScreenshotPreview } from './ReviewDraft'
import { SEASONS, defaultSeason, formatStartDate, parseStartDate, resolvedSeasons, seasonStartAt } from '@shared/seasons'
import EditMatch from './EditMatch'

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

/* ————— 迷你图表（纯 SVG） ————— */

function LineChart({ points }: { points: RankPoint[] }) {
  if (points.length < 2) return <div className="chart-empty">数据还不够画曲线~</div>
  const w = 380, h = 150, pad = 24
  const xs = points.map((p) => p.time)
  const ys = points.map((p) => p.cumulative)
  const x0 = Math.min(...xs), x1 = Math.max(...xs)
  // Y 轴按数据实际范围留 8% 边距：段位分值跨度可能很小（如 61→69），
  // 从 0 起画会压成一条平线看不出进步。
  const rawMin = Math.min(...ys), rawMax = Math.max(...ys)
  const span = Math.max(1, rawMax - rawMin)
  const y0 = rawMin - span * 0.08
  const y1 = rawMax + span * 0.08
  const sx = (t: number) => pad + ((t - x0) / Math.max(1, x1 - x0)) * (w - pad * 2)
  const sy = (v: number) => h - pad - ((v - y0) / Math.max(1, y1 - y0)) * (h - pad * 2)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.time).toFixed(1)} ${sy(p.cumulative).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart">
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="rgba(255,255,255,0.15)" />
      <path d={path} fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx={sx(points[points.length - 1].time)} cy={sy(points[points.length - 1].cumulative)} r="4" fill="var(--gold)" />
      <text x={pad} y={16} className="chart-note">段位走势 · 按结算后段位</text>
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
  if (!buckets.some((bucket) => bucket.count > 0)) return <div className="chart-empty">暂无可统计的记录</div>
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
  const [bonds, setBonds] = useState<BondStat[]>([])
  const [rank, setRank] = useState<RankPoint[]>([])
  const [durations, setDurations] = useState<DurationBucket[]>([])
  const [hours, setHours] = useState<HourBucket[]>([])
  const [tab, setTab] = useState<'lineup' | 'bond' | 'rank' | 'duration' | 'hour'>('lineup')
  const [detail, setDetail] = useState<Match | null>(null)
  const [editing, setEditing] = useState(false)
  const [currentSeason, setCurrentSeason] = useState<string>(() => defaultSeason())
  // 用户填写的赛季时间（覆盖代码内置值）
  const [seasonStarts, setSeasonStarts] = useState<Record<string, number>>({})
  const [seasonEnds, setSeasonEnds] = useState<Record<string, number>>({})
  // 待补开始时间的赛季：点该赛季时若还没登记开始日期，就地让用户填
  const [seasonDatePrompt, setSeasonDatePrompt] = useState<{ seasonId: string; label: string; value: string } | null>(null)
  const [drafts, setDrafts] = useState<RecordingDraft[]>([])
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null)
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

      const [nextOverview, nextMatches, nextLineups, nextBonds, nextRank, nextDurations, nextHours, nextDrafts] = await Promise.all([
        window.api.overview(season), window.api.listMatches(300, season), window.api.lineupStats(season),
        window.api.bondStats(season), window.api.rankCurve(season),
        window.api.durationHistogram(season), window.api.hourHistogram(season), window.api.listDrafts()
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
          <button className="primary-btn" disabled={importing} onClick={() => void importScreenshot()}>{importing ? '正在导入…' : '导入结算截图'}</button>
          <button className="tb-btn" disabled={importing} title="从剪贴板粘贴截图（Ctrl+V）" onClick={() => void pasteClipboard()}>粘贴截图</button>
          <button className="tb-btn" onClick={() => void reload()}>刷新</button>
          <button className="tb-btn close" aria-label="关闭面板" onClick={() => window.close()}>✕</button>
        </div>
      </div>

      <p className="capture-hint">自助添加：游戏结算画面用 Win+Shift+S 截图，回到面板 Ctrl+V（或点「粘贴截图」）即进入核对。</p>
      <p className="capture-hint">Ctrl+Shift+F8 开始/结束计时（若快捷键未被占用）。结束后截图会进入待确认草稿。</p>

      {/* 总览统计 */}
      <div className="tiles">
        <div className="tile"><div className="tile-num">{overview?.total ?? '—'}</div><div className="tile-label">总局数</div></div>
        <div className="tile"><div className="tile-num gold">{winRate}</div><div className="tile-label">胜率 · 已核实胜负</div></div>
        <div className="tile"><div className="tile-num">{overview?.knownDurationGames ? (overview.totalDurationSec / 3600).toFixed(1) : '—'}</div><div className="tile-label">总时长(小时) · 仅已知</div></div>
        <div className="tile"><div className="tile-num">{overview?.avgDurationSec != null ? Math.round(overview.avgDurationSec / 60) : '—'}</div><div className="tile-label">平均时长(分) · 已知胜负局</div></div>
        <div className="tile"><div className="tile-num">{overview?.avgSquadHp != null ? Math.round(overview.avgSquadHp) : '—'}</div><div className="tile-label">平均血量 · 已知 {overview?.knownSquadHpGames ?? 0} 局</div></div>
        <div className="tile"><div className="tile-num win">{overview?.bestWinStreak ?? '—'}</div><div className="tile-label">最长连胜</div></div>
        <div className="tile"><div className="tile-num loss">{overview?.bestLossStreak ?? '—'}</div><div className="tile-label">最长连败</div></div>
      </div>
      <div className="duration-note">已知时长 {overview?.knownDurationGames ?? 0} 局，未知 {overview?.unknownDurationGames ?? 0} 局；总时长仅计已知，平均仅计有时长的已确认胜负局。「待核实」不计胜负。</div>
      {error && <div className="inline-error panel-message" role="alert">{error}<button className="tb-btn" onClick={() => void reload()}>重试</button></div>}
      {notice && <div className="inline-success panel-message" role="status">{notice}</div>}

      <section className="draft-card" aria-label="待确认草稿">
        <div className="draft-heading"><strong>待确认草稿 <span className="draft-count">{drafts.length}</span></strong><span className="muted">先核对，再计入统计</span></div>
        {drafts.length ? <div className="draft-list">{drafts.map((draft) => <button className="draft-item" key={draft.id} onClick={() => setSelectedDraftId(draft.id)}><span>{fmtTime(draft.endedAt)}</span><span className="draft-status">{draft.status === 'capturing' ? '正在截图' : draft.status === 'recognizing' ? '正在识别' : draft.error ? '需手动核对' : '待核对'}</span><span className="muted">{draft.fields.result === 'suspected' ? '结果待核实' : RESULT_LABEL[draft.fields.result]} · {fmtDur(draft.durationSec)}</span></button>)}</div> : <p className="draft-empty">{loading ? '正在读取草稿…' : '暂无草稿。导入一张结算截图，或在结算界面结束本局计时。'}</p>}
      </section>

      <div className="main-grid">
        {/* 对局列表 */}
        <div className="card list-card">
          <div className="card-title">正式记录 <span className="muted">（点行查看详情与原图）</span></div>
          <div className="match-list">
            {matches.map((m) => (
              <button type="button" key={m.id} className={`match-row r-${m.result}`} onClick={() => { setDetail(m); setEditing(false) }}>
                <span className="m-time">{fmtTime(m.startedAt ?? m.endedAt)}</span>
                <span className={`m-badge b-${m.result}`}>{RESULT_LABEL[m.result]}</span>
                <span className="m-dur">{fmtDur(m.durationSec)}</span>
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
          </div>
          <div className="tab-body">
            {tab === 'lineup' && <WinrateBars stats={lineups} />}
            {tab === 'bond' && <WinrateBars stats={bonds.map((b) => ({ lineup: b.bond, games: b.games, wins: b.wins, winRate: b.winRate }))} />}
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
        <div className="modal-mask" onClick={() => { setDetail(null); setEditing(false) }}>
          <div className="modal detail-modal" role="dialog" aria-modal="true" aria-label="对局详情" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              第 {detail.id} 局 · {fmtTime(detail.endedAt)}
              <div className="title-actions">
                <button className="tb-btn" onClick={() => setEditing(true)} disabled={editing}>修改</button>
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
              <div><label>结算前段位</label>{detail.rankBefore || '未知'}</div>
              <div><label>结算后段位</label>{detail.rankAfter || '未知'}</div>
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
    </div>
  )
}

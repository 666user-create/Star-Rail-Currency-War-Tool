import React, { useState } from 'react'
import type { DraftInput, Match, MatchResult } from '@shared/types'
import { SEASONS } from '@shared/seasons'
import { RESULT_LABEL, errorText } from './ReviewDraft'

const RESULT_OPTIONS: MatchResult[] = ['win', 'loss', 'interrupted', 'suspected']

const localDateTime = (time: number): string => {
  const date = new Date(time)
  return new Date(time - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19)
}

type Form = {
  result: MatchResult
  endedAt: string
  durationUnknown: boolean
  durationMin: string
  mode: string
  rankBefore: string
  rankAfter: string
  rankChange: string
  rating: string
  squadHp: string
  lineup: string
  bonds: string
  season: string
  note: string
}

const toForm = (match: Match): Form => ({
  result: match.result,
  endedAt: localDateTime(match.endedAt),
  durationUnknown: match.durationSec == null,
  durationMin: match.durationSec == null ? '' : String(Math.round((match.durationSec / 60) * 10) / 10),
  mode: match.mode ?? '',
  rankBefore: match.rankBefore ?? '',
  rankAfter: match.rankAfter ?? '',
  rankChange: match.rankChange == null ? '' : String(match.rankChange),
  rating: match.rating ?? '',
  squadHp: match.squadHp == null ? '' : String(match.squadHp),
  lineup: match.lineup.join('、'),
  bonds: match.bonds.join('、'),
  season: match.season,
  note: match.note ?? ''
})

/** 已保存战绩的编辑表单：原地修改，不是落子无悔。 */
export default function EditMatch({ match, onCancel, onSaved }: {
  match: Match
  onCancel: () => void
  onSaved: (match: Match) => Promise<void> | void
}) {
  const [form, setForm] = useState<Form>(() => toForm(match))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const edit = <K extends keyof Form>(key: K, value: Form[K]) => setForm((previous) => ({ ...previous, [key]: value }))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return
    setError('')
    const endedAt = new Date(form.endedAt).getTime()
    const durationMin = form.durationUnknown ? null : Number(form.durationMin)
    const durationSec = durationMin === null ? null : Math.round(durationMin * 60)
    const rankChange = form.rankChange.trim() ? Number(form.rankChange) : null
    const squadHp = form.squadHp.trim() ? Number(form.squadHp) : null
    if (!Number.isFinite(endedAt)) { setError('请填写有效的结束时间。'); return }
    if (durationSec !== null && (!form.durationMin.trim() || !Number.isFinite(durationMin as number) || (durationMin as number) < 0)) { setError('时长请填写非负分钟数，或勾选「时长未知」。'); return }
    if (rankChange !== null && !Number.isInteger(rankChange)) { setError('段位变化请填写整数，可为负数；未知时留空。'); return }
    if (squadHp !== null && (!Number.isInteger(squadHp) || squadHp < 0)) { setError('队伍生命请填写非负整数；未知时留空。'); return }
    const input: DraftInput = {
      endedAt, durationSec, result: form.result,
      mode: form.mode === 'standard' || form.mode === 'overclock' ? form.mode : null,
      rankBefore: form.rankBefore.trim() || null, rankAfter: form.rankAfter.trim() || null,
      rankChange, rating: form.rating.trim() || null, squadHp,
      lineup: [...new Set(form.lineup.split(/[,，、;；\n]/).map((v) => v.trim()).filter(Boolean))],
      bonds: [...new Set(form.bonds.split(/[,，、;；\n]/).map((v) => v.trim()).filter(Boolean))],
      season: form.season.trim(), note: form.note.trim() || null
    }
    setSaving(true)
    try {
      const saved = await window.api.updateMatch(match.id, input)
      await onSaved(saved)
    } catch (reason) { setError(errorText(reason, '保存失败，修改未写入。')) }
    finally { setSaving(false) }
  }

  return (
    <form className="edit-match" onSubmit={submit}>
      <fieldset className="modal-grid">
        <label>结果<select value={form.result} onChange={(event) => edit('result', event.target.value as MatchResult)}>{RESULT_OPTIONS.map((option) => <option key={option} value={option}>{RESULT_LABEL[option]}</option>)}</select></label>
        <label>结束时间<input value={form.endedAt} onChange={(event) => edit('endedAt', event.target.value)} placeholder="YYYY-MM-DDTHH:mm:ss" /></label>
        <label className="check-field"><input type="checkbox" checked={form.durationUnknown} onChange={(event) => edit('durationUnknown', event.target.checked)} />时长未知</label>
        <label>本局时长（分钟）<input type="number" min="0" step="0.1" value={form.durationMin} disabled={form.durationUnknown} onChange={(event) => edit('durationMin', event.target.value)} placeholder="如 12.5" /></label>
        <label>玩法模式<select value={form.mode} onChange={(event) => edit('mode', event.target.value)}><option value="">未知</option><option value="standard">标准博弈</option><option value="overclock">超频博弈</option></select></label>
        <label>段位变化<input type="number" step="1" value={form.rankChange} onChange={(event) => edit('rankChange', event.target.value)} placeholder="如 +1" /></label>
        <label>结算前段位<input value={form.rankBefore} onChange={(event) => edit('rankBefore', event.target.value)} placeholder="未知可留空" /></label>
        <label>结算后段位<input value={form.rankAfter} onChange={(event) => edit('rankAfter', event.target.value)} placeholder="未知可留空" /></label>
        <label>结算评级<input value={form.rating} onChange={(event) => edit('rating', event.target.value)} placeholder="未知可留空" /></label>
        <label>队伍生命<input type="number" min="0" step="1" value={form.squadHp} onChange={(event) => edit('squadHp', event.target.value)} placeholder="未知可留空" /></label>
        <div className="span2 season-tabs-field">
          <label>赛季</label>
          <div className="season-tabs" role="group" aria-label="这条记录所属赛季">
            {SEASONS.map((season) => (
              <button
                key={season.id}
                type="button"
                className={`season-tab ${form.season === season.id ? 'on' : ''}`}
                onClick={() => edit('season', season.id)}
              >{season.label}</button>
            ))}
            {form.season && !SEASONS.some((season) => season.id === form.season) && (
              <span className="season-tab custom on" title="历史记录里的自定义赛季名">{form.season}</span>
            )}
            {/* 允许清空赛季标注 */}
            {form.season && (
              <button type="button" className="season-tab clear" onClick={() => edit('season', '')}>清除</button>
            )}
          </div>
        </div>
        <label className="span2">阵容（角色）<input value={form.lineup} onChange={(event) => edit('lineup', event.target.value)} placeholder="多个用顿号或逗号分隔" /></label>
        <label className="span2">羁绊<input value={form.bonds} onChange={(event) => edit('bonds', event.target.value)} placeholder="羁绊名称，多个用顿号分隔（数量自己补，如 减益×2）" /></label>
        <label className="span2">备注<textarea rows={2} value={form.note} onChange={(event) => edit('note', event.target.value)} placeholder="可记录需要补充的信息" /></label>
      </fieldset>
      {error && <div className="inline-error" role="alert">{error}</div>}
      <div className="review-footer">
        <button className="tb-btn" type="button" onClick={onCancel} disabled={saving}>取消</button>
        <button className="primary-btn" type="submit" disabled={saving}>{saving ? '正在保存…' : '保存修改'}</button>
      </div>
    </form>
  )
}

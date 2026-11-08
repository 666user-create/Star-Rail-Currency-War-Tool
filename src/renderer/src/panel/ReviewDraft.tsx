import React, { useEffect, useState } from 'react'
import type { DraftInput, MatchResult, RecordingDraft } from '@shared/types'

export const RESULT_LABEL: Record<MatchResult, string> = {
  win: '胜利', loss: '失败', interrupted: '中断', suspected: '待核实'
}

export function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? `${fallback} ${error.message}` : fallback
}

export function ScreenshotPreview({ draftId, matchId, revision }: { draftId?: string; matchId?: number; revision?: string | number }) {
  const [image, setImage] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [zoomed, setZoomed] = useState(false)
  useEffect(() => {
    let alive = true
    setLoading(true)
    setImage(null)
    setError('')
    const request = draftId ? window.api.draftScreenshot(draftId) : window.api.matchScreenshot(matchId!)
    void request.then((url) => { if (alive) setImage(url) }).catch((reason) => {
      if (alive) setError(errorText(reason, '无法读取原图。'))
    }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [draftId, matchId, revision])
  return <div className="screenshot-preview">
    <div className="screenshot-heading"><span>结算原图</span>
      {image && <button className="tb-btn" type="button" aria-pressed={zoomed} onClick={() => setZoomed((value) => !value)}>{zoomed ? '适应窗口' : '放大原图'}</button>}
    </div>
    <div className={`image-frame ${zoomed ? 'zoomed' : ''}`}>
      {image ? <img src={image} alt="本局保存的结算截图" onError={() => { setImage(null); setError('图片无法显示，请重新截图或更换图片。') }} /> : <div className="image-empty">{loading ? '正在读取截图…' : error || (draftId ? '还没有截图，可选择一张本地结算截图。' : '这条记录未保存原图。')}</div>}
    </div>
  </div>
}

const localDateTime = (time: number): string => {
  const date = new Date(time)
  return new Date(time - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19)
}

const initialForm = (draft: RecordingDraft) => ({
  result: draft.fields.result,
  endedAt: localDateTime(draft.endedAt),
  durationUnknown: draft.durationSec == null,
  durationSec: draft.durationSec == null ? '' : String(draft.durationSec),
  mode: draft.fields.mode ?? '',
  rankBefore: draft.fields.rankBefore ?? '',
  rankAfter: draft.fields.rankAfter ?? '',
  rankChange: draft.fields.rankChange == null ? '' : String(draft.fields.rankChange),
  rating: draft.fields.rating ?? '',
  squadHp: draft.fields.squadHp == null ? '' : String(draft.fields.squadHp),
  lineup: draft.fields.lineup.join('、'),
  season: draft.fields.season,
  note: draft.fields.note ?? ''
})

type DraftAction = 'close' | 'recognize' | 'replace' | 'capture'
const ACTION_LABEL: Record<DraftAction, string> = { close: '稍后确认', recognize: '重新识别', replace: '换图', capture: '重新截图' }

export default function ReviewDraft({ draft, onClose, onUpdate, onSaved, onDiscarded }: {
  draft: RecordingDraft
  onClose: () => void
  onUpdate: (draft: RecordingDraft) => void
  onSaved: () => Promise<void>
  onDiscarded: () => Promise<void>
}) {
  const [form, setForm] = useState(() => initialForm(draft))
  const [operation, setOperation] = useState<'save' | 'recognize' | 'replace' | 'capture' | 'discard' | null>(null)
  const [error, setError] = useState('')
  const [imageRevision, setImageRevision] = useState(0)
  const [pendingAction, setPendingAction] = useState<DraftAction | null>(null)
  // 无关记录刷新不覆盖正在核对的表单；重新识别完成才更新识别字段。
  const draftVersion = JSON.stringify([draft.id, draft.fields, draft.endedAt, draft.durationSec, draft.status, draft.ocrText, draft.screenshotPath])
  useEffect(() => { setForm(initialForm(draft)); setPendingAction(null) }, [draftVersion])
  const busy = operation !== null || draft.status !== 'review'
  const locked = busy || pendingAction !== null
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm(draft))
  const missingFields = [
    form.result === 'suspected' && '胜负', !form.mode && '模式',
    !form.rankBefore.trim() && '结算前职级', !form.rankAfter.trim() && '结算后职级',
    !form.rankChange.trim() && '职级变化', !form.rating.trim() && '评分',
    !form.squadHp.trim() && '小队生命', !form.lineup.trim() && '阵容/羁绊',
    !form.season.trim() && '赛季', form.durationUnknown && '对局时长'
  ].filter(Boolean) as string[]
  const edit = <K extends keyof typeof form>(key: K, value: typeof form[K]) => setForm((previous) => ({ ...previous, [key]: value }))

  const reviseScreenshot = async (kind: 'recognize' | 'replace' | 'capture') => {
    if (busy) return
    setError('')
    setOperation(kind)
    try {
      const next = kind === 'recognize' ? await window.api.recognizeDraft(draft.id) : kind === 'capture' ? await window.api.captureDraft(draft.id) : await window.api.replaceDraftScreenshot(draft.id)
      onUpdate(next)
      setForm(initialForm(next))
      setImageRevision((revision) => revision + 1)
    } catch (reason) {
      setError(errorText(reason, kind === 'recognize' ? '重新识别失败，可手动填写。' : kind === 'capture' ? '重新截图失败，请重试或选择本地图片。' : '更换截图失败，请重试。'))
    } finally { setOperation(null) }
  }

  const runAction = (action: DraftAction) => {
    setPendingAction(null)
    if (action === 'close') onClose()
    else void reviseScreenshot(action)
  }
  const requestAction = (action: DraftAction) => {
    if (operation || (action !== 'close' && busy)) return
    if (dirty) { setPendingAction(action); return }
    runAction(action)
  }

  const confirm = async (event: React.FormEvent) => {
    event.preventDefault()
    if (locked) return
    setError('')
    const endedAt = new Date(form.endedAt).getTime()
    const duration = form.durationUnknown ? null : Number(form.durationSec)
    const rankChange = form.rankChange.trim() ? Number(form.rankChange) : null
    const squadHp = form.squadHp.trim() ? Number(form.squadHp) : null
    if (!Number.isFinite(endedAt)) { setError('请填写有效的结束时间。'); return }
    if (duration !== null && (!form.durationSec.trim() || !Number.isInteger(duration) || duration < 0)) { setError('时长请填写非负整数秒，或勾选「时长未知」。'); return }
    if (rankChange !== null && !Number.isInteger(rankChange)) { setError('段位变化请填写整数，可为负数；未知时留空。'); return }
    if (squadHp !== null && (!Number.isInteger(squadHp) || squadHp < 0)) { setError('队伍生命请填写非负整数；未知时留空。'); return }
    const input: DraftInput = {
      endedAt, durationSec: duration, result: form.result,
      mode: form.mode === 'standard' || form.mode === 'overclock' ? form.mode : null,
      rankBefore: form.rankBefore.trim() || null, rankAfter: form.rankAfter.trim() || null,
      rankChange, rating: form.rating.trim() || null, squadHp,
      lineup: [...new Set(form.lineup.split(/[,，、;；\n]/).map((value) => value.trim()).filter(Boolean))],
      season: form.season.trim(), note: form.note.trim() || null
    }
    setOperation('save')
    try {
      await window.api.confirmDraft(draft.id, input)
      await onSaved()
    } catch (reason) { setError(errorText(reason, '保存失败，草稿仍可继续核对。')) }
    finally { setOperation(null) }
  }

  const discard = async () => {
    if (busy) return
    setOperation('discard')
    setError('')
    try { await window.api.discardDraft(draft.id); await onDiscarded() }
    catch (reason) { setError(errorText(reason, '丢弃失败，请重试。')) }
    finally { setOperation(null) }
  }

  return <div className="modal-mask review-mask">
    <section className="modal review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title">
      <div className="modal-title"><div><h2 id="review-title">核对本局记录</h2><p className="muted">草稿不会计入统计，确认保存后才成为正式记录。</p></div><button className="tb-btn" type="button" disabled={!!operation || !!pendingAction} onClick={() => requestAction('close')}>稍后确认</button></div>
      <div className="review-body">
        <div className="review-original"><ScreenshotPreview key={`${draft.id}:${draft.screenshotPath}`} draftId={draft.id} revision={`${draft.status}:${imageRevision}`} />
          <div className="image-actions"><button className="tb-btn" type="button" disabled={locked} onClick={() => requestAction('capture')}>{operation === 'capture' ? '正在截图…' : '重新截图'}</button><button className="tb-btn" type="button" disabled={locked} onClick={() => requestAction('replace')}>{operation === 'replace' ? '正在选图…' : '换一张图'}</button><button className="tb-btn" type="button" disabled={locked || !draft.screenshotPath} onClick={() => requestAction('recognize')}>{operation === 'recognize' ? '识别中…' : '重新识别'}</button></div>
          <p className="field-hint">重新截图前请停留在结算界面；只截鼠标所在屏幕一帧，截图时暂时隐藏本工具，不会持续监屏。</p>
          <p className="field-hint">重新截图、换图或重新识别会替换未保存的字段修改；请先完成操作，再手动校正。</p>
          {draft.ocrText && <details className="ocr-text"><summary>查看识别文字</summary><pre>{draft.ocrText}</pre></details>}
        </div>
        <form id="review-form" className="review-form" onSubmit={(event) => void confirm(event)}>
          <div className="review-notice">请对照原图核对自动填写的内容，识别不确定的项目可修改或留空。</div>
          <div className="review-missing" role="status">{missingFields.length ? `尚未填写（可留空）：${missingFields.join('、')}` : '主要记录字段已填写，请核对后保存。'}</div>
          {draft.status !== 'review' && <div className="inline-status" role="status">{draft.status === 'capturing' ? '正在获取截图…' : '正在识别截图…'}</div>}
          {draft.error && <div className="inline-error">{draft.error} 你仍可更换截图或手动填写。</div>}
          {draft.warnings.length > 0 && <ul className="review-warnings">{draft.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
          <fieldset disabled={locked} className="review-fields">
            <label>对局结果<select value={form.result} onChange={(event) => edit('result', event.target.value as MatchResult)}>{Object.entries(RESULT_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>玩法模式<select value={form.mode} onChange={(event) => edit('mode', event.target.value)}><option value="">未知</option><option value="standard">标准博弈</option><option value="overclock">超频博弈</option></select></label>
            <label className="span2">结束时间<input type="datetime-local" step="1" value={form.endedAt} onChange={(event) => edit('endedAt', event.target.value)} required /></label>
            {draft.startedAt == null && <p className="field-hint span2 imported-time-hint">导入时间已暂填，请按实际对局时间修改。</p>}
            <div className="span2 duration-field"><label className="check-field"><input type="checkbox" checked={form.durationUnknown} onChange={(event) => edit('durationUnknown', event.target.checked)} />时长未知</label><label>本局时长（秒）<input type="number" min="0" step="1" value={form.durationSec} disabled={form.durationUnknown} onChange={(event) => edit('durationSec', event.target.value)} placeholder="未知时不必估算" /></label><p className="field-hint">导入截图通常无法还原时长，未知时长不参与总时长和平均时长统计。</p></div>
            <label>结算前段位<input value={form.rankBefore} onChange={(event) => edit('rankBefore', event.target.value)} placeholder="未知可留空" /></label>
            <label>结算后段位<input value={form.rankAfter} onChange={(event) => edit('rankAfter', event.target.value)} placeholder="未知可留空" /></label>
            <label>段位变化<input type="number" step="1" value={form.rankChange} onChange={(event) => edit('rankChange', event.target.value)} placeholder="例如 +1 / +2 / +3" /></label>
            <label>结算评级<input value={form.rating} onChange={(event) => edit('rating', event.target.value)} placeholder="未知可留空" /></label>
            <label>队伍生命<input type="number" min="0" step="1" value={form.squadHp} onChange={(event) => edit('squadHp', event.target.value)} placeholder="未知可留空" /></label>
            <label>赛季<input value={form.season} onChange={(event) => edit('season', event.target.value)} placeholder="未标注" /></label>
            <label className="span2">阵容 / 羁绊<input value={form.lineup} onChange={(event) => edit('lineup', event.target.value)} placeholder="可修改识别结果，多个名称用顿号或逗号分隔" /></label>
            <label className="span2">备注<textarea rows={2} value={form.note} onChange={(event) => edit('note', event.target.value)} placeholder="可记录需要补充核实的信息" /></label>
          </fieldset>
          {error && <div className="inline-error" role="alert">{error}</div>}
        </form>
      </div>
      {pendingAction && <div className="discard-edit-prompt" role="alert"><span>有尚未保存的手动修改。</span><button className="tb-btn" type="button" onClick={() => setPendingAction(null)}>继续核对</button><button className="tb-btn danger" type="button" onClick={() => runAction(pendingAction)}>放弃本次修改并{ACTION_LABEL[pendingAction]}</button></div>}
      <div className="review-footer"><button className="tb-btn danger" type="button" disabled={locked} onClick={() => void discard()}>{operation === 'discard' ? '正在丢弃…' : '丢弃草稿'}</button><span className="field-hint">更改在确认保存后写入；「待核实」不计胜负。</span><button className="primary-btn" type="submit" form="review-form" disabled={locked}>{operation === 'save' ? '正在保存…' : '确认并保存'}</button></div>
    </section>
  </div>
}

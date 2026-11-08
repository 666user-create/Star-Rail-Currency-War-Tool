import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { atomicReplace } from './atomicReplace.ts'
import type { RecordingDraft, RecordFields } from '@shared/types'

interface RecordingState {
  version: 1
  startedAt: number | null
  drafts: RecordingDraft[]
}

const RESTORE_WARNING = '上次截图或识别未完成，可重新识别或手动填写。'
const clone = <T>(value: T): T => structuredClone(value)
const validTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

function emptyFields(): RecordFields {
  return {
    result: 'suspected', lineup: [], bonds: [], rankChange: null, season: '', note: null,
    mode: null, rankBefore: null, rankAfter: null, rating: null, squadHp: null
  }
}

function atomicWrite(filePath: string, state: RecordingState): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${randomUUID()}.tmp`
  let descriptor: number | undefined
  try {
    descriptor = fs.openSync(temporary, 'wx')
    fs.writeFileSync(descriptor, JSON.stringify(state, null, 2), 'utf8')
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

function validateState(value: unknown): asserts value is RecordingState {
  const state = value as RecordingState | null
  if (!state || state.version !== 1 || (state.startedAt !== null && !validTime(state.startedAt)) || !Array.isArray(state.drafts)) {
    throw new Error('记录草稿文件损坏或版本不兼容，原文件未改动。')
  }
  const ids = new Set<string>()
  for (const draft of state.drafts) {
    if (!draft || typeof draft.id !== 'string' || !draft.id || ids.has(draft.id) ||
      !validTime(draft.createdAt) || !validTime(draft.endedAt) ||
      (draft.startedAt !== null && !validTime(draft.startedAt)) ||
      (draft.durationSec !== null && !validTime(draft.durationSec)) ||
      !['capturing', 'recognizing', 'review'].includes(draft.status) ||
      !['settlement', 'history', 'unknown'].includes(draft.pageKind) ||
      (draft.screenshotPath !== null && typeof draft.screenshotPath !== 'string') ||
      typeof draft.ocrText !== 'string' || !Array.isArray(draft.warnings) ||
      draft.warnings.some((warning) => typeof warning !== 'string') ||
      (draft.error !== null && typeof draft.error !== 'string') ||
      !draft.fields || !['win', 'loss', 'interrupted', 'suspected'].includes(draft.fields.result) ||
      !Array.isArray(draft.fields.lineup) || draft.fields.lineup.some((name) => typeof name !== 'string')) {
      throw new Error('记录草稿文件损坏，原文件未改动。')
    }
    ids.add(draft.id)
  }
}

/** 计时状态与待确认草稿独立持久化；任何操作均不删除截图文件。 */
export class RecordingStore {
  private filePath: string
  private state: RecordingState = { version: 1, startedAt: null, drafts: [] }

  constructor(filePath: string) {
    this.filePath = filePath
    if (!fs.existsSync(filePath)) return
    let stored: unknown
    try { stored = JSON.parse(fs.readFileSync(filePath, 'utf8')) }
    catch (error) { throw new Error('无法读取记录草稿，原文件未改动。', { cause: error }) }
    validateState(stored)
    this.state = clone(stored)
    const recovered = clone(stored)
    let changed = false
    for (const draft of recovered.drafts) {
      if (draft.status === 'review') continue
      changed = true
      draft.status = 'review'
      draft.error = RESTORE_WARNING
      if (!draft.warnings.includes(RESTORE_WARNING)) draft.warnings.push(RESTORE_WARNING)
    }
    if (changed) this.save(recovered)
  }

  private save(next: RecordingState): void {
    validateState(next)
    atomicWrite(this.filePath, next)
    this.state = clone(next)
  }

  getStartedAt(): number | null { return this.state.startedAt }

  start(now = Date.now()): number {
    if (this.state.startedAt !== null) return this.state.startedAt
    if (!validTime(now)) throw new Error('开始时间无效。')
    this.save({ ...this.state, startedAt: now })
    return now
  }

  end(now = Date.now(), season = ''): RecordingDraft | null {
    const startedAt = this.state.startedAt
    if (startedAt === null) return null
    if (!validTime(now)) throw new Error('结束时间无效。')
    const draft = this.makeDraft(Math.max(startedAt, now), startedAt)
    draft.fields.season = season.trim().slice(0, 80)
    // 自助截图模式：不自动截屏，直接进入待粘贴/待填写的核对状态
    draft.status = 'review'
    draft.warnings.push('计时已冻结；请截图后粘贴（Ctrl+V）或导入，也可直接手动填写。')
    // 冻结时间、生成草稿及停止秒表是一次原子变更；失败仍保持原计时。
    this.save({ ...this.state, startedAt: null, drafts: [...this.state.drafts, draft] })
    return clone(draft)
  }

  createImport(now = Date.now()): RecordingDraft {
    if (!validTime(now)) throw new Error('导入时间无效。')
    const draft = this.makeDraft(now, null)
    draft.warnings.push('导入截图没有开始计时，时长待补充。')
    this.save({ ...this.state, drafts: [...this.state.drafts, draft] })
    return clone(draft)
  }

  private makeDraft(now: number, startedAt: number | null): RecordingDraft {
    return {
      id: randomUUID(), createdAt: now, startedAt, endedAt: now,
      durationSec: startedAt === null ? null : Math.max(0, Math.round((now - startedAt) / 1000)),
      status: 'review', screenshotPath: null, fields: emptyFields(),
      pageKind: 'unknown', ocrText: '', warnings: [], error: null
    }
  }

  list(): RecordingDraft[] { return clone(this.state.drafts).sort((a, b) => b.createdAt - a.createdAt) }

  get(id: string): RecordingDraft | null {
    const draft = this.state.drafts.find((item) => item.id === id)
    return draft ? clone(draft) : null
  }

  update(id: string, patch: Partial<RecordingDraft>): RecordingDraft {
    const next = clone(this.state)
    const draft = next.drafts.find((item) => item.id === id)
    if (!draft) throw new Error('待确认记录不存在。')
    // id 与起止时间不可被识别结果或重试覆盖。
    for (const key of ['status', 'screenshotPath', 'pageKind', 'ocrText', 'warnings', 'error'] as const) {
      if (Object.hasOwn(patch, key)) Object.assign(draft, { [key]: clone(patch[key]) })
    }
    if (patch.fields) draft.fields = { ...draft.fields, ...clone(patch.fields) }
    this.save(next)
    return clone(draft)
  }

  remove(id: string): void {
    if (!this.state.drafts.some((draft) => draft.id === id)) return
    this.save({ ...this.state, drafts: this.state.drafts.filter((draft) => draft.id !== id) })
  }
}

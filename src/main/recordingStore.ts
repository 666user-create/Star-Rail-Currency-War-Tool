import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { atomicReplace } from './atomicReplace.ts'
import type { RecordingDraft, RecordFields } from '@shared/types'

interface RecordingState {
  version: 1
  startedAt: number | null
  /**
   * 已累计的计秒数（跨进程重启延续用）。
   *
   * 语义：startedAt 是"这一次运行内开始计时的时间戳"，
   * accumulatedSec 是"之前几次运行累计下来的秒数"。
   * 真正显示的时长 = accumulatedSec + (now - startedAt)。
   * 关闭软件时把当前这段折进 accumulatedSec，重启后重新用 now 起算，
   * 于是软件关着的那些时间不会被计入。
   */
  accumulatedSec?: number
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
      !draft.fields || !['win', 'loss', 'suspected'].includes(draft.fields.result) ||
      !Array.isArray(draft.fields.lineup) || draft.fields.lineup.some((name) => typeof name !== 'string')) {
      throw new Error('记录草稿文件损坏，原文件未改动。')
    }
    ids.add(draft.id)
  }
}

/** 计时状态与待确认草稿独立持久化；任何操作均不删除截图文件。 */
export class RecordingStore {
  private filePath: string
  private state: RecordingState = { version: 1, startedAt: null, accumulatedSec: 0, drafts: [] }

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

  /** 当前已累计秒数（不含正在跑的这一段） */
  getAccumulatedSec(): number { return this.state.accumulatedSec ?? 0 }

  /** 真实时长（秒）= 历史累计 + 本次运行已跑的时间 */
  elapsedSec(now = Date.now()): number {
    const base = this.state.accumulatedSec ?? 0
    if (this.state.startedAt === null) return base
    return base + Math.max(0, Math.round((now - this.state.startedAt) / 1000))
  }

  /**
   * 暂停计时：把当前这段折进 accumulatedSec，并清掉 startedAt。
   *
   * 退出软件时调用，记下"今天已经打了多久"。
   * 下次启动 resumeRunningTimer() 用 now - accumulatedSec 重建 startedAt，
   * 于是计时接着走，而软件关着的这段时间不会被算进去。
   */
  pauseRunningTimer(now = Date.now()): void {
    if (this.state.startedAt === null) return
    const base = this.state.accumulatedSec ?? 0
    const total = base + Math.max(0, Math.round((now - this.state.startedAt) / 1000))
    this.save({ ...this.state, startedAt: null, accumulatedSec: total })
  }

  /**
   * 恢复计时：把「已累计秒数」折算成 startedAt，让其自然继续。
   *
   * 做法是把 accumulatedSec 清零，同时把 startedAt 设成 `now - base`。
   * 这样 elapsedSec() 的公式 base + (now - startedAt) 里 base 是 0，
   * 结果正好是 `now - (now - base) = base`，不会重复累加。
   * （之前的实现既保留 accumulatedSec 又把它折进 startedAt，导致时长翻倍。）
   *
   * 返回恢复后的 startedAt，没有可恢复的计时则返回 null。
   */
  resumeRunningTimer(now = Date.now()): number | null {
    if (this.state.startedAt !== null) return this.state.startedAt
    const base = this.state.accumulatedSec ?? 0
    if (base <= 0) return null
    if (!validTime(now)) return null
    const startedAt = now - base * 1000
    if (startedAt < 0) return null
    // 关键：base 已经折进 startedAt，必须清零否则会双算
    this.save({ ...this.state, startedAt, accumulatedSec: 0 })
    return startedAt
  }

  /** 彻底丢弃计时（用户主动取消，不算进任何时长） */
  discardRunningTimer(): void {
    if (this.state.startedAt === null && (this.state.accumulatedSec ?? 0) === 0) return
    this.save({ ...this.state, startedAt: null, accumulatedSec: 0 })
  }

  /**
   * 清空全部：进行中的计时 + 所有待确认草稿。
   * 用于切换存档（换账号）—— 草稿和计时都属于当前账号，换账号后不该残留。
   */
  clearAll(): void {
    this.save({ version: 1, startedAt: null, accumulatedSec: 0, drafts: [] })
  }

  start(now = Date.now()): number {
    if (this.state.startedAt !== null) return this.state.startedAt
    if (!validTime(now)) throw new Error('开始时间无效。')
    // 新一局从 0 起算
    this.save({ ...this.state, startedAt: now, accumulatedSec: 0 })
    return now
  }

  end(now = Date.now(), season = ''): RecordingDraft | null {
    const startedAt = this.state.startedAt
    if (startedAt === null) return null
    if (!validTime(now)) throw new Error('结束时间无效。')
    /*
     * 草稿时长取「总计时长」（可能跨了多次运行）。
     * 但 startedAt 必须用真实的 this.state.startedAt：
     * 之前用 `now - totalSec` 反推，秒数取整会累积误差
     * （例如 start=1000、now=3100 会反推出 1100），
     * 让草稿里的开局时间偏掉。
     * 跨重启时 startedAt 本身就是"现在 - 已累计"，已经正确，
     * 不需要再动。
     */
    const totalSec = this.elapsedSec(now)
    const draft = this.makeDraft(now, startedAt)
    draft.durationSec = totalSec
    draft.fields.season = season.trim().slice(0, 80)
    // 自助截图模式：不自动截屏，直接进入待粘贴/待填写的核对状态
    draft.status = 'review'
    draft.warnings.push('计时已冻结；请截图后粘贴（Ctrl+V）或导入，也可直接手动填写。')
    // 冻结时间、生成草稿及停止秒表是一次原子变更；失败仍保持原计时。
    this.save({ ...this.state, startedAt: null, accumulatedSec: 0, drafts: [...this.state.drafts, draft] })
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

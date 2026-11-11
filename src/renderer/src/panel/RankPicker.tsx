import { RANKS, SUB_LEVELS, formatRank, parseRank, rankByCode } from '../../../shared/ranks'

interface RankPickerProps {
  /** 当前值（存的是显示文本，如「A5 紫金1」；也可能是历史自由文本） */
  value: string
  /** 选中变化；传空字符串表示「未填写」 */
  onChange: (value: string) => void
  /** 无障碍标签 */
  label: string
}

/**
 * 职级下拉框：大段位 A0–A8 + 小段位 1/2/3。
 *
 * 设计要点：
 * - 官方是「A5 紫金1」这种双段结构，所以拆成两个下拉，比手打省事也不容易填错。
 * - A8（财富造物主）按官方没有小段位，选到 A8 时小段位自动变灰。
 * - 历史数据可能是自由文本（「财富造物主50」），能解析就回填到两个下拉；
 *   解析不出来的原文保留在「原值」选项里，不让用户丢信息。
 * - 多一个「自定义」选项，保留手打任意文本的能力。
 */
export function RankPicker({ value, onChange, label }: RankPickerProps): React.JSX.Element {
  const trimmed = (value ?? '').trim()
  const parsed = parseRank(trimmed)
  const rank = parsed ? rankByCode(parsed.code) : null
  const isCustom = trimmed !== '' && parsed === null

  const selectedCode = isCustom ? '__custom__' : (parsed?.code ?? '')
  const selectedSub = parsed?.sub ?? 0
  const supportsSub = rank?.hasSubLevel ?? false

  const emit = (code: string, sub: number): void => {
    const next = formatRank({ code, sub })
    onChange(next)
  }

  return (
    <label>
      {label}
      <span className="rank-row">
        <select
          value={selectedCode}
          onChange={(event) => {
            const next = event.target.value
            if (next === '__custom__') { onChange(trimmed || ' '); return }
            if (next === '') { onChange(''); return }
            const nextRank = rankByCode(next)
            // 切到没有小段位的档（A8）时把 sub 归零
            emit(next, nextRank?.hasSubLevel ? (selectedSub || 1) : 0)
          }}
          aria-label={`${label}（大段位）`}
        >
          <option value="">未填写</option>
          {RANKS.map((item) => (
            <option key={item.code} value={item.code}>{item.code} {item.label}</option>
          ))}
          {isCustom && <option value="__custom__">原值：{trimmed}</option>}
          {!isCustom && <option value="__custom__">自定义…</option>}
        </select>
        <select
          value={supportsSub ? String(selectedSub || 1) : ''}
          disabled={!supportsSub}
          onChange={(event) => {
            const sub = Number(event.target.value)
            if (parsed) emit(parsed.code, sub)
          }}
          aria-label={`${label}（小段位）`}
          title={supportsSub ? '小段位' : '该职级没有小段位'}
        >
          {supportsSub
            ? SUB_LEVELS.map((n) => <option key={n} value={n}>{n}</option>)
            : <option value="">—</option>}
        </select>
      </span>
      {isCustom && (
        <input
          value={trimmed}
          onChange={(event) => onChange(event.target.value)}
          placeholder="如 财富造物主50"
          aria-label={`${label}（自定义）`}
        />
      )}
    </label>
  )
}

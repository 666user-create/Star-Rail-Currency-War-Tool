import { RANKS, matchRank } from '../../../shared/ranks'

interface RankPickerProps {
  /** 当前值（可能是历史自由文本，如「财富造物主50」） */
  value: string
  /** 选中变化；传空字符串表示「未填写」 */
  onChange: (value: string) => void
  /** 无障碍标签 */
  label: string
  /** 是否允许清空（默认 true） */
  allowClear?: boolean
}

/**
 * 职级下拉框。
 *
 * 设计要点：
 * - 官方是 A0–A8 共 9 档，直接下拉选，不用手打。
 * - 历史数据里可能是自由文本（「财富造物主50」），把它归一到最接近的档位显示，
 *   但**不覆盖原值**——只有用户主动改选才写入新值，避免静默改数据。
 * - 多一个「自定义」选项，保留用户填任意文本的老习惯。
 * - 当前值无法归类时，单独显示为「原值」选项，不让用户丢信息。
 */
export function RankPicker({ value, onChange, label, allowClear = true }: RankPickerProps): React.JSX.Element {
  const trimmed = (value ?? '').trim()
  const matched = matchRank(trimmed)
  // 下拉框选中项：能归一就用归一的 code，否则用特殊标记
  const selected = trimmed === '' ? '' : matched ? matched.code : '__custom__'
  const isCustom = trimmed !== '' && !matched

  return (
    <label>
      {label}
      <select
        value={selected}
        onChange={(event) => {
          const next = event.target.value
          if (next === '__custom__') {
            // 切到自定义：保留原文让用户自己改
            onChange(trimmed || ' ')
            return
          }
          onChange(next)
        }}
      >
        <option value="">未填写</option>
        {RANKS.map((rank) => (
          <option key={rank.code} value={rank.code}>{rank.full}</option>
        ))}
        {isCustom && <option value="__custom__">原值：{trimmed}</option>}
        {!isCustom && <option value="__custom__">自定义…</option>}
      </select>
      {selected === '__custom__' && (
        <input
          value={trimmed}
          onChange={(event) => onChange(event.target.value)}
          placeholder="如 财富造物主50"
          aria-label={`${label}（自定义）`}
        />
      )}
      {!allowClear && selected === '' && <span className="rank-hint">建议填写，方便统计升段</span>}
    </label>
  )
}

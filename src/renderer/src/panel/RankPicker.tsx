import { RANKS, formatRank, parseRank, rankByCode } from '../../../shared/ranks'

interface RankPickerProps {
  /** 当前值（存的是显示文本，如「A5 紫金1」；也可能是历史自由文本） */
  value: string
  /** 选中变化；传空字符串表示「未填写」 */
  onChange: (value: string) => void
  /** 无障碍标签 */
  label: string
}

/**
 * 职级输入：大段位下拉 + 小段位手填。
 *
 * 依据实际游戏界面（4.7 结算页只显示「A5 紫金1」这一个职级，不显示前后对比），
 * 所以：
 * - 大段位 A0–A8 是固定 9 档，做成下拉最省事。
 * - 小段位**每档上限不同**（实测资本帝王能到 7，紫金只到 3），
 *   所以不做固定下拉，改成手填任意数字，不会把用户限制在错误范围里。
 * - 「段位变化」单独手填（+1/+2/+3），不做自动推算——官方规则虽然公开了
 *   生命值对应提升级数，但跨大段时的进位规则没有可靠资料，算错不如不算。
 *
 * 历史数据可能是自由文本（「财富造物主50」），能解析就回填；
 * 解析不出来的原文保留在「原值」选项里，不让用户丢信息。
 */
export function RankPicker({ value, onChange, label }: RankPickerProps): React.JSX.Element {
  const trimmed = (value ?? '').trim()
  const parsed = parseRank(trimmed)
  const rank = parsed ? rankByCode(parsed.code) : null
  const isCustom = trimmed !== '' && parsed === null

  const selectedCode = isCustom ? '__custom__' : (parsed?.code ?? '')
  const subText = parsed && parsed.sub > 0 ? String(parsed.sub) : ''

  /** 大段位变化：保留已填的小段位（除非新段位明确没有小段位） */
  const changeCode = (next: string): void => {
    if (next === '__custom__') { onChange(trimmed || ' '); return }
    if (next === '') { onChange(''); return }
    const nextRank = rankByCode(next)
    const keepSub = nextRank?.hasSubLevel ? (parsed?.sub ?? 0) : 0
    onChange(formatRank({ code: next, sub: keepSub }))
  }

  /** 小段位变化：手填的数字，非法输入直接忽略（不写进值里） */
  const changeSub = (raw: string): void => {
    const text = raw.replace(/[^\d]/g, '').slice(0, 2)
    const sub = text === '' ? 0 : Number(text)
    if (parsed) onChange(formatRank({ code: parsed.code, sub }))
  }

  return (
    <label>
      {label}
      <span className="rank-row">
        <select
          value={selectedCode}
          onChange={(event) => changeCode(event.target.value)}
          aria-label={`${label}（大段位）`}
        >
          <option value="">未填写</option>
          {RANKS.map((item) => (
            <option key={item.code} value={item.code}>{item.code} {item.label}</option>
          ))}
          {isCustom && <option value="__custom__">原值：{trimmed}</option>}
          {!isCustom && <option value="__custom__">自定义…</option>}
        </select>
        <input
          value={subText}
          onChange={(event) => changeSub(event.target.value)}
          disabled={!rank?.hasSubLevel}
          placeholder="小段位"
          inputMode="numeric"
          aria-label={`${label}（小段位）`}
          title={rank?.hasSubLevel ? '小段位，可留空' : '该职级没有小段位'}
        />
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

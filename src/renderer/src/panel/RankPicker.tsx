import { RANKS, formatRank, maxSubLevel, parseRank, rankByCode } from '../../../shared/ranks'

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

  /** 大段位变化：保留已填的小段位（所有大段都允许有小段位） */
  const changeCode = (next: string): void => {
    if (next === '__custom__') { onChange(trimmed || ' '); return }
    if (next === '') { onChange(''); return }
    onChange(formatRank({ code: next, sub: parsed?.sub ?? 0 }))
  }

  /**
   * 小段位变化：手填数字，按该大段的官方档数夹住。
   * 档数表：A0-2=3 / A3=5 / A4=7 / A5-7=9 / A8=20。
   */
  const changeSub = (raw: string): void => {
    const text = raw.replace(/[^\d]/g, '').slice(0, 2)
    if (text === '') {
      if (parsed) onChange(formatRank({ code: parsed.code, sub: 0 }))
      return
    }
    const cap = parsed ? maxSubLevel(parsed.code) : Number.POSITIVE_INFINITY
    const sub = Math.min(Number(text), cap)
    if (parsed) onChange(formatRank({ code: parsed.code, sub }))
  }

  const subLimit = parsed ? maxSubLevel(parsed.code) : Number.POSITIVE_INFINITY
  const limited = Number.isFinite(subLimit)
  const atLimit = parsed != null && limited && parsed.sub >= subLimit

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
          disabled={!parsed}
          placeholder={limited ? `最多${subLimit}` : '小段位'}
          inputMode="numeric"
          aria-label={`${label}（小段位）`}
          title={
            !parsed ? '请先选大段位'
              : limited ? `${parsed.code} 共 ${subLimit} 档，超出会按 ${subLimit} 计算`
                : '小段位，可留空'
          }
        />
      </span>
      {atLimit && (
        <span className="rank-max-hint">已达上限（{parsed?.code} 满档 {subLimit}）</span>
      )}
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

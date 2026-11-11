/**
 * 职级提升推导。
 *
 * 官方规则（「标准博弈」模式）：
 * - 通关且小队生命值 ≥ 70 → 职级提升 +3
 * - 通关且小队生命值 ≥ 40 → 职级提升 +2
 * - 通关且小队生命值 < 40 → 职级提升 +1
 * - 对局失败 → 不降低职级（提升 0）
 *
 * 为什么用血量推导而不是让用户手填「职级变化」：
 * 手填容易错（实测误填过 +3），而血量是截图能直接识别出来的客观值，
 * 推导结果稳定且可复算。
 */

export interface RankProgressInput {
  /** 对局结果 */
  result: 'win' | 'loss' | 'interrupted' | 'suspected'
  /** 小队生命值；未知传 null */
  squadHp: number | null
}

/**
 * 从血量推导本局职级提升级数。
 * 非胜利或血量未知时返回 null（无法推导，调用方应跳过该点）。
 */
export function rankGainFromHp(input: RankProgressInput): number | null {
  const { result, squadHp } = input
  if (result !== 'win') return result === 'loss' ? 0 : null
  if (squadHp == null || !Number.isFinite(squadHp)) return null
  const hp = Math.max(0, squadHp)
  if (hp >= 70) return 3
  if (hp >= 40) return 2
  return 1
}

/**
 * 把一串对局的提升级数累加成曲线点。
 * 只包含能推导出提升值的对局（失败 +0 也算一个点，血量未知的跳过）。
 */
export function rankCurveFromMatches(
  matches: Array<{ endedAt: number; result: RankProgressInput['result']; squadHp: number | null }>
): Array<{ time: number; cumulative: number }> {
  let total = 0
  const points: Array<{ time: number; cumulative: number }> = []
  for (const match of matches) {
    const gain = rankGainFromHp({ result: match.result, squadHp: match.squadHp })
    if (gain === null) continue
    total += gain
    points.push({ time: match.endedAt, cumulative: total })
  }
  return points
}

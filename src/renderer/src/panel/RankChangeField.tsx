import { rankGainFromHp } from '../../../shared/rankProgress'

interface RankChangeFieldProps {
  result: string
  squadHp: string
}

/**
 * 段位变化：只读显示，由「小队生命值 + 胜负」自动推导。
 *
 * 官方规则：通关时生命≥70 升 3 级、≥40 升 2 级、<40 升 1 级；失败不掉段。
 * 之所以不再让用户手填：实测手填会出错（误填过 +3），而血量是截图能识别的客观值。
 */
export function RankChangeField({ result, squadHp }: RankChangeFieldProps): React.JSX.Element {
  const hp = squadHp.trim() === '' ? null : Number(squadHp)
  const gain = rankGainFromHp({
    result: (result === 'win' || result === 'loss' || result === 'interrupted' || result === 'suspected' ? result : 'suspected'),
    squadHp: hp != null && Number.isFinite(hp) ? hp : null
  })

  if (gain === null) {
    return <span className="rank-change-auto muted">需要先填小队生命值</span>
  }
  if (gain === 0) {
    return <span className="rank-change-auto">0（失败不掉段）</span>
  }
  return <span className="rank-change-auto">+{gain} 级（生命 {hp}）</span>
}

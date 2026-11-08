import test from 'node:test'
import assert from 'node:assert/strict'
import { validateDraftInput } from '../src/shared/recordingValidation.ts'

const input = () => ({ result: 'suspected', lineup: [], rankChange: null, season: '', note: null, mode: null, rankBefore: null, rankAfter: null, rating: null, squadHp: null, endedAt: 1760000000000, durationSec: null })

test('历史截图没有开始时间与时长时保留未知，不伪造零分钟', () => {
  assert.equal(validateDraftInput(input()).durationSec, null)
  assert.equal(validateDraftInput({ ...input(), durationSec: 0 }).durationSec, 0)
})

test('确认内容拒绝无效结果、数字、日期和结构，避免污染统计', () => {
  for (const patch of [ { result: 'SSS' }, { durationSec: NaN }, { durationSec: -1 }, { rankChange: 1.5 }, { endedAt: Infinity }, { endedAt: Date.now() + 172800000 }, { squadHp: -1 }, { lineup: '追击' }, { mode: 'guess' } ]) {
    assert.throws(() => validateDraftInput({ ...input(), ...patch }))
  }
})

test('确认时整理人工阵容文本，保留原图未显示字段为空', () => {
  const checked = validateDraftInput({ ...input(), result: 'win', lineup: [' 追击 ', '追击', '', '燃血'], rating: 'ss', rankBefore: '  ' })
  assert.deepEqual(checked.lineup, ['追击', '燃血'])
  assert.equal(checked.rating, 'SS')
  assert.equal(checked.rankBefore, null)
  assert.equal(checked.rankChange, null)
})

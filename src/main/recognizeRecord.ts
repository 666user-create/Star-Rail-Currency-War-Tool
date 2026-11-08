import path from 'node:path'
import { recognizeScreenshot } from './ocr'
import { recognizePortraits } from './portraitRecognition'
import { recognizeBonds } from './bondRecognition'
import type { OcrAnalysis } from '../shared/types'

/** 常见羁绊名：头像识别偶尔会把羁绊图标当成角色，出现这些名字要归到羁绊而非阵容。 */
const KNOWN_BONDS = new Set([
  '群攻', '银河学者', '星间旅人', '列车同行', '减益', '头号玩家', '领航员', '欢愉',
  '追击', '狼狩', '燃血', '战技点', '量子同频', '星核猎手', '仙舟', '存护', '同谐',
  '毁灭', '巡猎', '智识', '虚无', '丰饶', '记忆'
])

function looksLikeBond(label: string): boolean {
  const name = label.replace(/×\d+$/, '').trim()
  return /×\d+$/.test(label) || KNOWN_BONDS.has(name)
}

/** 文字和图标只在本机处理，在线请求仅用于首次取得公开静态模板。 */
export async function recognizeRecord(imagePath: string, cacheDir: string): Promise<OcrAnalysis> {
  const analysis = await recognizeScreenshot(imagePath)
  if (analysis.pageKind === 'unknown') return analysis
  const results = await Promise.allSettled([
    recognizePortraits(imagePath, path.join(cacheDir, 'portraits'), analysis.vision),
    recognizeBonds(imagePath, path.join(cacheDir, 'bonds'), analysis.vision)
  ])
  const labels: string[] = []
  const bondLabels: string[] = []
  const warnings = analysis.warnings.filter(warning => !warning.includes('角色头像和羁绊图标尚未识别'))
  const portraits = results[0]
  if (portraits.status === 'fulfilled') {
    for (const name of portraits.value.characters.map(character => character.name)) {
      // 防串：头像区若识别出羁绊特征的名字，归到羁绊而不是阵容
      if (looksLikeBond(name)) { if (!bondLabels.includes(name)) bondLabels.push(name) }
      else if (!labels.includes(name)) labels.push(name)
    }
    warnings.push(...portraits.value.warnings)
    if (!portraits.value.characters.length) warnings.push('未能可靠识别角色头像，请按原图补充阵容。')
    else if (portraits.value.complete === false && !portraits.value.warnings.length) warnings.push('角色识别可能不完整，请对照原图补充未识别的角色。')
  } else warnings.push('角色图标库暂不可用，文字结果已保留，可稍后重试或手动补充角色。')
  const bonds = results[1]
  if (bonds.status === 'fulfilled') {
    // 只取羁绊名称；数量不做识别，由用户按原图手填
    bondLabels.push(...bonds.value.bonds.map(bond => bond.name))
    warnings.push(...bonds.value.warnings)
    if (!bonds.value.bonds.length) warnings.push('未能可靠识别羁绊图标，请按原图补充羁绊名称。')
    else warnings.push('羁绊只识别了名称，数量请按原图手动补充。')
  } else warnings.push('羁绊图标库暂不可用，文字结果已保留，可稍后重试或手动补充羁绊。')
  return { ...analysis, fields: { ...analysis.fields, lineup: [...new Set(labels)], bonds: [...new Set(bondLabels)] }, warnings: [...new Set(warnings)] }
}

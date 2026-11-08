import path from 'node:path'
import { recognizeScreenshot } from './ocr'
import { recognizePortraits } from './portraitRecognition'
import { recognizeBonds } from './bondRecognition'
import type { OcrAnalysis } from '../shared/types'

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
    labels.push(...portraits.value.characters.map(character => character.name))
    warnings.push(...portraits.value.warnings)
    if (!portraits.value.characters.length) warnings.push('未能可靠识别角色头像，请按原图补充阵容。')
    else if (portraits.value.complete === false && !portraits.value.warnings.length) warnings.push('角色识别可能不完整，请对照原图补充未识别的角色。')
  } else warnings.push('角色图标库暂不可用，文字结果已保留，可稍后重试或手动补充角色。')
  const bonds = results[1]
  if (bonds.status === 'fulfilled') {
    bondLabels.push(...bonds.value.bonds.map(bond => `${bond.name}${bond.count == null ? '' : `×${bond.count}`}`))
    warnings.push(...bonds.value.warnings)
    if (!bonds.value.bonds.length) warnings.push('未能可靠识别羁绊图标，请按原图补充羁绊。')
    else if (bonds.value.complete === false) warnings.push('羁绊识别可能不完整，请核对名称和数量。')
    if (bonds.value.bonds.some(bond => bond.count == null)) warnings.push('部分羁绊数量未读出，已保留名称，请核对原图。')
  } else warnings.push('羁绊图标库暂不可用，文字结果已保留，可稍后重试或手动补充羁绊。')
  return { ...analysis, fields: { ...analysis.fields, lineup: [...new Set(labels)], bonds: [...new Set(bondLabels)] }, warnings: [...new Set(warnings)] }
}

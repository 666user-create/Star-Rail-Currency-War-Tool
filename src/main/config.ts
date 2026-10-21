import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import type { AppSettings } from '@shared/types'

const defaults: AppSettings = { gamePath: '' }

function file(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

export function loadSettings(): AppSettings {
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(file(), 'utf8')) }
  } catch {
    return { ...defaults }
  }
}

export function saveSettings(s: AppSettings): void {
  fs.writeFileSync(file(), JSON.stringify(s, null, 2), 'utf8')
}

import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import type { AppSettings } from '@shared/types'
import { normalizeSettings } from '../shared/petPreferences'

function file(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

export function loadSettings(): AppSettings {
  try {
    return normalizeSettings(JSON.parse(fs.readFileSync(file(), 'utf8')))
  } catch {
    return normalizeSettings(null)
  }
}

export function saveSettings(s: AppSettings): void {
  fs.writeFileSync(file(), JSON.stringify(s, null, 2), 'utf8')
}

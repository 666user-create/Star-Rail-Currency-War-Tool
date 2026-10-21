import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, Match, PetApi } from '../shared/types'

const api: PetApi = {
  listMatches: (limit?: number) => ipcRenderer.invoke('record:list', limit),
  getMatch: (id: number) => ipcRenderer.invoke('record:get', id),
  overview: () => ipcRenderer.invoke('stats:overview'),
  lineupStats: () => ipcRenderer.invoke('stats:lineups'),
  rankCurve: () => ipcRenderer.invoke('stats:rankCurve'),
  durationHistogram: () => ipcRenderer.invoke('stats:durationHist'),
  hourHistogram: () => ipcRenderer.invoke('stats:hourHist'),
  isRecording: () => ipcRenderer.invoke('record:isRecording'),
  recordStart: () => ipcRenderer.invoke('record:start'),
  recordEnd: () => ipcRenderer.invoke<Match | null>('record:end'),
  launchGame: () => ipcRenderer.invoke('game:launch'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke('settings:set', patch),
  sprite: () => ipcRenderer.invoke('pet:sprite'),
  officialModel: () => ipcRenderer.invoke('pet:officialModel'),
  panelToggle: () => ipcRenderer.send('panel:toggle'),
  petShape: (rects) => ipcRenderer.send('pet:shape', rects),
  settingsOpen: () => ipcRenderer.send('settings:open'),
  petDrag: (action) => ipcRenderer.send('pet:drag', action),
  quit: () => ipcRenderer.send('app:quit')
}

contextBridge.exposeInMainWorld('api', api)

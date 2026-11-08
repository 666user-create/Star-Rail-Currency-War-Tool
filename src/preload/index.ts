import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, DraftInput, PetApi, PetBubbleView, RecordingChange } from '../shared/types'

const api: PetApi = {
  listMatches: (limit?: number) => ipcRenderer.invoke('record:list', limit),
  getMatch: (id: number) => ipcRenderer.invoke('record:get', id),
  overview: () => ipcRenderer.invoke('stats:overview'),
  lineupStats: () => ipcRenderer.invoke('stats:lineups'),
  bondStats: () => ipcRenderer.invoke('stats:bonds'),
  rankCurve: () => ipcRenderer.invoke('stats:rankCurve'),
  durationHistogram: () => ipcRenderer.invoke('stats:durationHist'),
  hourHistogram: () => ipcRenderer.invoke('stats:hourHist'),
  isRecording: () => ipcRenderer.invoke('record:isRecording'),
  recordStart: () => ipcRenderer.invoke('record:start'),
  recordEnd: () => ipcRenderer.invoke('record:end'),
  listDrafts: () => ipcRenderer.invoke('draft:list'),
  importScreenshot: () => ipcRenderer.invoke('draft:import'),
  importClipboardImage: () => ipcRenderer.invoke('draft:paste'),
  canPasteImage: () => ipcRenderer.invoke('draft:can-paste'),
  recognizeDraft: (id: string) => ipcRenderer.invoke('draft:recognize', id),
  replaceDraftScreenshot: (id: string) => ipcRenderer.invoke('draft:replace', id),
  captureDraft: (id: string) => ipcRenderer.invoke('draft:capture', id),
  confirmDraft: (id: string, input: DraftInput) => ipcRenderer.invoke('draft:confirm', id, input),
  discardDraft: (id: string) => ipcRenderer.invoke('draft:discard', id),
  draftScreenshot: (id: string) => ipcRenderer.invoke('draft:image', id),
  matchScreenshot: (id: number) => ipcRenderer.invoke('record:image', id),
  onRecordsChanged: (listener) => {
    const handler = (): void => listener()
    ipcRenderer.on('records:changed', handler)
    return () => ipcRenderer.removeListener('records:changed', handler)
  },
  onRecordingChange: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, change: RecordingChange): void => listener(change)
    ipcRenderer.on('record:changed', handler)
    return () => ipcRenderer.removeListener('record:changed', handler)
  },
  launchGame: () => ipcRenderer.invoke('game:launch'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke('settings:set', patch),
  onSettingsChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, settings: AppSettings): void => listener(settings)
    ipcRenderer.on('settings:changed', handler)
    return () => ipcRenderer.removeListener('settings:changed', handler)
  },
  petVisibility: () => ipcRenderer.invoke('pet:visibility'),
  onPetVisibility: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, visible: boolean): void => listener(visible)
    ipcRenderer.on('pet:visibility', handler)
    return () => ipcRenderer.removeListener('pet:visibility', handler)
  },
  petHide: () => ipcRenderer.send('pet:hide'),
  petShow: () => ipcRenderer.send('pet:show'),
  sprite: () => ipcRenderer.invoke('pet:sprite'),
  officialModel: () => ipcRenderer.invoke('pet:officialModel'),
  panelToggle: () => ipcRenderer.send('panel:toggle'),
  petShape: (rects) => ipcRenderer.send('pet:shape', rects),
  petBubble: (content) => ipcRenderer.send('pet:bubble', content),
  bubbleView: () => ipcRenderer.invoke('bubble:view'),
  onBubbleView: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, view: PetBubbleView): void => listener(view)
    ipcRenderer.on('bubble:view', handler)
    return () => ipcRenderer.removeListener('bubble:view', handler)
  },
  bubbleMeasure: (height, revision) => ipcRenderer.send('bubble:measure', height, revision),
  petMenu: (open) => ipcRenderer.send('pet:menu', open),
  timerShape: (rect, startedAt) => ipcRenderer.send('timer:shape', rect, startedAt),
  settingsOpen: () => ipcRenderer.send('settings:open'),
  petDrag: (action) => ipcRenderer.send('pet:drag', action),
  quit: () => ipcRenderer.send('app:quit')
}

contextBridge.exposeInMainWorld('api', api)

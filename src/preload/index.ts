import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type { MenuCommand, PlanMeApi } from '@shared/types'

const subscribe = <T>(channel: string, callback: (value: T) => void): (() => void) => {
  const listener = (_event: IpcRendererEvent, value: T): void => callback(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: PlanMeApi = {
  getStartup: () => ipcRenderer.invoke('app:startup'),
  listBoards: () => ipcRenderer.invoke('boards:list'),
  createBoard: (name) => ipcRenderer.invoke('boards:create', name),
  openBoard: (path) => ipcRenderer.invoke('boards:open', path),
  renameBoard: (path, name) => ipcRenderer.invoke('boards:rename', path, name),
  trashBoard: (path) => ipcRenderer.invoke('boards:trash', path),
  revealBoard: (path) => ipcRenderer.invoke('boards:reveal', path),
  chooseRoot: () => ipcRenderer.invoke('boards:chooseRoot'),
  saveBoard: (path, request) => ipcRenderer.invoke('boards:save', path, request),
  setLastBoard: (path) => ipcRenderer.invoke('boards:setLast', path),
  ask: (question) => ipcRenderer.invoke('app:ask', question),
  importImages: (board, paths) => ipcRenderer.invoke('images:import', board, paths),
  importImageData: (board, name, data) => ipcRenderer.invoke('images:importData', board, name, data),
  copyImage: (from, src, to) => ipcRenderer.invoke('images:copy', from, src, to),
  chooseImages: () => ipcRenderer.invoke('images:choose'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  onMenuCommand: (callback) => subscribe<MenuCommand>('menu:command', callback),
  onFlush: (callback) =>
    subscribe<void>('app:flush', () => {
      void callback()
        .catch((err) => console.error(err))
        .finally(() => ipcRenderer.send('app:flushed'))
    })
}

contextBridge.exposeInMainWorld('api', api)

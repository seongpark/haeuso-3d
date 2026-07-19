'use strict';
const { contextBridge, ipcRenderer } = require('electron');

/* 렌더러(index.html)에는 Node 를 열어주지 않고, 필요한 것만 골라서 노출한다. */
contextBridge.exposeInMainWorld('haeuso', {
  isDesktop: true,
  platform: process.platform,

  // 저장: filePath 가 있으면 덮어쓰고, 없거나 asNew 면 저장 창을 띄운다
  save: (text, filePath, asNew) => ipcRenderer.invoke('file:save', { text, filePath, asNew: !!asNew }),
  open: () => ipcRenderer.invoke('file:open'),
  exportSTL: (text, name) => ipcRenderer.invoke('file:exportSTL', { text, name }),
  confirmDiscard: () => ipcRenderer.invoke('confirm:discard'),

  setTitle: (filePath, dirty) => ipcRenderer.send('title:set', { filePath, dirty }),
  saveResult: (ok) => ipcRenderer.send('file:saveResult', ok),   // 창 닫기 확인용

  onMenu: (cb) => ipcRenderer.on('menu:action', (_e, action) => cb(action)),
  onOpenFile: (cb) => ipcRenderer.on('file:opened', (_e, data) => cb(data)),
  ready: () => ipcRenderer.send('renderer:ready'),   // 리스너 등록이 끝났음을 알린다
});

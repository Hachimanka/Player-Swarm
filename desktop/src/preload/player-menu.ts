import { contextBridge, ipcRenderer } from 'electron';
import type { PlayerMenuAPI, PlayerMenuData } from '../shared/playerMenu';

// Self-contained sandbox preload: do not share runtime imports with other preloads.
const api: PlayerMenuAPI = {
    initial: () => ipcRenderer.invoke('player-menu:initial'),
    ready: (token) => ipcRenderer.send('player-menu:ready', token),
    choose: (token, action) => ipcRenderer.send('player-menu:choose', token, action),
    dismiss: (token) => ipcRenderer.send('player-menu:dismiss', token),
    submenu: (token, action, row, keyboard) => ipcRenderer.send('player-menu:submenu', token, action, row, keyboard),
    enter: (token) => ipcRenderer.send('player-menu:enter', token),
    back: (token) => ipcRenderer.send('player-menu:back', token),
    onBranch: (callback) => {
        const listener = (_event: Electron.IpcRendererEvent, action: string | null) => callback(action);
        ipcRenderer.on('player-menu:branch', listener);
        return () => ipcRenderer.removeListener('player-menu:branch', listener);
    },
    onFocus: (callback) => {
        const listener = (_event: Electron.IpcRendererEvent, action: string | null) => callback(action);
        ipcRenderer.on('player-menu:focus', listener);
        return () => ipcRenderer.removeListener('player-menu:focus', listener);
    },
    onUpdate: (callback) => {
        const listener = (_event: Electron.IpcRendererEvent, data: PlayerMenuData) => callback(data);
        ipcRenderer.on('player-menu:update', listener);
        return () => ipcRenderer.removeListener('player-menu:update', listener);
    },
};
contextBridge.exposeInMainWorld('playerMenu', api);
